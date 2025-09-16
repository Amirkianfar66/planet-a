// src/map/EditorCanvas.jsx
import React, { useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import {
    OUTSIDE_AREA, STATION_AREA, ROOMS,
    FLOOR, WALL_HEIGHT, walls, FLOORS, ROOFS,
} from "./deckA";
import { getMaterial } from "./materials";
import WorldBackdrop from "./editor/WorldBackdrop.jsx";

/* ---------- lightweight text label ---------- */
function TextLabel({
    text,
    position = [0, 0.01, 0],
    width = 6,
    color = "#cfe7ff",
    outline = "#0d1117",
}) {
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

/* ---------- deckA visual layer ---------- */
function DeckAVisuals() {
    const noRay = useMemo(() => ({ raycast: () => null }), []);
    const roomByKey = useMemo(() => Object.fromEntries(ROOMS.map(r => [r.key, r])), []);

    return (
        <group>
            {/* Global ground */}
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

            {/* Wire grid */}
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

            {/* Walls */}
            {walls.map((w, i) => {
                const r = roomByKey[w.room];
                const baseY = r?.floorY ?? 0;
                const h = w.h ?? WALL_HEIGHT;
                const mat = getMaterial("wall", w.mat || r?.wallMat);
                return (
                    <mesh {...noRay} key={`wall_${i}`} position={[w.x, baseY + h / 2, w.z]}>
                        <boxGeometry args={[w.w, h, w.d]} />
                        <primitive object={mat} attach="material" />
                    </mesh>
                );
            })}

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

            {/* Room labels */}
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

/* ---------- Editor Canvas: loads BOTH deckA + world.glb ---------- */
export default function EditorCanvas() {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 10, 16], fov: 50 }}
                gl={{ powerPreference: "high-performance" }}
            >
                <color attach="background" args={["#0b1220"]} />
                <ambientLight intensity={0.8} />
                <directionalLight position={[6, 12, 6]} intensity={1.1} castShadow />

                {/* GLB Backdrop with gizmo (transform is persisted by WorldBackdrop) */}
                <Suspense fallback={null}>
                    <WorldBackdrop
                        url="/models/world.glb"
                        show={true}
                        colorize={false}   // set true to tint/dim the GLB for clarity
                    />
                </Suspense>

                {/* deckA authored geometry (rooms/walls/floors/roofs) */}
                <DeckAVisuals />

                {/* Helpers */}
                <axesHelper args={[2]} />
                <OrbitControls makeDefault enableDamping />
            </Canvas>
        </div>
    );
}
