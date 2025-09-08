import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { requestAction as _requestAction } from "../network/playroom";

// Robust sender: use requestAction if present, else set Playroom states directly
function sendAction(type, target, value = 0) {
    try {
        if (typeof _requestAction === "function") {
            _requestAction(type, target, value);
            return;
        }
    } catch { }
    const me = myPlayer();
    const nextId = Number(me.getState("reqId") || 0) + 1;
    me.setState("reqId", nextId, true);
    me.setState("reqType", String(type), true);
    me.setState("reqTarget", String(target), true);
    me.setState("reqValue", Number(value) || 0, true);
    // local hint
    console.log(`[sendAction/fallback] ${type} -> target="${target}" value=${value} (reqId=${nextId})`);
}

/* ---------- Small billboard label that faces camera (clickable) ---------- */
function ItemLabel({ text = "Item", offsetY = 0.9, onPick }) {
    const { camera } = useThree();
    const ref = useRef();

    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });

    const { tex, aspect } = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const w = canvas.width, h = canvas.height, r = 32;

        // pill bg
        ctx.fillStyle = "rgba(14,17,22,0.92)";
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.fill();

        // text
        ctx.font = "600 64px ui-sans-serif, system-ui";
        ctx.fillStyle = "#cfe3ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, w / 2, h / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        return { tex: texture, aspect: w / h };
    }, [text]);

    const width = 0.95, height = width / (aspect || 3);
    const handlers = {
        onPointerDown: (e) => { e.stopPropagation(); onPick?.(e); },
        onClick: (e) => { e.stopPropagation(); onPick?.(e); },
        onPointerOver: () => { document.body.style.cursor = "pointer"; },
        onPointerOut: () => { document.body.style.cursor = ""; },
    };

    return (
        <group ref={ref} position={[0, offsetY, 0]}>
            <mesh {...handlers}>
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial map={tex} transparent depthWrite={false} />
            </mesh>
        </group>
    );
}

function prettyName(type) {
    switch (String(type)) {
        case "o2can": return "O₂ Canister";
        case "battery": return "Battery";
        case "fuel": return "Fuel Rod";
        case "food": return "Food";
        default: return (type || "Item").toString();
    }
}

export default function ItemsAndDevices() {
    const { items } = useItemsSync();

    return (
        <group>
            {/* Devices (visual only for now) */}
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

            {/* Items (click to collect) */}
            {items.map((it) => {
                if (it.holder) return null; // someone is carrying it
                const pos = [it.x, it.y + 0.25, it.z];
                const label = it.name || prettyName(it.type);

                const pick = (e) => {
                    e?.stopPropagation?.();
                    console.log(`[click] pickup -> ${it.id} (${it.type})`);
                    sendAction("pickup", it.id, 0);
                };

                const handlers = {
                    onPointerDown: pick,
                    onClick: pick,
                    onPointerOver: () => { document.body.style.cursor = "pointer"; },
                    onPointerOut: () => { document.body.style.cursor = ""; },
                };

                switch (it.type) {
                    case "food":
                        return (
                            <group key={it.id} position={pos} {...handlers}>
                                <mesh {...handlers}>
                                    <boxGeometry args={[0.35, 0.25, 0.35]} />
                                    <meshStandardMaterial color="#ff9f43" />
                                </mesh>
                                <ItemLabel text={label} onPick={pick} />
                            </group>
                        );
                    case "battery":
                        return (
                            <group key={it.id} position={pos} {...handlers}>
                                <mesh {...handlers}>
                                    <cylinderGeometry args={[0.15, 0.15, 0.35, 12]} />
                                    <meshStandardMaterial color="#2dd4bf" />
                                </mesh>
                                <mesh position={[0, 0.2, 0]} {...handlers}>
                                    <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
                                    <meshStandardMaterial color="#0f172a" />
                                </mesh>
                                <ItemLabel text={label} onPick={pick} />
                            </group>
                        );
                    case "o2can":
                        return (
                            <group key={it.id} position={pos} {...handlers}>
                                <mesh {...handlers}>
                                    <cylinderGeometry args={[0.2, 0.2, 0.5, 14]} />
                                    <meshStandardMaterial color="#9bd1ff" />
                                </mesh>
                                <mesh position={[0, 0.28, 0]} {...handlers}>
                                    <boxGeometry args={[0.08, 0.12, 0.08]} />
                                    <meshStandardMaterial color="#1e293b" />
                                </mesh>
                                <ItemLabel text={label} onPick={pick} />
                            </group>
                        );
                    case "fuel":
                        return (
                            <group key={it.id} position={pos} {...handlers}>
                                <mesh {...handlers}>
                                    <boxGeometry args={[0.12, 0.6, 0.12]} />
                                    <meshStandardMaterial color="#a78bfa" />
                                </mesh>
                                <ItemLabel text={label} onPick={pick} />
                            </group>
                        );
                    default:
                        return (
                            <group key={it.id} position={pos} {...handlers}>
                                <mesh {...handlers}>
                                    <boxGeometry args={[0.3, 0.3, 0.3]} />
                                    <meshStandardMaterial color="#9ca3af" />
                                </mesh>
                                <ItemLabel text={label} onPick={pick} />
                            </group>
                        );
                }
            })}
        </group>
    );
}
