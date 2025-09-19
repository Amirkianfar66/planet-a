// src/components/RobotDog.jsx
import React from "react";

export default function RobotDog({
    walkPhase = 0,   // radians, keeps increasing
    walkSpeed = 0,   // m/s
}) {
    // gait: swing more when moving faster (clamped)
    const swing = Math.min(0.7, 0.35 + walkSpeed * 0.25);
    const s0 = Math.sin(walkPhase);
    const s1 = Math.sin(walkPhase + Math.PI); // opposite legs
    const sHead = Math.sin(walkPhase * 2);

    // body slight lean forward with speed
    const bodyLean = Math.min(0.15, walkSpeed * 0.06);

    // Head bob
    const headBobY = 0.02 * sHead * Math.min(1, walkSpeed * 0.8);

    return (
        <group scale={[0.8, 0.8, 0.8]}>
            {/* body */}
            <group rotation={[bodyLean * 0.5, 0, 0]}>
                <mesh position={[0, 0.2, 0]}>
                    <boxGeometry args={[0.8, 0.3, 1.0]} />
                    <meshStandardMaterial color="#9aa9ff" metalness={0.2} roughness={0.5} />
                </mesh>
            </group>

            {/* head */}
            <group position={[0, 0.35 + headBobY, 0.65]}>
                <mesh>
                    <boxGeometry args={[0.35, 0.28, 0.35]} />
                    <meshStandardMaterial color="#c7d2fe" />
                </mesh>
                {/* eyes */}
                <mesh position={[-0.09, 0.01, 0.18]}>
                    <sphereGeometry args={[0.04, 12, 12]} />
                    <meshStandardMaterial emissive="#00f5ff" emissiveIntensity={1.0} />
                </mesh>
                <mesh position={[0.09, 0.01, 0.18]}>
                    <sphereGeometry args={[0.04, 12, 12]} />
                    <meshStandardMaterial emissive="#00f5ff" emissiveIntensity={1.0} />
                </mesh>
            </group>

            {/* legs */}
            {/* Front Left */}
            <mesh position={[-0.25, 0.05, 0.35]} rotation={[s0 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            {/* Front Right */}
            <mesh position={[0.25, 0.05, 0.35]} rotation={[s1 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            {/* Back Left */}
            <mesh position={[-0.25, 0.05, -0.35]} rotation={[s1 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            {/* Back Right */}
            <mesh position={[0.25, 0.05, -0.35]} rotation={[s0 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
        </group>
    );
}
