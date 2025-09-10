// src/world/ItemsAndDevices.jsx
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { myPlayer } from "playroomkit";
import { PICKUP_RADIUS } from "../data/constants.js";

function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef(); const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

function TextSprite({ text = "", width = 0.95 }) {
    const tex = useMemo(() => {
        const c = document.createElement("canvas"); c.width = 512; c.height = 192;
        const ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width, c.height);
        const x = 6, y = 50, w = c.width - 12, h = 92, r = 20;
        ctx.fillStyle = "rgba(20,26,34,0.92)"; ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "600 48px system-ui, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, c.width / 2, y + h / 2);
        const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.anisotropy = 4; return t;
    }, [text]);
    const aspect = 512 / 192;
    return <mesh><planeGeometry args={[width, width / aspect]} /><meshBasicMaterial map={tex} transparent depthWrite={false} /></mesh>;
}

function ItemMesh({ type = "battery" }) {
    return (
        <group>
            <mesh><cylinderGeometry args={[0.15, 0.15, 0.35, 12]} /><meshStandardMaterial color="#2dd4bf" /></mesh>
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.06, 0.06, 0.1, 12]} /><meshStandardMaterial color="#0f172a" /></mesh>
        </group>
    );
}

function canPickUp(it) {
    const me = myPlayer?.(); if (!me) return false;
    const px = Number(me.getState("x") || 0), pz = Number(me.getState("z") || 0);
    const dx = px - it.x, dz = pz - it.z;
    return dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS;
}

// child re-reads live state by id (hard guard)
function ItemEntity({ id }) {
    const { items } = useItemsSync();
    const it = (items || []).find(i => i.id === id);
    if (!it || it.holder) return null;
    const actionable = canPickUp(it);
    return (
        <group position={[it.x, (it.y || 0) + 0.25, it.z]} visible>
            <ItemMesh type={it.type} />
            <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.35, 0.42, 24]} />
                <meshBasicMaterial color={actionable ? "#86efac" : "#64748b"} transparent opacity={actionable ? 0.85 : 0.4} />
            </mesh>
            <Billboard position={[0, 0.85, 0]}>
                <TextSprite text={actionable ? "Press P to pick up" : "Too far"} />
            </Billboard>
        </group>
    );
}

export default function ItemsAndDevices() {
    const { items } = useItemsSync();
    const floorItems = useMemo(() => (items || []).filter(i => !i.holder), [items]);
    return (
        <group>
            {DEVICES.map(d => (
                <group key={d.id} position={[d.x, (d.y || 0) + 0.5, d.z]}>
                    <mesh><boxGeometry args={[1.1, 1.0, 0.6]} /><meshStandardMaterial color="#2c3444" /></mesh>
                    <mesh position={[0, 0.3, 0.33]}><planeGeometry args={[0.8, 0.35]} /><meshBasicMaterial color="#8fb3ff" /></mesh>
                </group>
            ))}
            {floorItems.map(it => <ItemEntity key={`${it.id}:${it.holder || "free"}`} id={it.id} />)}
        </group>
    );
}
