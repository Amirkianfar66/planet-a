// src/world/ItemsAndDevices.jsx
import React, { useMemo, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES, INITIAL_ITEMS, ITEM_TYPES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS } from "../data/constants.js";
import { OUTSIDE_AREA, pointInRect, clampToRect, roomCenter } from "../map/deckA";
import { useMultiplayerState } from "playroomkit";
// ---------------------------------
// Bounds / placement helpers
// ---------------------------------
const OUT_MARGIN = 0.75;

function ensureOutdoorPos(x = 0, z = 0) {
    if (pointInRect(OUTSIDE_AREA, x, z, OUT_MARGIN)) return { x, z };
    const c = clampToRect(OUTSIDE_AREA, x, z, OUT_MARGIN);
    return { x: c.x, z: c.z };
}
// --- Viewer role (who's looking at the item) ---
function getViewerRole() {
    try {
        const me = myPlayer?.();
        return String(me?.getState?.("role") || "");
    } catch {
        return "";
    }
}
// If item is poison_food, only FoodSupplier should see it as "poison_food".
// Everyone else sees it as regular "food" (same mesh, label, color).
function visibleTypeForViewer(itemType, viewerRole) {
    if (itemType === "poison_food" && viewerRole !== "FoodSupplier") {
        return "food";
    }
    return itemType;
}

// ---------------------------------
// Type metadata (labels + colors)
// ---------------------------------
const TYPE_META = ITEM_TYPES;

// What each stationary container accepts:
// What each stationary container accepts:
const TANK_ACCEPTS = {
    food_tank: "food",
    fuel_tank: "fuel",
    protection_tank: "protection",
    oxygen_device: "fuel", // oxygen device consumes fuel rods
};

// Cure device: multi-accept container
const isCureDevice = (t) => t === "cure_device";

const isCureReceiver = (t) => t === "cure_receiver";

// Tanks + oxygen device only (single-accept UI)
const isTankType = (t) =>
    t === "food_tank" || t === "fuel_tank" || t === "protection_tank" || t === "oxygen_device";

// Pretty name for cure subcounts
const fmtCureCount = (stored) => {
    const r = Number(stored?.red || 0);
    const b = Number(stored?.blue || 0);
    return `A:${r}  B:${b}`;
};

// ---------------------------------
// Billboard / Text sprite
// ---------------------------------
function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => {
        if (ref.current) ref.current.quaternion.copy(camera.quaternion);
    });
    return (
        <group ref={ref} position={position}>
            {children}
        </group>
    );
}

