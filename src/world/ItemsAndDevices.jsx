import React, { useRef } from "react";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { myPlayer } from "playroomkit";
import { PICKUP_RADIUS } from "../data/constants.js";
import HtmlLite from "./HtmlLite.jsx";

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
    // Use your existing network helper if present, else write to state
    try {
        const { requestAction } = require("../network/playroom");
        if (typeof requestAction === "function") {
            // eslint-disable-next-line no-console
            console.log(`[CLIENT] action=${type} target=${target} value=${value}`);
            requestAction(type, target, value);
            return;
        }
    } catch { }
    const me = myPlayer();
    const nextId = Number(me.getState("reqId") || 0) + 1;
    me.setState("reqId", nextId, true);
    me.setState("reqType", String(type), true);
    me.setState("reqTarget", String(target), true);
    me.setState("reqValue", Number(value) || 0, true);
    // eslint-disable-next-line no-console
    console.log(`[CLIENT:FALLBACK] action=${type} target=${target} value=${value}`);
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

function ItemEntity({ it }) {
    const groupRef = useRef(null);
    const label = it.name || prettyName(it.type);
    const actionable = canPickUp(it);

    return (
        <group ref={groupRef} position={[it.x, (it.y || 0) + 0.25, it.z]}>
            {/* 3D geometry (safe in Canvas) */}
            <ItemMesh type={it.type} />

            {/* DOM button (ported OUT of Canvas) */}
            <HtmlLite worldObject={groupRef}>
                <button
                    className="item-btn"
                    disabled={!actionable}
                    title={actionable ? `Pick up ${label}` : `Move closer to pick up`}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!actionable) return;
                        e.currentTarget.classList.add("item-btn--pulse");
                        sendAction("pickup", it.id, 0);
                        setTimeout(() => e.currentTarget?.classList.remove("item-btn--pulse"), 180);
                    }}
                >
                    {actionable ? `Pick up ${label}` : `${label} (too far)`}
                </button>
            </HtmlLite>
        </group>
    );
}

export default function ItemsAndDevices() {
    const { items } = useItemsSync();

    return (
        <group>
            {/* Devices */}
            {DEVICES.map((d) => (
                <group key={d.id} position={[d.x, (d.y || 0) + 0.5, d.z]}>
                    <mesh><boxGeometry args={[1.1, 1.0, 0.6]} /><meshStandardMaterial color="#2c3444" /></mesh>
                    <mesh position={[0, 0.3, 0.33]}><planeGeometry args={[0.8, 0.35]} /><meshBasicMaterial color="#8fb3ff" /></mesh>
                </group>
            ))}

            {/* Items on floor only */}
            {items.filter(it => !it.holder).map((it) => (
                <ItemEntity key={it.id} it={it} />
            ))}
        </group>
    );
}
