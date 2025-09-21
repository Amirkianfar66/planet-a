// src/world/ItemsAndDevices.jsx
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES, INITIAL_ITEMS, ITEM_TYPES } from "../data/gameObjects.js";
import { PICKUP_RADIUS } from "../data/constants.js";
import { OUTSIDE_AREA, pointInRect, clampToRect, MEETING_ROOM_AABB } from "../map/deckA";


const OUT_MARGIN = 0.75;

function ensureOutdoorPos(x, z) {
    if (pointInRect(OUTSIDE_AREA, x, z, OUT_MARGIN)) return { x, z };
    const c = clampToRect(OUTSIDE_AREA, x, z, OUT_MARGIN);
    return { x: c.x, z: c.z };
}

/* ---------- Type metadata (labels + colors) ---------- */
const TYPE_META = ITEM_TYPES;
const TANK_ACCEPTS = {
    food_tank: "food",
    fuel_tank: "fuel",
    protection_tank: "protection",
};
const isTankType = (t) => t === "food_tank" || t === "fuel_tank" || t === "protection_tank";

/* ---------- Billboard / Text sprite ---------- */
function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

function TextSprite({ text = "", width = 0.95 }) {
    const texture = useMemo(() => {
        const c = document.createElement("canvas"); c.width = 512; c.height = 192;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        const x = 6, y = 50, w = c.width - 12, h = 92, r = 20;

        // backdrop
        ctx.fillStyle = "rgba(20,26,34,0.92)";
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        // text
        ctx.fillStyle = "#fff";
        ctx.font = "600 48px system-ui, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, c.width / 2, y + h / 2);

        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return tex;
    }, [text]);

    const aspect = 512 / 192;
    return (
        <mesh>
            <planeGeometry args={[width, width / aspect]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
    );
}

/* ---------- Item meshes for each type ---------- */
function ItemMesh({ type = "crate" }) {
    const color = TYPE_META[type]?.color ?? "#9ca3af";

    switch (type) {
        case "food":
            return (
                <group>
                    <mesh>
                        <boxGeometry args={[0.36, 0.22, 0.30]} />
                        <meshStandardMaterial color={color} />
                    </mesh>
                    <mesh position={[0, 0.13, 0]}>
                        <boxGeometry args={[0.38, 0.02, 0.32]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                </group>
            );

        case "fuel":
            return (
                <mesh>
                    <boxGeometry args={[0.12, 0.6, 0.12]} />
                    <meshStandardMaterial color={color} />
                </mesh>
            );

        case "protection":
            return (
                <mesh>
                    <icosahedronGeometry args={[0.22, 0]} />
                    <meshStandardMaterial color={color} metalness={0.2} roughness={0.4} />
                </mesh>
            );

        case "cure_red":
        case "cure_blue":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.12, 0.12, 0.34, 18]} />
                        <meshStandardMaterial color={color} />
                    </mesh>
                    <mesh position={[0, 0.20, 0]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.12, 18]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                </group>
            );

        // Tanks: same big barrel mesh for all three tank types
        case "cctv":
                        // small wall/ceiling pod with lens
                            return (
                                    <group>
                                            {/* base mount */}
                                            <mesh>
                                                    <cylinderGeometry args={[0.07, 0.07, 0.05, 12]} />
                                                    <meshStandardMaterial color="#4b5563" metalness={0.4} roughness={0.4} />
                                                </mesh>
                                            {/* camera head */}
                                            <mesh position={[0, 0, 0.14]}>
                                                    <boxGeometry args={[0.16, 0.12, 0.22]} />
                                                    <meshStandardMaterial color={color} metalness={0.2} roughness={0.6} />
                                                </mesh>
                                            {/* lens */}
                                            <mesh position={[0, 0, 0.27]}>
                                                    <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
                                                    <meshStandardMaterial emissive="#22d3ee" emissiveIntensity={0.8} />
                                                </mesh>
                                        </group>
                                );
        case "food_tank":
        case "fuel_tank":
        case "protection_tank":
            return (
                <group scale={[4, 4, 4]}>
                    <mesh>
                        <cylinderGeometry args={[0.22, 0.22, 0.34, 20]} />
                        <meshStandardMaterial color={color} metalness={0.2} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 0.19, 0]}>
                        <cylinderGeometry args={[0.23, 0.23, 0.03, 20]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                    <mesh position={[0, -0.19, 0]}>
                        <cylinderGeometry args={[0.21, 0.21, 0.02, 20]} />
                        <meshStandardMaterial color="#0b1220" />
                    </mesh>
                </group>
            );

        /* legacy */
        case "battery":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.15, 0.15, 0.35, 12]} />
                        <meshStandardMaterial color={TYPE_META.battery.color} />
                    </mesh>
                    <mesh position={[0, 0.2, 0]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                </group>
            );

        case "o2can":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.2, 0.2, 0.5, 14]} />
                        <meshStandardMaterial color={TYPE_META.o2can.color} />
                    </mesh>
                    <mesh position={[0, 0.28, 0]}>
                        <boxGeometry args={[0.08, 0.12, 0.08]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                </group>
            );

        default:
            return (
                <mesh>
                    <boxGeometry args={[0.3, 0.3, 0.3]} />
                    <meshStandardMaterial color="#9ca3af" />
                </mesh>
            );
    }
}

