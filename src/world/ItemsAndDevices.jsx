// src/world/ItemsAndDevices.jsx
import React, { useMemo, useCallback, useState } from "react";
import * as THREE from "three";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { myPlayer } from "playroomkit";
import { PICKUP_RADIUS } from "../data/constants.js";

/* ---------------- helpers ---------------- */

function prettyName(type) {
    switch (String(type)) {
        case "o2can": return "O₂ Canister";
        case "battery": return "Battery";
        case "fuel": return "Fuel Rod";
        case "food": return "Food";
        default: return (type || "Item").toString();
    }
}

function canPickUp(it) {
    if (!it || it.holder) return false;
    const me = myPlayer();
    const px = Number(me.getState("x") || 0);
    const pz = Number(me.getState("z") || 0);
    const dx = px - it.x, dz = pz - it.z;
    return dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS;
}

function sendAction(type, target, value = 0) {
    // Prefer your network helper if present
    try {
        const { requestAction } = require("../network/playroom");
        if (typeof requestAction === "function") {
            // eslint-disable-next-line no-console
            console.log(`[CLIENT] action=${type} target=${target} value=${value}`);
            requestAction(type, target, value);
            return;
        }
    } catch { }
    // Fallback: write to my player state
    const me = myPlayer();
    const nextId = Number(me.getState("reqId") || 0) + 1;
    me.setState("reqId", nextId, true);
    me.setState("reqType", String(type), true);
    me.setState("reqTarget", String(target), true);
    me.setState("reqValue", Number(value) || 0, true);
    // eslint-disable-next-line no-console
    console.log(`[CLIENT:FALLBACK] action=${type} target=${target} value=${value}`);
}

/* ---------- 3D text label via CanvasTexture ---------- */
function TextBillboard({ text, color = "#cfe7ff", outline = "#0d1117", width = 1.8, position = [0, 0.9, 0] }) {
    const { texture, aspect } = useMemo(() => {
        const cnv = document.createElement("canvas");
        cnv.width = 512; cnv.height = 160;
        const ctx = cnv.getContext("2d");
        ctx.clearRect(0, 0, cnv.width, cnv.height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // pill bg
        ctx.fillStyle = "rgba(20,26,34,0.82)";
        const w = cnv.width - 12, h = 120, x = 6, y = cnv.height / 2 - h / 2, r = 28;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        // outline + fill text
        ctx.font = "700 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.lineWidth = 12;
        ctx.strokeStyle = outline;
        ctx.strokeText(text, cnv.width / 2, cnv.height / 2 + 4);
        ctx.fillStyle = color;
        ctx.fillText(text, cnv.width / 2, cnv.height / 2 + 4);

        const tex = new THREE.CanvasTexture(cnv);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 2;
        return { texture: tex, aspect: cnv.width / cnv.height };
    }, [text, color, outline]);

    const h = width / (aspect || 4);
    return (
        <group position={position}>
            {/* billboard: copy camera quaternion via onBeforeRender */}
            <mesh
                onBeforeRender={(renderer, scene, camera, geometry, material, group) => {
                    // face camera
                    group.quaternion.copy(camera.quaternion);
                }}
            >
                <planeGeometry args={[width, h]} />
                <meshBasicMaterial map={texture} transparent depthWrite={false} />
            </mesh>
        </group>
    );
}

/* ---------------- 3D meshes ---------------- */

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

function DeviceMesh() {
    return (
        <group>
            <mesh><boxGeometry args={[1.1, 1.0, 0.6]} /><meshStandardMaterial color="#2c3444" /></mesh>
            <mesh position={[0, 0.3, 0.33]}><planeGeometry args={[0.8, 0.35]} /><meshBasicMaterial color="#8fb3ff" /></mesh>
        </group>
    );
}

/* ---------------- Item entity (3D-only interactions) ---------------- */

function ItemEntity({ it }) {
    const [hover, setHover] = useState(false);
    const label = it.name || prettyName(it.type);
    const actionable = canPickUp(it);

    const onEnter = useCallback(() => {
        setHover(true);
        document.body.style.cursor = "pointer";
    }, []);
    const onLeave = useCallback(() => {
        setHover(false);
        document.body.style.cursor = "";
    }, []);
    const onClick = useCallback((e) => {
        e.stopPropagation();
        // eslint-disable-next-line no-console
        console.log(`[CLIENT] clicking item "${label}" (${it.id}) actionable=${actionable}`);
        if (actionable) sendAction("pickup", it.id, 0);
    }, [it.id, label, actionable]);

    return (
        <group
            position={[it.x, (it.y || 0) + 0.25, it.z]}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            onClick={onClick}
        >
            <ItemMesh type={it.type} />
            <TextBillboard
                text={actionable ? `Pick up ${label}` : `${label} (too far)`}
                color={actionable ? "#b6f3c7" : "#cfe7ff"}
                width={2.1}
                position={[0, 0.9, 0]}
            />
            {/* subtle hover glow */}
            {hover && (
                <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.18, 0.32, 24]} />
                    <meshBasicMaterial color={actionable ? "#86efac" : "#93c5fd"} transparent opacity={0.6} />
                </mesh>
            )}
        </group>
    );
}

/* ---------------- main ---------------- */

export default function ItemsAndDevices() {
    const { items } = useItemsSync();

    return (
        <group>
            {/* Devices */}
            {DEVICES.map((d) => (
                <group key={d.id} position={[d.x, (d.y || 0) + 0.5, d.z]}>
                    <DeviceMesh />
                </group>
            ))}

            {/* Items on the floor only */}
            {items.filter((it) => !it.holder).map((it) => (
                <ItemEntity key={it.id} it={it} />
            ))}
        </group>
    );
}
