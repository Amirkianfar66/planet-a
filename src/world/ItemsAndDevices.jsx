// src/world/ItemsAndDevices.jsx
import React, { useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { requestAction as _requestAction } from "../network/playroom";

const PICKUP_RADIUS = 2.0; // keep in sync with ItemsHostLogic

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

function prettyName(type) {
    switch (String(type)) {
        case "o2can": return "O₂ Canister";
        case "battery": return "Battery";
        case "fuel": return "Fuel Rod";
        case "food": return "Food";
        default: return (type || "Item").toString();
    }
}

/** Billboard label */
function ItemLabel({ text = "Item", offsetY = 0.9 }) {
    const { camera } = useThree();
    const ref = useRef();

    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });

    const { tex, aspect } = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = canvas.width, h = canvas.height, r = 32;
        ctx.fillStyle = "rgba(14,17,22,0.92)";
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.fill();

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

    return (
        <group ref={ref} position={[0, offsetY, 0]}>
            <mesh>
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial map={tex} transparent depthWrite={false} />
            </mesh>
        </group>
    );
}

/** Per-frame raycaster to force cursor updates reliably */
function CursorRaycaster({ targetsRef, itemsRef }) {
    const { gl, camera, size } = useThree();
    const ray = useRef(new THREE.Raycaster());
    const ndc = useRef(new THREE.Vector2());

    useFrame(() => {
        const el = gl.domElement;
        // read current pointer from R3F (clientX/clientY are in event; use last pointer from renderer state)
        const rect = el.getBoundingClientRect();
        // use browser pointer position
        const x = (window.event?.clientX ?? 0) - rect.left;
        const y = (window.event?.clientY ?? 0) - rect.top;
        if (x <= 0 || y <= 0 || x >= rect.width || y >= rect.height) {
            el.style.cursor = "";
            return;
        }
        ndc.current.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
        ray.current.setFromCamera(ndc.current, camera);

        // Intersect item groups
        const objs = targetsRef.current;
        if (!objs.length) { el.style.cursor = ""; return; }

        const hits = ray.current.intersectObjects(objs, true);
        if (!hits.length) { el.style.cursor = ""; return; }

        // Find the top-most hit that belongs to an actionable item
        let actionable = false;
        for (const h of hits) {
            let g = h.object;
            while (g && !g.userData?.itemId) g = g.parent;
            if (g?.userData?.itemId) {
                const id = g.userData.itemId;
                const it = itemsRef.current.find(o => o.id === id);
                if (canPickUp(it)) { actionable = true; break; }
            }
        }
        el.style.cursor = actionable ? "grab" : "not-allowed";
    });

    return null;
}

export default function ItemsAndDevices() {
    const { items } = useItemsSync();
    const itemGroups = useRef([]);            // refs to raycastable item groups
    const itemsRef = useRef(items);
    itemsRef.current = items;
    itemGroups.current = [];                  // reset each render

    const handlePick = (it) => {
        if (canPickUp(it)) {
            const { gl } = useThree.getState();
            gl.domElement.style.cursor = "grabbing";
            sendAction("pickup", it.id, 0);
            requestAnimationFrame(() => { gl.domElement.style.cursor = ""; });
        }
    };

    return (
        <group>
            {/* Devices (visual) */}
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

            {/* Items */}
            {items.map((it) => {
                if (it.holder) return null;
                const pos = [it.x, it.y + 0.25, it.z];
                const label = it.name || prettyName(it.type);

                // capture ref for raycaster
                const refCb = (el) => { if (el) { el.userData.itemId = it.id; itemGroups.current.push(el); } };

                const common = {
                    onPointerDown: (e) => { e.stopPropagation(); handlePick(it); },
                    onClick: (e) => { e.stopPropagation(); handlePick(it); },
                };

                switch (it.type) {
                    case "food":
                        return (
                            <group ref={refCb} key={it.id} position={pos} {...common}>
                                <mesh {...common}>
                                    <boxGeometry args={[0.35, 0.25, 0.35]} />
                                    <meshStandardMaterial color="#ff9f43" />
                                </mesh>
                                <ItemLabel text={label} />
                            </group>
                        );
                    case "battery":
                        return (
                            <group ref={refCb} key={it.id} position={pos} {...common}>
                                <mesh {...common}>
                                    <cylinderGeometry args={[0.15, 0.15, 0.35, 12]} />
                                    <meshStandardMaterial color="#2dd4bf" />
                                </mesh>
                                <mesh position={[0, 0.2, 0]} {...common}>
                                    <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
                                    <meshStandardMaterial color="#0f172a" />
                                </mesh>
                                <ItemLabel text={label} />
                            </group>
                        );
                    case "o2can":
                        return (
                            <group ref={refCb} key={it.id} position={pos} {...common}>
                                <mesh {...common}>
                                    <cylinderGeometry args={[0.2, 0.2, 0.5, 14]} />
                                    <meshStandardMaterial color="#9bd1ff" />
                                </mesh>
                                <mesh position={[0, 0.28, 0]} {...common}>
                                    <boxGeometry args={[0.08, 0.12, 0.08]} />
                                    <meshStandardMaterial color="#1e293b" />
                                </mesh>
                                <ItemLabel text={label} />
                            </group>
                        );
                    case "fuel":
                        return (
                            <group ref={refCb} key={it.id} position={pos} {...common}>
                                <mesh {...common}>
                                    <boxGeometry args={[0.12, 0.6, 0.12]} />
                                    <meshStandardMaterial color="#a78bfa" />
                                </mesh>
                                <ItemLabel text={label} />
                            </group>
                        );
                    default:
                        return (
                            <group ref={refCb} key={it.id} position={pos} {...common}>
                                <mesh {...common}>
                                    <boxGeometry args={[0.3, 0.3, 0.3]} />
                                    <meshStandardMaterial color="#9ca3af" />
                                </mesh>
                                <ItemLabel text={label} />
                            </group>
                        );
                }
            })}

            {/* Force cursor updates every frame based on ray hits + distance */}
            <CursorRaycaster targetsRef={itemGroups} itemsRef={itemsRef} />
        </group>
    );
}
