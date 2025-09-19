// src/components/RobotDog.jsx
import React from "react";

export default function RobotDog() {
    // very simple, guaranteed-visible shape (replace later with your fancier mesh)
    return (
        <group scale={[0.8, 0.8, 0.8]}>
            {/* body */}
            <mesh position={[0, 0.2, 0]}>
                <boxGeometry args={[0.8, 0.3, 1.0]} />
                <meshStandardMaterial color="#9aa9ff" metalness={0.2} roughness={0.5} />
            </mesh>
            {/* head */}
            <mesh position={[0, 0.35, 0.65]}>
                <boxGeometry args={[0.35, 0.28, 0.35]} />
                <meshStandardMaterial color="#c7d2fe" />
            </mesh>
            {/* eyes */}
            <mesh position={[-0.09, 0.36, 0.83]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshStandardMaterial emissive="#00f5ff" emissiveIntensity={1.0} />
            </mesh>
            <mesh position={[0.09, 0.36, 0.83]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshStandardMaterial emissive="#00f5ff" emissiveIntensity={1.0} />
            </mesh>
            {/* legs */}
            <mesh position={[-0.25, 0.05, 0.35]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[0.25, 0.05, 0.35]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[-0.25, 0.05, -0.35]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[0.25, 0.05, -0.35]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
        </group>
    );
}
