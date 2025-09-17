// src/components/GameCanvas.jsx
import React, { useMemo, Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

import {
    OUTSIDE_AREA, STATION_AREA, ROOMS,
    FLOOR, WALL_HEIGHT, walls, FLOORS, ROOFS,
    DOORS,
} from "../map/deckA";

import WorldGLB, { WORLD_GLB } from "../world/WorldGLB.jsx";
import Players3D from "./Players3D.jsx";
import LocalController from "../systems/LocalController.jsx";
import ThirdPersonCamera from "../systems/ThirdPersonCamera.jsx";
import ItemsAndDevices from "../world/ItemsAndDevices.jsx";
import ItemsHostLogic from "../systems/ItemsHostLogic.jsx";
import InteractionSystem from "../systems/InteractionSystem.jsx";
import NetworkGunTracers from "../world/NetworkGunTracers.jsx";
import BeamLasers from "../world/BeamLasers.jsx";
import DeathMarkers from "../world/DeathMarkers.jsx";
import DeathSystem from "../systems/DeathSystem.jsx";
import { getMaterial } from "../map/materials";

// Uses the enhanced door component (supports single GLB w/ animation)
import { SlidingDoor as Door3D } from "../dev/SlidingDoorPreview";

// ---------- helper: read player world position (set this from your controller) ----------
function usePlayerPosFromWindow() {
    const ref = useRef(null);
    useFrame(() => {
        const g = (typeof window !== "undefined" && window.__playerPos) || null;
        if (Array.isArray(g) && g.length === 3) ref.current = g;
    });
    return ref.current;
}

// ---------- label ----------
function TextLabel({ text, position = [0, 0.01, 0], width = 6, color = "#cfe7ff", outline = "#0d1117" }) {
    const { texture, aspect } = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024; canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "bold 120px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 18;
        ctx.strokeStyle = outline;
        ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = color;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return { texture: tex, aspect: canvas.width / canvas.height };
    }, [text, color, outline]);

    const h = width / (aspect || 4);
    const noRay = useMemo(() => ({ raycast: () => null }), []);

    return (
        <mesh {...noRay} position={position} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, h]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
    );
}

