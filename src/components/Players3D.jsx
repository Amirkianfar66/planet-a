// src/components/Players3D.jsx
import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { myPlayer, usePlayersList } from "playroomkit";
import { ROLE_COMPONENTS, Engineer as DefaultRole } from "./characters3d/index.js";
import { DEVICES } from "../data/gameObjects.js";
import { requestAction } from "../network/playroom";
import * as THREE from "three";

const lerp = (a, b, k) => a + (b - a) * k;

/* --------------------- SMOOTH RIG (no vibration) ---------------------- */
function PlayerRig({ targetPos = [0, 0, 0], targetYaw = 0, children }) {
    const g = useRef();
    const pos = useRef(new THREE.Vector3(targetPos[0], targetPos[1], targetPos[2]));
    const yaw = useRef(targetYaw);

    useFrame((_, dt) => {
        const kPos = Math.min(1, dt * 12);  // tune 8–16
        const kYaw = Math.min(1, dt * 14);

        const tx = +targetPos[0] || 0;
        const ty = +targetPos[1] || 0;
        const tz = +targetPos[2] || 0;

        pos.current.set(
            lerp(pos.current.x, tx, kPos),
            lerp(pos.current.y, ty, kPos),
            lerp(pos.current.z, tz, kPos)
        );

        // shortest-arc yaw blend
        let d = (targetYaw || 0) - yaw.current;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        yaw.current += d * kYaw;

        if (g.current) {
            g.current.position.copy(pos.current);
            g.current.rotation.set(0, yaw.current, 0);
        }
    });

    return <group ref={g}>{children}</group>;
}

/* -------------------- tiny easing + dead fall wrapper ------------------ */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function DeadFallRig({ p, isDead, children }) {
    const ref = useRef();
    useFrame(() => {
        const g = ref.current;
        if (!g) return;

        let drop = 0, rx = 0, rz = 0;

        if (isDead) {
            const ts = Number(p?.getState?.("deadTs") || 0);
            const now = performance.now();
            const t = ts ? Math.max(0, Math.min(1, (now - ts) / 900)) : 1;
            const k = easeOutCubic(t);
            rx = -k * (Math.PI / 2);
            const yaw = Number(p?.getState?.("yaw") || 0);
            rz = 0.15 * Math.sin(yaw) * k;
            drop = 0.25 * k;
        }

        g.position.set(0, -drop, 0); // only Y
        g.rotation.set(rx, 0, rz);   // only X/Z
    });
    return <group ref={ref}>{children}</group>;
}

/* -------------------------------- MAIN --------------------------------- */
export default function Players3D({ dead = [] }) {
    const players = usePlayersList(true);
    const me = myPlayer();
    const myId = me?.id;

    const nearestDevice = (x, z) => {
        let best = null, bestD2 = Infinity;
        for (const d of DEVICES) {
            const dx = d.x - x, dz = d.z - z;
            const d2 = dx * dx + dz * dz;
            const r = (d.radius || 1.3);
            if (d2 <= r * r && d2 < bestD2) { best = d; bestD2 = d2; }
        }
        return best;
    };

    return (
        <>
            {players.map((p) => {
                const isDead = dead.includes(p.id) || Boolean(p.getState?.("dead"));

                // network states (also serve as fallback for local)
                const nx = Number(p.getState("x") ?? 0);
                const ny = Number(p.getState("y") ?? 0);
                const nz = Number(p.getState("z") ?? 0);
                const nyaw = Number(p.getState("yaw") ?? 0);

                // local/remote switch
                const isLocal = myId === p.id;
                const lp = Array.isArray(window.__playerPos) ? window.__playerPos : null;
                const targetPos = isLocal && lp ? lp : [nx, ny, nz];
                const targetYaw = nyaw;

                // name
                const nameState = String(p.getState?.("name") ?? "").trim();
                const baseName =
                    nameState || p.getProfile?.().name || p.name || `Player-${String(p.id || "").slice(-4)}`;

                // role + visuals
                const roleState = String(p.getState("role") || "Engineer");
                const infected = !!p.getState?.("infected");
                const disguiseOn = infected && !!p.getState?.("disguiseOn");
                const roleKey = ROLE_COMPONENTS[roleState] ? roleState : roleState.toLowerCase();
                const suit = p.getState("suit");

                // movement / carry
                const speed = Number(p.getState("spd") || 0);
                const airborne = !!p.getState("air");
                const carry = String(p.getState("carry") || "");

                const Comp = disguiseOn
                    ? (ROLE_COMPONENTS.InfectedDisguise || DefaultRole)
                    : (ROLE_COMPONENTS[roleKey] ||
                        ROLE_COMPONENTS[roleKey?.toLowerCase?.()] ||
                        DefaultRole);

                const handleUseCarry = () => {
                    if (!isLocal || !carry) return;
                    const dev = nearestDevice(nx, nz);
                    if (dev) requestAction("use", `${dev.id}|${carry}`, 0);
                    else requestAction("use", `eat|${carry}`, 0);
                };

                const handleThrowCarry = () => {
                    if (!isLocal || !carry) return;
                    requestAction("throw", carry, nyaw);
                };

                const isShooting = Number(p.getState?.("shootingUntil") || 0) > Date.now();

                return (
                    <DeadFallRig key={p.id} p={p} isDead={isDead}>
                        {/* ⤵️ Jitter fix: world transform is applied by PlayerRig (smoothed). */}
                        <PlayerRig targetPos={targetPos} targetYaw={targetYaw}>
                            {/* Your original model + props remain unchanged */}
                            <Comp
                                name={baseName}
                                role={roleKey}
                                {...(suit ? { suit } : {})}
                                showName
                                bob
                                speed={speed}
                                airborne={airborne}
                                carry={carry}
                                isLocal={isLocal}
                                dead={isDead}
                                onClickCarry={handleUseCarry}
                                onContextMenuCarry={handleThrowCarry}
                            />

                            {/* Sidearm for Guard/Officer when not disguised */}
                            {!disguiseOn && (roleState === "Guard" || roleState === "Officer") && (
                                <group position={[0.25, 1.1, 0.15]}>
                                    <mesh position={[0, 0, 0.08]}>
                                        <boxGeometry args={[0.08, 0.06, 0.22]} />
                                        <meshStandardMaterial color="#1f2937" metalness={0.4} roughness={0.3} />
                                    </mesh>
                                    <mesh position={[-0.03, -0.05, 0]}>
                                        <boxGeometry args={[0.03, 0.1, 0.04]} />
                                        <meshStandardMaterial color="#111827" metalness={0.2} roughness={0.6} />
                                    </mesh>
                                    <mesh position={[0, 0, 0.22]}>
                                        <cylinderGeometry args={[0.012, 0.012, 0.08, 12]} />
                                        <meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={2} />
                                    </mesh>
                                    {isShooting && (
                                        <mesh position={[0, 0, 0.28]} scale={[0.12, 0.12, 0.12]}>
                                            <sphereGeometry args={[1, 12, 12]} />
                                            <meshBasicMaterial color="red" transparent opacity={0.9} depthWrite={false} />
                                        </mesh>
                                    )}
                                </group>
                            )}
                        </PlayerRig>
                    </DeadFallRig>
                );
            })}
        </>
    );
}
