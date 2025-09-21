// src/components/GameCanvas.jsx
import React, { useMemo, useRef, useState, useEffect, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

// Map data
import {
    OUTSIDE_AREA, STATION_AREA, ROOMS, FLOOR, WALL_HEIGHT,
    walls, FLOORS, ROOFS, DOORS,
} from "../map/deckA";

// World + systems
import WorldGLB from "../world/WorldGLB.jsx";
import Players3D from "./Players3D.jsx";
import Pets3D from "./Pets3D.jsx";
import LocalController from "../systems/LocalController.jsx";
import ThirdPersonCamera from "../systems/ThirdPersonCamera.jsx";
import ItemsAndDevices from "../world/ItemsAndDevices.jsx";
import ItemsHostLogic from "../systems/ItemsHostLogic.jsx";
import InteractionSystem from "../systems/InteractionSystem.jsx";
import NetworkGunTracers from "../world/NetworkGunTracers.jsx";
import BeamLasers from "../world/BeamLasers.jsx";
import DeathMarkers from "../world/DeathMarkers.jsx";
import DeathSystem from "../systems/DeathSystem.jsx";
import CCTVViewer from "../systems/CCTVViewer.jsx";
import CCTVControlPanel from "../ui/CCTVControlPanel.jsx";
import { SlidingDoor as Door3D } from "../dev/SlidingDoorPreview";
import { getMaterial } from "../map/materials";

// ✅ Debug data sources
import useItemsSync from "../systems/useItemsSync.js";
import { INITIAL_ITEMS, DEVICES } from "../data/gameObjects.js";
import { isHost } from "playroomkit";

/* ---------- Simple label for rooms ---------- */
function TextLabel({ text, position = [0, 0.01, 0], width = 6, color = "#cfe7ff" }) {
    const { tex } = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024; canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(9,14,22,0.85)";
        const x = 12, y = 74, w = canvas.width - 24, h = 108, r = 28;
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        ctx.fillStyle = color;
        ctx.font = "700 88px system-ui, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, y + h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return { tex };
    }, [text, color]);

    return (
        <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, width / (1024 / 256)]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} />
        </mesh>
    );
}

/* ---------- Static level geometry ---------- */
function FloorAndWalls() {
    const noRay = { raycast: () => { } };

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

            {/* Walls */}
            {walls?.map((w, i) => {
                const mat = getMaterial("wall", w.mat);
                const h = w.h ?? WALL_HEIGHT;
                return (
                    <mesh key={`wall_${i}`} position={[w.x, (w.y ?? 0) + h / 2, w.z]} castShadow receiveShadow>
                        <boxGeometry args={[w.w, h, w.d]} />
                        <primitive object={mat} attach="material" />
                    </mesh>
                );
            })}

            {/* Doors */}
            <Suspense fallback={null}>
                {DOORS?.map((d, i) => (
                    <group key={`door_${i}`} position={[d.x, d.y, d.z]} rotation={[0, d.rotY || 0, 0]}>
                        <Door3D glbUrl="/models/door.glb" clipName="all" elevation={0.1}
                            doorWidth={d.w || 2.4} yaw={d.rotY || 0}
                            wallThickness={d.thickness ?? 0.6} collisionOpenThreshold={0.2} />
                    </group>
                ))}
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

/* ---------- In-scene gizmos for item positions ---------- */
function ItemGizmos({ show }) {
    const { items } = useItemsSync();
    const renderItems = (items && items.length) ? items : INITIAL_ITEMS;

    if (!show) return null;
    return (
        <group>
            {renderItems.map((it, idx) => (
                it && !it.holder && String(it.type).toLowerCase() !== "pet" ? (
                    <mesh key={`gizmo_${it.id ?? idx}`} position={[it.x, (it.y || 0) + 0.05, it.z]}>
                        <sphereGeometry args={[0.08, 12, 12]} />
                        <meshBasicMaterial wireframe transparent opacity={0.8} />
                    </mesh>
                ) : null
            ))}
        </group>
    );
}

/* ---------- DOM debug overlay ---------- */
function ItemsDebugOverlay({ showGizmos, setShowGizmos }) {
    const { items } = useItemsSync();
    const syncedCount = items?.length ?? 0;
    const source = syncedCount > 0 ? "synced" : "INITIAL_ITEMS";
    const host = isHost?.() ?? false;

    return (
        <div style={{
            position: "absolute", left: 10, bottom: 10, padding: "8px 10px",
            font: "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            color: "#cfe7ff", background: "rgba(9,14,22,0.75)",
            border: "1px solid #2a3a4f", borderRadius: 8, pointerEvents: "auto"
        }}>
            <div><b>Items (synced):</b> {syncedCount}</div>
            <div><b>Fallback (INITIAL_ITEMS):</b> {INITIAL_ITEMS?.length ?? 0}</div>
            <div><b>Renderer source:</b> {source}</div>
            <div><b>DEVICES:</b> {DEVICES?.length ?? 0}</div>
            <div><b>Host:</b> {String(host)}</div>
            <div style={{ marginTop: 6 }}>
                <label style={{ cursor: "pointer", userSelect: "none" }}>
                    <input
                        type="checkbox"
                        checked={showGizmos}
                        onChange={(e) => setShowGizmos(e.target.checked)}
                        style={{ marginRight: 6 }}
                    />
                    Show item gizmos (in-scene)
                </label>
            </div>
            <div style={{ opacity: 0.7, marginTop: 4 }}>
                Tip: press <b>F9</b> to toggle gizmos.
            </div>
        </div>
    );
}

/* ---------- GameCanvas ---------- */
export default function GameCanvas({ dead = [] }) {
    const [showGizmos, setShowGizmos] = useState(true);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "F9") setShowGizmos((v) => !v);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 6.5, 10], fov: 55 }}>
                {/* lighting */}
                <ambientLight intensity={0.6} />
                <directionalLight position={[6, 10, 6]} intensity={0.85} castShadow />

                {/* World + content */}
                <Suspense fallback={null}>
                    <WorldGLB />
                    <FloorAndWalls />
                    <ItemsAndDevices />
                    <ItemGizmos show={showGizmos} />
                    <Players3D dead={dead} />
                    <Pets3D />
                    <DeathMarkers />
                </Suspense>

                {/* Local systems */}
                <LocalController />
                <ThirdPersonCamera />
                <BeamLasers />
                <NetworkGunTracers />
                <CCTVViewer />
            </Canvas>

            {/* UI overlays (DOM) */}
            <InteractionSystem />
            <CCTVControlPanel />
            <ItemsDebugOverlay showGizmos={showGizmos} setShowGizmos={setShowGizmos} />

            {/* Host-only logic & gameplay systems */}
            <ItemsHostLogic />
            <DeathSystem />
        </div>
    );
}
