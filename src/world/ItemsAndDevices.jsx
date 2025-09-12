import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { isHost, myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS } from "../data/constants.js";

/* ---------- Type metadata (labels + colors) ---------- */
const TYPE_META = {
    food: { label: "Food", color: "#22c55e" }, // green
    fuel: { label: "Fuel", color: "#a855f7" }, // purple
    protection: { label: "Protection", color: "#f59e0b" }, // orange
    cure_red: { label: "Cure (Red)", color: "#ef4444" }, // red
    cure_blue: { label: "Cure (Blue)", color: "#3b82f6" }, // blue

    // legacy/compat (still render nicely if present)
    battery: { label: "Battery", color: "#2dd4bf" },
    o2can: { label: "O₂ Canister", color: "#9bd1ff" },
};

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
        case "food": // green lunch box
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

        case "fuel": // tall purple rod
            return (
                <mesh>
                    <boxGeometry args={[0.12, 0.6, 0.12]} />
                    <meshStandardMaterial color={color} />
                </mesh>
            );

        case "protection": // orange icosa “shield core”
            return (
                <mesh>
                    <icosahedronGeometry args={[0.22, 0]} />
                    <meshStandardMaterial color={color} metalness={0.2} roughness={0.4} />
                </mesh>
            );

        case "cure_red": // red vial
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

        case "cure_blue": // blue vial
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

        /* ----- legacy/compat so older items still show ----- */
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

        default: // neutral crate
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
    const t = TYPE_META[it.type];
    return it.name || t?.label || it.type || "Item";
}

/* ---------- Single floor item ---------- */
function ItemEntity({ it }) {
    if (!it || it.holder) return null;
    const actionable = canPickUp(it);
    const label = prettyLabel(it);

    return (
        <group position={[it.x, (it.y || 0) + 0.25, it.z]}>
            <ItemMesh type={it.type} />
            <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.35, 0.42, 24]} />
                <meshBasicMaterial
                    color={actionable ? "#86efac" : "#64748b"}
                    transparent
                    opacity={actionable ? 0.85 : 0.4}
                />
            </mesh>
            <Billboard position={[0, 0.85, 0]}>
                <TextSprite text={actionable ? `Press P to pick up ${label}` : label} />
            </Billboard>
        </group>
    );
}

/* ---------- Main scene block + TEST SPAWNER ---------- */
export default function ItemsAndDevices() {
    const { items, setItems } = useItemsSync();
    const floorItems = useMemo(() => (items || []).filter(i => !i.holder), [items]);

    // Host-only: ensure at least one of each test item is present
    useEffect(() => {
        if (!isHost()) return;
        const have = new Set((items || []).map(i => i.type));
        const needed = ["food", "fuel", "protection", "cure_red", "cure_blue"].filter(t => !have.has(t));
        if (needed.length === 0) return;

        const base = { holder: null, vx: 0, vy: 0, vz: 0, y: 0 };
        const placements = [
            [-6, -2], [-4, 1], [-1, 5], [2, 3], [5, -1],
        ];

        const toAdd = needed.map((t, i) => {
            const [x, z] = placements[i % placements.length];
            const label = TYPE_META[t]?.label || t;
            return { id: `test_${t}`, type: t, name: `${label} (Test)`, x, z, ...base };
        });

        setItems(prev => {
            const existingIds = new Set((prev || []).map(p => p.id));
            const filtered = toAdd.filter(n => !existingIds.has(n.id));
            return filtered.length ? [...(prev || []), ...filtered] : prev;
        }, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, setItems]);

    return (
        <group>
            {/* Devices */}
            {DEVICES.map(d => (
                <group key={d.id} position={[d.x, (d.y || 0) + 0.5, d.z]}>
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
            ))}

            {/* Floor items */}
            {floorItems.map(it => (
                <ItemEntity key={`${it.id}:${it.holder || "free"}`} it={it} />
            ))}
        </group>
    );
}
