import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { myPlayer } from "playroomkit";
import { PICKUP_RADIUS } from "../data/constants.js";

function prettyName(type) {
    switch (String(type)) {
        case "o2can": return "O₂ Canister";
        case "battery": return "Battery";
        case "fuel": return "Fuel Rod";
        case "food": return "Food";
        default: return (type || "Item").toString();
    }
}

function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

function TextSprite({
    text = "",
    width = 0.95,
    bg = "rgba(20,26,34,0.92)",
    fg = "#ffffff",
    accent = "#9cc8ff"
}) {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const x = 6, y = 50, w = canvas.width - 12, h = 92, r = 20;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + 20, y + 20, 8, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = fg;
        ctx.font = "600 48px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, y + h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
        return tex;
    }, [text, bg, fg, accent]);

    const aspect = 512 / 192;
    const height = width / aspect;

    return (
        <mesh>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
    );
}

function ItemMesh({ type = "crate" }) {
    switch (type) {
        case "food":
            return (<mesh><boxGeometry args={[0.35, 0.25, 0.35]} /><meshStandardMaterial color="#ff9f43" /></mesh>);
        case "battery":
            return (
                <group>
                    <mesh><cylinderGeometry args={[0.15, 0.15, 0.35, 12]} /><meshStandardMaterial color="#2dd4bf" /></mesh>
                    <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.06, 0.06, 0.1, 12]} /><meshStandardMaterial color="#0f172a" /></mesh>
                </group>
            );
        case "o2can":
            return (
                <group>
                    <mesh><cylinderGeometry args={[0.2, 0.2, 0.5, 14]} /><meshStandardMaterial color="#9bd1ff" /></mesh>
                    <mesh position={[0, 0.28, 0]}><boxGeometry args={[0.08, 0.12, 0.08]} /><meshStandardMaterial color="#1e293b" /></mesh>
                </group>
            );
        case "fuel":
            return (<mesh><boxGeometry args={[0.12, 0.6, 0.12]} /><meshStandardMaterial color="#a78bfa" /></mesh>);
        default:
            return (<mesh><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color="#9ca3af" /></mesh>);
    }
}

function canPickUp(it) {
    if (!it || it.holder) return false;
    const me = myPlayer?.();
    if (!me) return false;
    const px = Number(me.getState("x") || 0);
    const pz = Number(me.getState("z") || 0);
    const dx = px - it.x, dz = pz - it.z;
    return dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS;
}

// Re-reads the latest item by id each render so 'holder' hides floor copy immediately
function ItemEntity({ id }) {
    const { items } = useItemsSync();
    const it = (items || []).find(i => i.id === id);

    if (!it) return null;
    if (it.holder) return null; // ✅ held → don't render floor copy

    const actionable = canPickUp(it);
    const label = it.name || prettyName(it.type);

    return (
        <group position={[it.x, (it.y || 0) + 0.25, it.z]}>
            <ItemMesh type={it.type} />
            <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.35, 0.42, 24]} />
                <meshBasicMaterial color={actionable ? "#86efac" : "#64748b"} transparent opacity={actionable ? 0.85 : 0.4} />
            </mesh>
            <Billboard position={[0, 0.85, 0]}>
                <TextSprite text={actionable ? `Press P to pick up ${label}` : label} />
            </Billboard>
        </group>
    );
}

export default function ItemsAndDevices() {
    const { items } = useItemsSync();
    

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
                </group>
            ))}

            {/* Items */}
            {(items || []).map((it) => (
                   <ItemEntity key={`${it.id}:${it.holder || "free"}`} id={it.id} />
                 ))}
        </group>
    );
}