/* ---------- Helpers ---------- */
function canPickUp(it) {
    const me = myPlayer?.(); if (!me) return false;
    const px = Number(me.getState("x") || 0);
    const pz = Number(me.getState("z") || 0);
    const dx = px - it.x, dz = pz - it.z;
    return dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS;
}

function prettyLabel(it) {
    if (isTankType(it?.type)) {
        const stored = Number(it.stored ?? 0);
        const cap = Number(it.cap ?? 6);
        const base = it.name || TYPE_META[it.type]?.label || "Tank";
        return `${base} (${stored}/${cap})`;
    }
    const t = TYPE_META[it.type];
    return it.name || t?.label || it.type || "Item";
}

/* ---------- Single floor item ---------- */
function ItemEntity({ it }) {
    if (!it || it.holder) return null;
    if (it.type === "pet") return null; // Pets handled by Pets3D
    const actionable = canPickUp(it);
    const label = prettyLabel(it);

    // Defaults for ordinary items
    let prompt = actionable ? `Press P to pick up ${label}` : label;
    let ringColor = actionable ? "#86efac" : "#64748b";
    let ringScale = 1;
    let billboardY = 0.85;
    let rotationY = 0;
    // CCTV: face the direction it was placed
        if (it.type === "cctv") {
                rotationY = Number(it.yaw || 0);
                // Optional: adjust prompt (you can keep the default if you prefer)
                    prompt = actionable ? "Press P to pick up CCTV Camera" : "CCTV Camera";
            }
    // Special UX for tanks (non-pickable; press P to add matching item)
    if (isTankType(it.type)) {
        const me = myPlayer?.();
        const bp = (me?.getState?.("backpack") || []);
        const want = TANK_ACCEPTS[it.type]; // "food" | "fuel" | "protection"
        const hasWanted = bp.some(b => String(b.type).toLowerCase() === want);

        const stored = Number(it.stored ?? 0);
        const cap = Number(it.cap ?? 6);
        const full = stored >= cap;

        const labelWanted = (TYPE_META[want]?.label || want).toLowerCase();
        const canLoad = actionable && hasWanted && !full;

        prompt =
            !actionable ? label :
                full ? "Tank full" :
                    !hasWanted ? `No ${labelWanted} in backpack` :
                        `Press P to add ${TYPE_META[want]?.label || want}`;

        ringColor = canLoad ? "#86efac" : "#64748b";
        ringScale = 4;     // match the 4x tank scale
        billboardY = 1.7;  // lift the label above the tall tank
    }

    return (
        <group position={[it.x, (it.y || 0) + 0.25, it.z]} rotation={[0, rotationY, 0]}>
            <ItemMesh type={it.type} />

            {/* Ground ring (scaled for tanks) */}
            <group scale={[ringScale, 1, ringScale]}>
                <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.35, 0.42, 24]} />
                    <meshBasicMaterial color={ringColor} transparent opacity={actionable ? 0.85 : 0.4} />
                </mesh>
            </group>

            {/* Floating prompt */}
            <Billboard position={[0, billboardY, 0]}>
                <TextSprite text={prompt} />
            </Billboard>
        </group>
    );
}

/* ---------- Main scene block (render-only) ---------- */
export default function ItemsAndDevices() {
    const { items } = useItemsSync();
    // Pets are rendered in <Pets3D />, so exclude them here.
    const floorItems = useMemo(
        () => (items || []).filter((i) => !i.holder && String(i.type).toLowerCase() !== "pet"),
           [items]
             );

    return (
        <group>
            {/* Devices */}
            {DEVICES.map((d) => {
                const { x, z } = ensureOutdoorPos(d.x ?? 0, d.z ?? 0);
                const y = (d.y || 0) + 0.5;
                return (
                    <group key={d.id} position={[x, y, z]}>
                        <mesh>
                            <boxGeometry args={[1.1, 1.0, 0.6]} />
                            <meshStandardMaterial color="#2c3444" />
                        </mesh>

                        <mesh position={[0, 0.3, 0.33]}>
                            <planeGeometry args={[0.8, 0.35]} />
                            <meshBasicMaterial color="#8fb3ff" />
                        </mesh>

                        <Billboard position={[0, 0.9, 0]}>
                            <TextSprite text={d.label || d.type || d.id} width={1.1} />
                        </Billboard>
                    </group>
                );
            })}

            {/* Floor items */}
            {floorItems.map((it) => (
                <ItemEntity key={`${it.id}:${it.holder || "free"}`} it={it} />
            ))}
        </group>
    );

}
