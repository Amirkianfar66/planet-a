// src/components/Players3D.jsx
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { myPlayer, usePlayersList } from "playroomkit";

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */
const lerp = (a, b, k) => a + (b - a) * k;
const v3 = (...a) => new THREE.Vector3(...a);

/**
 * PlayerRig
 * Smoothly applies target position/yaw to a <group> once per frame.
 * - For LOCAL player: targetPos should come from your LocalController
 *   via window.__playerPos = [x, y, z].
 * - For REMOTE players: targetPos/yaw come from network state (x,y,z,yaw).
 *   We apply a small critically-damped blend to kill jitter.
 */
function PlayerRig({ id, targetPos, targetYaw, children, storeLocalRef = false }) {
    const g = useRef();
    const pos = useRef(new THREE.Vector3(
        targetPos?.[0] || 0, targetPos?.[1] || 0, targetPos?.[2] || 0
    ));
    const yaw = useRef(targetYaw || 0);
    const tmp = useRef({ tx: 0, ty: 0, tz: 0, tyaw: 0 });

    useFrame((_, dt) => {
        // Read targets that may change outside React
        const T = tmp.current;
        T.tx = +targetPos?.[0] || 0;
        T.ty = +targetPos?.[1] || 0;
        T.tz = +targetPos?.[2] || 0;
        T.tyaw = +targetYaw || 0;

        // Critically-damped smoothing (feel free to tune multipliers)
        const kPos = Math.min(1, dt * 12);  // 12 = ~snappy but no buzz
        const kYaw = Math.min(1, dt * 14);

        pos.current.set(
            lerp(pos.current.x, T.tx, kPos),
            lerp(pos.current.y, T.ty, kPos),
            lerp(pos.current.z, T.tz, kPos)
        );

        // shortest-arc yaw blend
        let d = T.tyaw - yaw.current;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        yaw.current += d * kYaw;

        if (g.current) {
            g.current.position.copy(pos.current);
            g.current.rotation.set(0, yaw.current, 0);
            if (storeLocalRef) window.__localPlayerGroup = g.current; // helpful for debug tools
        }
    });

    return <group ref={g} name={`player-${id}`}>{children}</group>;
}

/* -------------------------------------------------------------------------- */
/* Players3D                                                                  */
/* -------------------------------------------------------------------------- */
/**
 * This component renders:
 * - Local player from window.__playerPos (your LocalController sets it)
 * - Remote players from network state with smoothing
 *
 * Avatar rendering:
 * - If you already have your own avatar component, expose it globally:
 *   window.__renderAvatar = (player, isLocal) => <YourAvatar ... />
 * - Otherwise we draw a simple capsule so this file compiles on its own.
 */
export default function Players3D() {
    const me = myPlayer();
    const myId = me?.id || "";
    const players = usePlayersList(true);

    // Sort stable so React keys remain consistent
    const list = useMemo(() => [...players].sort((a, b) => (a.id > b.id ? 1 : -1)), [players]);

    // Fallback avatar (simple capsule) if no custom renderer provided
    const renderAvatar = (p, isLocal) => {
        if (typeof window.__renderAvatar === "function") {
            return window.__renderAvatar(p, isLocal);
        }
        // Default placeholder avatar
        return (
            <group>
                <mesh castShadow receiveShadow>
                    <capsuleGeometry args={[0.3, 1.0, 4, 10]} />
                    <meshStandardMaterial metalness={0} roughness={0.9} />
                </mesh>
                {/* tiny name tag */}
                <group position={[0, 1.2, 0]}>
                    <mesh>
                        <planeGeometry args={[0.8, 0.25]} />
                        <meshBasicMaterial transparent opacity={0.45} />
                    </mesh>
                    {/* keep text optional; remove if you use @react-three/drei Text elsewhere */}
                </group>
            </group>
        );
    };

    return (
        <group name="Players3D">
            {list.map((p) => {
                const isLocal = p.id === myId;

                // --- Read network state (used for REMOTE, and as fallback for LOCAL) ---
                const nx = +p.getState?.("x") || 0;
                const ny = +p.getState?.("y") || 0;
                const nz = +p.getState?.("z") || 0;
                const nyaw = +p.getState?.("yaw") || 0;

                // --- LOCAL authoritative pos from controller ---
                const lp = Array.isArray(window.__playerPos) ? window.__playerPos : null;

                // Choose target:
                const targetPos = isLocal && lp ? lp : [nx, ny, nz];
                const targetYaw = nyaw;

                // Store a ref only for the local player (debug / camera helpers)
                const storeLocalRef = isLocal;

                return (
                    <PlayerRig
                        key={p.id}
                        id={p.id}
                        targetPos={targetPos}
                        targetYaw={targetYaw}
                        storeLocalRef={storeLocalRef}
                    >
                        {renderAvatar(p, isLocal)}
                    </PlayerRig>
                );
            })}
        </group>
    );
}
