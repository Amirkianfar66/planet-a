// src/world/ItemsAndDevices.jsx
import React, { useRef } from "react";
import { Html } from "@react-three/drei";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { requestAction as _requestAction } from "../network/playroom";
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

function canPickUp(it) {
    if (!it || it.holder) return false;
    const me = myPlayer();
    const px = Number(me.getState("x") || 0);
    const pz = Number(me.getState("z") || 0);
    const dx = px - it.x;
    const dz = pz - it.z;
    return dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS;
}

function sendAction(type, target, value = 0) {
    try {
        if (typeof _requestAction === "function") {
            _requestAction(type, target, value);
            return;
        }
    } catch { }
    // Fallback: write the request directly
    const me = myPlayer();
    const nextId = Number(me.getState("reqId") || 0) + 1;
    me.setState("reqId", nextId, true);
    me.setState("reqType", String(type), true);
    me.setState("reqTarget", String(target), true);
    me.setState("reqValue", Number(value) || 0, true);
}

function ItemMesh({ type = "crate" }) {
    switch (type) {
        case "food":
            return (
                <mesh>
                    <boxGeometry args={[0.35, 0.25, 0.35]} />
                    <meshStandardMaterial color="#ff9f43" />
                </mesh>
            );
        case "battery":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.15, 0.15, 0.35, 12]} />
                        <meshStandardMaterial color="#2dd4bf" />
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
                        <meshStandardMaterial color="#9bd1ff" />
                    </mesh>
                    <mesh position={[0, 0.28, 0]}>
                        <boxGeometry args={[0.08, 0.12, 0.08]} />
                        <meshStandardMaterial color="#1e293b" />
                    </mesh>
                </group>
            );
        case "fuel":
            return (
                <mesh>
                    <boxGeometry args={[0.12, 0.6, 0.12]} />
                    <meshStandardMaterial color="#a78bfa" />
                </mesh>
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

export default function ItemsAndDevices() {
    const { items } = useItemsSync();
    const btnRef = useRef(null);

    return (
        <group>
            {/* Devices (visual only here) */}
            {DEVICES.map((d) => (
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

            {/* Items with DOM buttons anchored in 3D */}
            {items.map((it) => {
                if (it.holder) return null; // hidden when someone carries it
                const pos = [it.x, (it.y || 0) + 0.25, it.z];
                const label = it.name || prettyName(it.type);
                const actionable = canPickUp(it);

                return (
                    <group key={it.id} position={pos}>
                        <ItemMesh type={it.type} />

                        {/* Floating DOM button: always clickable like any HTML button */}
                        <Html
                            center
                            transform
                            distanceFactor={6}      // scale UI with distance for readability
                            occlude={false}
                            style={{ pointerEvents: "auto" }}
                        >
                            <button
                                ref={btnRef}
                                className="item-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!actionable) return;
                                    // brief visual feedback
                                    e.currentTarget.classList.add("item-btn--pulse");
                                    sendAction("pickup", it.id, 0);
                                    setTimeout(() => e.currentTarget?.classList.remove("item-btn--pulse"), 180);
                                }}
                                disabled={!actionable}
                                onContextMenu={(e) => e.preventDefault()}
                                title={actionable ? `Pick up ${label}` : `Move closer to pick up`}
                            >
                                {actionable ? `Pick up ${label}` : `${label} (too far)`}
                            </button>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
}
