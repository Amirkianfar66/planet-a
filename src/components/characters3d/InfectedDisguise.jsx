// src/components/characters3d/InfectedDisguise.jsx
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function InfectedDisguise({ showName = true, dead = false }) {
    const coreRef = useRef(), spikesRef = useRef(), veinsRef = useRef();

    const spikeCount = 48;
    const spikeGeo = useMemo(() => new THREE.ConeGeometry(0.06, 0.32, 8), []);
    const spikeMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: "#111111", metalness: 0.4, roughness: 0.35, emissive: "#3a0000", emissiveIntensity: 0.4,
    }), []);
    const spikeMats = spikeMat; // instancedMesh needs a material

    const spikeTransforms = useMemo(() => {
        const arr = [];
        const tmp = new THREE.Object3D();
        for (let i = 0; i < spikeCount; i++) {
            const theta = Math.acos(THREE.MathUtils.randFloatSpread(2));
            const phi = Math.random() * Math.PI * 2;
            const r = 0.42;
            tmp.position.set(
                r * Math.sin(theta) * Math.cos(phi),
                r * Math.cos(theta),
                r * Math.sin(theta) * Math.sin(phi)
            );
            tmp.lookAt(0, 0, 0);
            tmp.rotateX(Math.PI / 2);
            const s = 0.8 + Math.random() * 0.6;
            tmp.scale.setScalar(s);
            tmp.updateMatrix();
            arr.push(tmp.matrix.clone());
        }
        return arr;
    }, []);

    const coreMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: "#0b0b0b", metalness: 0.55, roughness: 0.25, emissive: "#1a0000", emissiveIntensity: 0.6,
    }), []);
    const veinMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: "#330000", emissive: "#b30000", emissiveIntensity: 1.1, transparent: true, opacity: 0.7,
    }), []);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        const breathe = dead ? 0 : 0.04 * Math.sin(t * 1.6);
        const twitch = dead ? 0 : 0.01 * Math.sin(t * 8 + 1.7);

        if (coreRef.current) {
            const s = 1 + breathe;
            coreRef.current.scale.setScalar(s);
            coreMat.emissiveIntensity = 0.6 + (dead ? 0 : 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2)));
        }
        if (veinsRef.current) {
            veinsRef.current.rotation.y = t * 0.25;
            veinMat.emissiveIntensity = 1.1 + (dead ? 0 : 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6)));
            veinsRef.current.scale.setScalar(1 + breathe * 1.5);
        }
        if (spikesRef.current) {
            spikesRef.current.rotation.y = -t * 0.2;
            spikesRef.current.position.y = twitch;
        }
    });

    return (
        <group>
            <mesh ref={coreRef} castShadow receiveShadow>
                <icosahedronGeometry args={[0.38, 1]} />
                <primitive object={coreMat} attach="material" />
            </mesh>
            <mesh ref={veinsRef}>
                <icosahedronGeometry args={[0.41, 3]} />
                <primitive object={veinMat} attach="material" />
            </mesh>
            <instancedMesh ref={spikesRef} args={[spikeGeo, spikeMats, spikeCount]} castShadow receiveShadow>
                {spikeTransforms.map((m, i) => (
                    <primitive key={i} attach={`instanceMatrix-${i}`} object={m} />
                ))}
            </instancedMesh>
            {showName && (
                <group position={[0, 1.1, 0]}>
                    <mesh>
                        <planeGeometry args={[0.9, 0.24]} />
                        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
                    </mesh>
                </group>
            )}
        </group>
    );
}
