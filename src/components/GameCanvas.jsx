// src/components/GameCanvas.jsx
import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { isHost as prIsHost } from "playroomkit";

import {
    OUTSIDE_AREA, STATION_AREA, ROOMS,
    FLOOR, WALL_HEIGHT, walls
} from "../map/deckA";

import Players3D from "./Players3D.jsx";
import LocalController from "../systems/LocalController.jsx";
import ThirdPersonCamera from "../systems/ThirdPersonCamera.jsx";

// --- Toggle demo vs full system ---
const USE_DEMO = false;

// Demo (single networked item)
import SimplePickupDemo from "../world/SimplePickupDemo.jsx";

// Full system (host-authoritative items)
import ItemsAndDevices from "../world/ItemsAndDevices.jsx";
import ItemsHostLogic from "../systems/ItemsHostLogic.jsx";
import InteractionSystem from "../systems/InteractionSystem.jsx";

/* ---------- Canvas-text floor label ----------- */
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

/* ---------------- Floor, zones, walls ---------------- */
function FloorAndWalls() {
    const noRay = useMemo(() => ({ raycast: () => null }), []);

    return (
        <group>
            {/* Base floor */}
            <mesh {...noRay} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[FLOOR.w, FLOOR.d]} />
                <meshStandardMaterial color="#141a22" />
            </mesh>

            {/* Zones */}
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

            {/* Walls */}
            {walls.map((w, i) => (
                <mesh {...noRay} key={i} position={[w.x, WALL_HEIGHT / 2, w.z]}>
                    <boxGeometry args={[w.w, WALL_HEIGHT, w.d]} />
                    <meshStandardMaterial color="#3b4a61" />
                </mesh>
            ))}

            {/* Labels */}
            <TextLabel text="Outside" position={[OUTSIDE_AREA.x, 0.01, OUTSIDE_AREA.z]} width={8} color="#9fb6ff" />
            {ROOMS.map((r) => (
                <TextLabel
                    key={r.key}
                    text={r.name}
                    position={[r.x, 0.01, r.z]}
                    width={Math.min(r.w * 0.9, 8)}
                    color="#d6eaff"
                />
            ))}
        </group>
    );
}

/* ---------------- Root canvas + overlays ---------------- */
export default function GameCanvas({ dead = [] }) {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 8, 10], fov: 50 }}
                gl={{ powerPreference: "high-performance" }}
            >
                {/* Scene background */}
                <color attach="background" args={["#0b1220"]} />

                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 3]} intensity={1} />

                <FloorAndWalls />

                {/* Demo or Full system */}
                {USE_DEMO ? <SimplePickupDemo /> : <ItemsAndDevices />}

                <Players3D dead={dead} />
                <LocalController />
                <ThirdPersonCamera />
            </Canvas>

            {/* DOM overlays should NOT block canvas clicks */}
            {!USE_DEMO && (
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <InteractionSystem />
                    {/* If InteractionSystem renders interactive elements, give those nodes pointerEvents:'auto'. */}
                </div>
            )}

            {/* Non-visual host logic (host-only) */}
            {!USE_DEMO && prIsHost() && <ItemsHostLogic />}
        </div>
    );
}
