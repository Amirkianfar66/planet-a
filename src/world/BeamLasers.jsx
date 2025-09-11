import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { usePlayersList } from "playroomkit";
import { GUN_OFFSETS } from "../game/gunOffsets";

const readVec = (p, key) => {
    const v = p.getState?.(key);
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const j = JSON.parse(v); if (Array.isArray(j)) return j; } catch { } }
    return null;
};

function Laser({ a, b }) {
    const meshRef = useRef(null);

    const { pos, quat, len } = useMemo(() => {
        const A = new THREE.Vector3(...a);
        const B = new THREE.Vector3(...b);
        const mid = A.clone().add(B).multiplyScalar(0.5);
        const dir = B.clone().sub(A);
        const length = Math.max(0.0001, dir.length());
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        return { pos: mid.toArray(), quat: q, len: length };
    }, [a, b]);

    useFrame(({ clock }) => {
        const s = 1 + Math.sin(clock.elapsedTime * 40) * 0.2;
        if (meshRef.current) { meshRef.current.scale.x = s; meshRef.current.scale.z = s; }
    });

    return (
        <group position={pos} quaternion={quat}>
            <mesh ref={meshRef}>
                <cylinderGeometry args={[0.05, 0.05, len, 16, 1, true]} />
                <meshBasicMaterial
                    color="red"
                    transparent
                    opacity={0.95}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}

const MuzzleGlow = ({ p }) => (
    <mesh position={p} scale={[0.12, 0.12, 0.12]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="red" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
);

const ImpactSpark = ({ p }) => (
    <mesh position={p} scale={[0.08, 0.08, 0.08]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="white" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
);

/** Continuous red laser for players with `shootingUntil` in the future. */
export default function BeamLasers() {
    const players = usePlayersList(true);

    return (
        <>
            {players.map((player) => {
                const until = Number(player.getState?.("shootingUntil") || 0);
                if (!until || until < Date.now()) return null;

                // Read pose once per player
                const px = Number(player.getState?.("x") || 0);
                const baseY = Number(player.getState?.("y") || 0);
                const pz = Number(player.getState?.("z") || 0);
                const ry = Number(player.getState?.("ry") || player.getState?.("yaw") || 0);

                // Prefer host endpoints (exact hit)
                let a = readVec(player, "shotFxA");
                let b = readVec(player, "shotFxB");

                // Fallback: compute from gun muzzle so beam always starts at the barrel
                if (!a || !b) {
                    const upY = GUN_OFFSETS.up;                             // 0.95
                    const rightOff = GUN_OFFSETS.right;                     // 0.6
                    const forwardTotal = GUN_OFFSETS.forward + GUN_OFFSETS.barrelZ; // 0.50

                    const fwdX = Math.sin(ry), fwdZ = Math.cos(ry);
                    const rightX = Math.cos(ry), rightZ = -Math.sin(ry);

                    a = [
                        px + rightOff * rightX + forwardTotal * fwdX,
                        baseY + upY,
                        pz + rightOff * rightZ + forwardTotal * fwdZ,
                    ];
                    b = [a[0] + fwdX * 12, baseY + upY, a[2] + fwdZ * 12];
                }

                return (
                    <React.Fragment key={`beam:${player.id}`}>
                        <Laser a={a} b={b} />
                        <MuzzleGlow p={a} />
                        <ImpactSpark p={b} />
                    </React.Fragment>
                );
            })}
        </>
    );
}
