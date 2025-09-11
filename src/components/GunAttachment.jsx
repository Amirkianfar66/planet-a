import React, { useMemo } from "react";
import * as THREE from "three";

/** Tiny blaster attached to the player's right side, facing forward. */
export default function GunAttachment({ player }) {
    // read player pose
    const px = Number(player.getState?.("x") || 0);
    const pz = Number(player.getState?.("z") || 0);
    const ry = Number(player.getState?.("ry") || player.getState?.("yaw") || 0);

    // forward & right
    const fwd = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));

    // attach on right side near hands
    const pos = useMemo(() => {
        const base = new THREE.Vector3(px, 1.1, pz); // hand-ish height
        return base.add(right.multiplyScalar(0.25)).add(fwd.multiplyScalar(0.15)).toArray();
    }, [px, pz, ry]);

    return (
        <group position={pos} rotation={[0, ry, 0]}>
            {/* body */}
            <mesh position={[0, 0, 0.08]}>
                <boxGeometry args={[0.08, 0.06, 0.22]} />
                <meshStandardMaterial color="#1f2937" metalness={0.4} roughness={0.3} />
            </mesh>
            {/* grip */}
            <mesh position={[-0.03, -0.05, 0]}>
                <boxGeometry args={[0.03, 0.1, 0.04]} />
                <meshStandardMaterial color="#111827" metalness={0.2} roughness={0.6} />
            </mesh>
            {/* barrel tip (emissive red) */}
            <mesh position={[0, 0, 0.2]}>
                <cylinderGeometry args={[0.012, 0.012, 0.08, 12]} />
                <meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={2} metalness={0.1} roughness={0.6} />
            </mesh>
        </group>
    );
}
