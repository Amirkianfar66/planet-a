import React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

function PetMesh({ position = [0, 0, 0], yaw = 0 }) {
    const ref = React.useRef();
    useFrame((_, t) => {
        if (!ref.current) return;
        // gentle idle wobble
        ref.current.position.y += Math.sin(t * 2.2) * 0.002;
    });
    return (
        <group ref={ref} position={position} rotation={[0, yaw, 0]}>
            {/* body */}
            <mesh castShadow receiveShadow>
                <sphereGeometry args={[0.18, 16, 16]} />
                <meshStandardMaterial metalness={0.6} roughness={0.3} color="#a7c4ff" />
            </mesh>
            {/* eye strip */}
            <mesh position={[0, 0.06, 0.15]} rotation={[0, 0, 0]}>
                <boxGeometry args={[0.18, 0.05, 0.02]} />
                <meshStandardMaterial emissive="#00d0ff" emissiveIntensity={1.4} color="#002a33" />
            </mesh>
            {/* little antenna */}
            <mesh position={[0.06, 0.22, 0]}>
                <cylinderGeometry args={[0.01, 0.01, 0.18, 8]} />
                <meshStandardMaterial metalness={0.8} roughness={0.2} color="#dde8ff" />
            </mesh>
        </group>
    );
}

export default function Pets3D({ items = [] }) {
    const pets = (items || []).filter(i => i.type === "pet");
    return pets.map(p => (
        <PetMesh key={p.id} position={[p.x || 0, (p.y || 0), p.z || 0]} yaw={p.yaw || 0} />
    ));
}
