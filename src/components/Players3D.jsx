// src/components/Players3D.jsx
import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { myPlayer, usePlayersList } from "playroomkit";
import { ROLE_COMPONENTS, Engineer as DefaultRole } from "./characters3d/index.js";
import { DEVICES } from "../data/gameObjects.js";
import { requestAction } from "../network/playroom";
// import GunAttachment from "./GunAttachment.jsx"; // (unused below)
import * as THREE from "three";
const lerp = (a, b, k) => a + (b - a) * k;

function PlayerRig({ targetPos, targetYaw, children }) {
    const g = useRef();
    const pos = useRef(new THREE.Vector3());
    const yaw = useRef(0);

    useFrame((_, dt) => {
        const kPos = Math.min(1, dt * 12);  // 12 Hz smoothing
        const kYaw = Math.min(1, dt * 14);

        pos.current.set(
            lerp(pos.current.x, targetPos[0], kPos),
            lerp(pos.current.y, targetPos[1], kPos),
            lerp(pos.current.z, targetPos[2], kPos)
        );

        // shortest-arc yaw blend
        let d = targetYaw - yaw.current;
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

/* --- tiny easing + wrapper for dead fall --- */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function DeadFallRig({ p, isDead, children }) {
    const ref = useRef();
    useFrame(() => {
        const g = ref.current;
        if (!g) return;

        // Default (alive)
        let drop = 0;
        let rx = 0;
        let rz = 0;

        if (isDead) {
            const ts = Number(p?.getState?.("deadTs") || 0);
            const now = performance.now();
            // if we only know from prop 'dead' (no ts), render fully fallen
            const t = ts ? Math.max(0, Math.min(1, (now - ts) / 900)) : 1;
            const k = easeOutCubic(t);

            rx = -k * (Math.PI / 2); // tip onto the side
            // tiny side tilt to add variety (based on yaw)
            const yaw = Number(p?.getState?.("yaw") || 0);
            rz = 0.15 * Math.sin(yaw) * k;
            drop = 0.25 * k; // sink a bit as it lands
        }

        g.position.set(0, -drop, 0);   // offset only Y; inner group still sets world x,y,z
        g.rotation.set(rx, 0, rz);     // rotate only X/Z; inner group keeps yaw
    });
    return <group ref={ref}>{children}</group>;
}

export default function Players3D({ dead = [] }) {
    const players = usePlayersList(true);

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
                // keep compatibility with prop 'dead', but don't hide — animate instead
                const isDead = dead.includes(p.id) || Boolean(p.getState?.("dead"));

                const x = Number(p.getState("x") ?? 0);
                const y = Number(p.getState("y") ?? 0);
                const z = Number(p.getState("z") ?? 0);
                const yaw = Number(p.getState("yaw") ?? 0);

                // name
                const nameState = String(p.getState?.("name") ?? "").trim();
                const baseName =
                    nameState ||
                    p.getProfile?.().name ||
                    p.name ||
                    `Player-${String(p.id || "").slice(-4)}`;

                // role + visuals
                const roleState = String(p.getState("role") || "Engineer");
                const infected = !!p.getState?.("infected");
                const disguiseOn = infected && !!p.getState?.("disguiseOn");
                const role = ROLE_COMPONENTS[roleState] ? roleState : roleState.toLowerCase(); // ✅ normalize ke
                const suit = p.getState("suit"); // ✅ only use if provided (let role default color otherwise)

                // movement / carry
                const speed = Number(p.getState("spd") || 0);
                const airborne = !!p.getState("air");
                const carry = String(p.getState("carry") || "");

                const Comp = disguiseOn
                   ? (ROLE_COMPONENTS.InfectedDisguise || DefaultRole)
                   : (ROLE_COMPONENTS[role] ||
                      ROLE_COMPONENTS[role.toLowerCase()] ||
                      DefaultRole);

                const isLocal = myPlayer().id === p.id;

                const handleUseCarry = () => {
                    if (!isLocal || !carry) return;
                    const dev = nearestDevice(x, z);
                    if (dev) requestAction("use", `${dev.id}|${carry}`, 0);
                    else requestAction("use", `eat|${carry}`, 0);
                };

                const handleThrowCarry = () => {
                    if (!isLocal || !carry) return;
                    requestAction("throw", carry, yaw);
                };

                const isShooting = Number(p.getState?.("shootingUntil") || 0) > Date.now();

                return (
                    <DeadFallRig key={p.id} p={p} isDead={isDead}>
                        <group position={[x, y, z]} rotation={[0, yaw, 0]}>
                            {/* pass `dead` if your role models support a death pose */}
                            <Comp
                                // world transform is on the parent group
                                name={baseName}
                                role={role}
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
                            {/* show sidearm only when NOT disguised and real role is Guard/Officer */}
                            {!disguiseOn && (roleState === "Guard" || roleState === "Officer") && (
                                <group position={[0.25, 1.1, 0.15]}>
                                    {/* gun body */}
                                    <mesh position={[0, 0, 0.08]}>
                                        <boxGeometry args={[0.08, 0.06, 0.22]} />
                                        <meshStandardMaterial color="#1f2937" metalness={0.4} roughness={0.3} />
                                    </mesh>
                                    {/* grip */}
                                    <mesh position={[-0.03, -0.05, 0]}>
                                        <boxGeometry args={[0.03, 0.1, 0.04]} />
                                        <meshStandardMaterial color="#111827" metalness={0.2} roughness={0.6} />
                                    </mesh>
                                    {/* barrel tip (emissive) */}
                                    <mesh position={[0, 0, 0.22]}>
                                        <cylinderGeometry args={[0.012, 0.012, 0.08, 12]} />
                                        <meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={2} />
                                    </mesh>
                                    {/* muzzle glow while shooting */}
                                    {isShooting && (
                                        <mesh position={[0, 0, 0.28]} scale={[0.12, 0.12, 0.12]}>
                                            <sphereGeometry args={[1, 12, 12]} />
                                            <meshBasicMaterial color="red" transparent opacity={0.9} depthWrite={false} />
                                        </mesh>
                                    )}
                                </group>
                            )}
                        </group>
                    </DeadFallRig>
                );
            })}
        </>
    );
}