// ---------- scene ----------
function FloorAndWalls() {
    const noRay = useMemo(() => ({ raycast: () => null }), []);
    const roomByKey = useMemo(() => Object.fromEntries(ROOMS.map((r) => [r.key, r])), []);
    const playerPos = usePlayerPosFromWindow();

    return (
        <group>
            {/* Ground */}
            <mesh {...noRay} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[FLOOR.w, FLOOR.d]} />
                <meshStandardMaterial color="#141a22" />
            </mesh>

            {/* Area tints */}
            <mesh {...noRay} position={[OUTSIDE_AREA.x, 0.002, OUTSIDE_AREA.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[OUTSIDE_AREA.w, OUTSIDE_AREA.d]} />
                <meshStandardMaterial color="#0e1420" opacity={0.9} transparent />
            </mesh>
            <mesh {...noRay} position={[STATION_AREA.x, 0.003, STATION_AREA.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[STATION_AREA.w, STATION_AREA.d]} />
                <meshStandardMaterial color="#1b2431" opacity={0.95} transparent />
            </mesh>

            {/* Grid */}
            <mesh {...noRay} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
                <planeGeometry args={[FLOOR.w, FLOOR.d, 20, 12]} />
                <meshBasicMaterial wireframe transparent opacity={0.12} />
            </mesh>

            {/* Floors */}
            {FLOORS?.map((f, i) => {
                const mat = getMaterial("floor", f.mat);
                return (
                    <mesh key={`floor_${i}`} position={[f.x, f.y, f.z]} receiveShadow>
                        <boxGeometry args={[f.w, f.t, f.d]} />
                        <primitive object={mat} attach="material" />
                    </mesh>
                );
            })}

            {/* Walls (already split in deckA) */}
            {walls.map((w, i) => {
                const r = roomByKey[w.room];
                const baseY = r?.floorY ?? 0;
                const h = w.h ?? WALL_HEIGHT;
                const mat = getMaterial("wall", w.mat || r?.wallMat);
                return (
                    <mesh
                        {...noRay}
                        key={`wall_${i}`}
                        position={[w.x, baseY + h / 2, w.z]}
                        rotation={[0, w.rotY || 0, 0]}
                    >
                        <boxGeometry args={[w.w, h, w.d]} />
                        <primitive object={mat} attach="material" />
                    </mesh>
                );
            })}

            {/* Doors (GLB with animation). Wrapped in Suspense for async loads */}
            <Suspense fallback={null}>
                {DOORS?.map((d, i) => {
                    const useProx = d.useProximity !== false; // default true from deckA
                    return (
                        <group key={`door_${d.id || i}`} position={[d.x, d.y, d.z]} rotation={[0, d.rotY || 0, 0]}>
                            <Door3D
                                // single animated GLB
                                glbUrl={d.glbUrl || "/models/door.glb"}
                                clipName={d.clipName || "Open"}

                                // geometry/looks
                                doorWidth={d.width ?? 2.4}
                                doorHeight={d.height ?? 2.4}
                                thickness={d.thickness ?? 0.3}
                                panels={d.panels ?? 2}
                                seam={0.02}
                                slideSlope={0.1}

                                // behavior
                                playerPosition={useProx ? playerPos : null}
                                triggerRadius={d.triggerRadius ?? 3}
                                open={useProx ? undefined : (d.open ?? 0)}
                                openSpeed={6}
                                closeSpeed={4}
                            />
                        </group>
                    );
                })}
            </Suspense>

            {/* Roofs */}
            {ROOFS?.map((rf, i) => {
                const mat = getMaterial("roof", rf.mat);
                return (
                    <mesh key={`roof_${i}`} position={[rf.x, rf.y, rf.z]}>
                        <boxGeometry args={[rf.w, rf.t, rf.d]} />
                        <primitive object={mat} attach="material" />
                    </mesh>
                );
            })}

            {/* Labels */}
            <TextLabel text="Outside" position={[OUTSIDE_AREA.x, 0.01, OUTSIDE_AREA.z]} width={8} color="#9fb6ff" />
            {ROOMS.map((r) => (
                <TextLabel
                    key={r.key}
                    text={r.name}
                    position={[r.x, (r.floorY ?? 0) + 0.01, r.z]}
                    width={Math.min(r.w * 0.9, 8)}
                    color="#d6eaff"
                />
            ))}
        </group>
    );
}

export default function GameCanvas({ dead = [] }) {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 8, 10], fov: 50 }}
                gl={{ powerPreference: "high-performance" }}
            >
                <color attach="background" args={["#0b1220"]} />
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 3]} intensity={1} />

                <Suspense fallback={null}>
                    {WORLD_GLB?.enabled && WORLD_GLB?.url && (
                        <WorldGLB
                            url={WORLD_GLB.url}
                            position={WORLD_GLB.position || [0, 0, 0]}
                            rotationYDeg={WORLD_GLB.rotationYDeg || 0}
                            scale={WORLD_GLB.scale || 1}
                        />
                    )}
                </Suspense>

                <FloorAndWalls />

                {/* Items & players */}
                <ItemsAndDevices />
                <Players3D dead={dead} />

                {/* Death FX */}
                <DeathMarkers />

                {/* Local systems */}
                <LocalController />
                <ThirdPersonCamera />
                <BeamLasers />
                <NetworkGunTracers />
            </Canvas>

            {/* Input overlay (non-blocking) */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <InteractionSystem />
            </div>

            {/* Host-only logic */}
            <ItemsHostLogic />

            {/* Death logic */}
            <DeathSystem />
        </div>
    );
}