function TextSprite({ text = "", width = 0.95 }) {
    const texture = useMemo(() => {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 192;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);

        const x = 6,
            y = 50,
            w = c.width - 12,
            h = 92,
            r = 20;

        // backdrop
        ctx.fillStyle = "rgba(20,26,34,0.92)";
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.fill();

        // text
        ctx.fillStyle = "#fff";
        ctx.font = "600 48px system-ui, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
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

// ---------------------------------
// Item meshes for each type
// ---------------------------------
function ItemMesh({ visibleType = "crate" }) {
    const color = TYPE_META[visibleType]?.color ?? "#9ca3af";

    switch (visibleType) {
        case "food":
        case "poison_food": // FoodSupplier will still pass "poison_food" and get its color
            return (
                <group>
                    <mesh>
                        <boxGeometry args={[0.36, 0.22, 0.3]} />
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
                    <mesh position={[0, 0.2, 0]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.12, 18]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                </group>
            );
        case "cctv":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.07, 0.07, 0.05, 12]} />
                        <meshStandardMaterial color="#4b5563" metalness={0.4} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 0, 0.14]}>
                        <boxGeometry args={[0.16, 0.12, 0.22]} />
                        <meshStandardMaterial color={color} metalness={0.2} roughness={0.6} />
                    </mesh>
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
                <group scale={[2, 4, 2]}>
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
        case "oxygen_device":
            return (
                <group scale={[4, 4, 4]}>
                    <mesh>
                        <cylinderGeometry args={[0.22, 0.22, 0.34, 20]} />
                        <meshStandardMaterial color={TYPE_META.oxygen_device?.color || "#60a5fa"} metalness={0.2} roughness={0.4} />
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

        case "battery":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.15, 0.15, 0.35, 12]} />
                        <meshStandardMaterial color={TYPE_META.battery?.color || "#f59e0b"} />
                    </mesh>
                    <mesh position={[0, 0.2, 0]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                </group>
            );
        case "cure_device":
            // Show a tank-like cylinder, but colored per ITEM_TYPES.cure_device
            return (
                <group scale={[4, 4, 4]}>
                    <mesh>
                        <cylinderGeometry args={[0.22, 0.22, 0.34, 20]} />
                        <meshStandardMaterial color={TYPE_META.cure_device?.color || "#22d3ee"} metalness={0.2} roughness={0.4} />
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

        case "cure_receiver":
            return (
                <group scale={[3.2, 3.2, 3.2]}>
                    <mesh>
                        <cylinderGeometry args={[0.22, 0.22, 0.16, 20]} />
                        <meshStandardMaterial color={TYPE_META.cure_receiver?.color || "#14b8a6"} metalness={0.2} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 0.1, 0]}>
                        <cylinderGeometry args={[0.24, 0.24, 0.02, 20]} />
                        <meshStandardMaterial color="#0f172a" />
                    </mesh>
                </group>
            );

        case "o2can":
            return (
                <group>
                    <mesh>
                        <cylinderGeometry args={[0.2, 0.2, 0.5, 14]} />
                        <meshStandardMaterial color={TYPE_META.o2can?.color || "#3b82f6"} />
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

// ---------------------------------
// Helpers
// ---------------------------------
function canPickUp(it) {
    const me = myPlayer?.();
    if (!me) return false;
    const px = Number(me.getState("x") || 0);
    const pz = Number(me.getState("z") || 0);
    const dx = px - it.x,
        dz = pz - it.z;
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

// ---------------------------------
// Single floor item
// ---------------------------------
function ItemEntity({ it }) {
    if (!it || it.holder || it.hidden) return null;
    if (String(it.type).toLowerCase() === "pet") return null;

    const viewerRole = getViewerRole();
    const vType = visibleTypeForViewer(it.type, viewerRole);
    const actionable = canPickUp(it);

    // Base label text should use the *visible* type so non-suppliers see "Food".
    function prettyLabelVisible(it, vType) {
        if (isCureDevice(it?.type)) {
            const cap = Number(it?.cap ?? 4);
            return `${it.name || TYPE_META[it.type]?.label || "Cure Device"} (${fmtCureCount(it.stored)} / ${cap})`;
        }
        if (isTankType(it?.type)) {
            const stored = Number(it.stored ?? 0);
            const cap = Number(it.cap ?? 6);
            const base = it.name || TYPE_META[it.type]?.label || "Tank";
            return `${base} (${stored}/${cap})`;
        }
        const t = TYPE_META[vType];
        return it.name || t?.label || vType || "Item";
    }


    const label = prettyLabelVisible(it, vType);

    // Defaults (green ring when pickable, neutral otherwise)
    let prompt = actionable ? `Press P to pick up ${label}` : label;
    let ringColor = actionable ? "#86efac" : "#64748b";
    let ringScale = 1;
    let billboardY = 0.85;
    let rotationY = 0;

    // CCTV: face the direction it was placed
    if (it.type === "cctv") {
        rotationY = Number(it.yaw || 0);
        prompt = actionable ? "Press P to pick up CCTV Camera" : "CCTV Camera";
    }
    

    // Poisoned food: only FoodSupplier gets the warning & distinct color/ring.
    const isPoison = it.type === "poison_food";
    const isSupplier = viewerRole === "FoodSupplier";

    if (isPoison && isSupplier) {
        // Supplier sees the *real* type + warning styling
        const warnLabel = TYPE_META.poison_food?.label || "Poisoned Food";
        prompt = actionable ? `⚠️ Press P to pick up ${warnLabel}` : warnLabel;

        // make it visually distinct for supplier
        ringColor = actionable ? "#f87171" : "#9ca3af"; // red-ish in range
        // Optionally brighten the mesh by using poison color via vType === "poison_food"
        // (Already handled by passing vType to ItemMesh below)
    }
    // Cure Device: custom label/prompt (multi-accept container)
    if (isCureDevice(it.type)) {
        const me = myPlayer?.();
        const bp = me?.getState?.("backpack") || [];
        const hasA = bp.some((b) => String(b.type).toLowerCase() === "cure_red");
        const hasB = bp.some((b) => String(b.type).toLowerCase() === "cure_blue");

        const red = Number(it?.stored?.red || 0);
        const blue = Number(it?.stored?.blue || 0);
        const cap = Number(it?.cap ?? 4);
        const total = red + blue;
        const full = total >= cap;

        // Label shows A/B count and total/cap
        const base = it.name || TYPE_META[it.type]?.label || "Cure Device";
        const labelCure = `${base} (${fmtCureCount(it.stored)} / ${cap})`;

        // Can load if in range, not full, and have either A or B in backpack
        const canLoad = actionable && !full && (hasA || hasB);

        prompt = !actionable
            ? labelCure
            : full
                ? "Cure Device full"
                : (!hasA && !hasB)
                    ? "No Cure A/B in backpack"
                    : "Press P to add Cure A or B";

        ringColor = canLoad ? "#86efac" : "#64748b";
        ringScale = 4;
        billboardY = 1.7;
    }
    // Cure Receiver: show stored count; not pickable
    if (isCureReceiver(it.type)) {
        const cap = Number(it?.cap ?? 6);
        const stored = Number(it?.stored || 0);
        const base = it.name || TYPE_META[it.type]?.label || "Cure Receiver";
        const labelRx = `${base} (Advanced: ${stored}/${cap})`;

        prompt = labelRx;              // no "Press P"
        ringColor = "#64748b";
        ringScale = 4;
        billboardY = 1.7;
    }

    // Tanks (non-pickable UI behavior)
    if (isTankType(it.type)) {
        const me = myPlayer?.();
        const bp = me?.getState?.("backpack") || [];
        const want = TANK_ACCEPTS[it.type];
        const hasWanted = bp.some((b) => String(b.type).toLowerCase() === want);

        const stored = Number(it.stored ?? 0);
        const cap = Number(it.cap ?? 6);
        const full = stored >= cap;

        const labelWanted = (TYPE_META[want]?.label || want).toLowerCase();
        const canLoad = actionable && hasWanted && !full;

        prompt = !actionable
            ? label
            : full
                ? "Tank full"
                : !hasWanted
                    ? `No ${labelWanted} in backpack`
                    : `Press P to add ${TYPE_META[want]?.label || want}`;

        ringColor = canLoad ? "#86efac" : "#64748b";
        ringScale = 4;
        billboardY = 1.7;
    }

    return (
        <group position={[it.x, (it.y || 0) + 0.25, it.z]} rotation={[0, rotationY, 0]}>
            {/* Use the visibleType so only the supplier sees the poison color */}
            <ItemMesh visibleType={vType} />

            {/* Ground ring */}
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


// ---------------------------------
// Main scene block (render-only)
// ---------------------------------
export default function ItemsAndDevices() {
    const { items } = useItemsSync();
    const [wireSolved] = useMultiplayerState("wire:solved", false);
    const [engineSolved] = useMultiplayerState("engine:solved", false);
    // OPTIONAL: support "optimistic ghost hide" if your InteractionSystem sets window.__ghostItems
    const [ghostVer, setGhostVer] = useState(0);
    useEffect(() => {
        const onGhost = () => setGhostVer((v) => v + 1);
        if (typeof window !== "undefined") {
            window.addEventListener("planetA:ghostItems", onGhost);
            return () => window.removeEventListener("planetA:ghostItems", onGhost);
        }
    }, []);
    const ghostIds =
        (typeof window !== "undefined" && window.__ghostItems) || new Set();

    // Latch fallback until we see any non-pet from sync
    const [useFallback, setUseFallback] = useState(true);
    useEffect(() => {
            if (Array.isArray(items)) setUseFallback(false);
          }, [items]);

    const renderItems = useFallback ? INITIAL_ITEMS : items || [];

    // Pets are rendered separately; exclude them here.
    const floorItems = useMemo(
            () =>
          (renderItems || []).filter(
                (i) =>
                  i &&
                  !i.holder &&           // not held
                  !i.hidden &&           // not explicitly hidden by host
                  String(i.type).toLowerCase() !== "pet"
              ),
        [renderItems]
          );

    // Debug once when source switches
    useEffect(() => {
        // eslint-disable-next-line no-console
        console.debug(
            "[ItemsAndDevices] source=",
            useFallback ? "INITIAL_ITEMS" : "SYNC",
            "count=",
            floorItems.length
        );
    }, [useFallback, floorItems.length]);

    return (
        <group>
            {/* Devices */}
            {DEVICES.map((d) => {
                const x = d.x ?? 0, z = d.z ?? 0; // devices already resolved to world coords
                const y = (d.y || 0) + 0.5;
                const isWireConsole = d.id === "wire_console";
                const isEngineConsole = d.id === "engine_pipes";

                // one boolean to drive tint/glow for either console
                const isSolvedConsole =
                    (isWireConsole && wireSolved) || (isEngineConsole && engineSolved);

                const bodyColor = isSolvedConsole ? "#14532d" : "#2c3444"; // dark green when solved
                const screenColor = isSolvedConsole ? "#22c55e" : "#8fb3ff"; // bright green when solved

                  // Show "Press I to start" when the local player is within the console's radius
                  let showWirePrompt = false;
                  if (d.id === "wire_console") {
                       const me = myPlayer?.();
                       const px = Number(me?.getState?.("x") || 0);
                       const pz = Number(me?.getState?.("z") || 0);
                       const dx = px - x, dz = pz - z;
                       const r = Number(d.radius || DEVICE_RADIUS);
                       showWirePrompt = dx * dx + dz * dz <= r * r;
                }
                // Engine Console proximity prompt
                let showEnginePrompt = false;
                if (isEngineConsole) {
                    const me = myPlayer?.();
                    const px = Number(me?.getState?.("x") || 0);
                    const pz = Number(me?.getState?.("z") || 0);
                    const dx = px - x, dz = pz - z;
                    const r = Number(d.radius || DEVICE_RADIUS);
                    showEnginePrompt = dx * dx + dz * dz <= r * r;
                }
                return (
                    <group key={d.id} position={[x, y, z]}>
                        <mesh>
                            <boxGeometry args={[1.1, 1.0, 0.6]} />
                            <meshStandardMaterial color={bodyColor} />
                        </mesh>

                        <mesh position={[0, 0.3, 0.33]}>
                            <planeGeometry args={[0.8, 0.35]} />
                            <meshBasicMaterial color={screenColor} />
                        </mesh>
                        {(isWireConsole || isEngineConsole) && isSolvedConsole && (
                            <mesh position={[0, 0.3, 0.34]}> {/* in front of 0.33 to avoid z-fighting */}
                                <planeGeometry args={[0.82, 0.37]} />
                                <meshBasicMaterial color="#22c55e" transparent opacity={0.35} />
                            </mesh>
                        )}

                        <Billboard position={[0, 0.9, 0]}>
                            <TextSprite text={d.label || d.type || d.id} width={1.1} />
                        </Billboard>
                        {/* Wire Console proximity prompt */}
                        {d.id === "wire_console" && showWirePrompt && (
                            <Billboard position={[0, 0.6, 0]}>
                            <TextSprite text="Press I to start" width={0.9} />
                            </Billboard>
                        )}
                    </group>
                );
            })}

            {floorItems.map((it) => (
                <ItemEntity key={it.id} it={it} />
            ))}
        </group>
    );
}
