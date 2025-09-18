// src/components/characters3d/InfectedDisguise.jsx
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Props that other role components in your project typically accept:
 * - name, role, showName, bob, speed, airborne, carry, isLocal, dead
 * We ignore most of those here (purely cosmetic form), but keep `dead` and `showName`.
 */
export default function InfectedDisguise({
    name = "???",
    showName = true,
    dead = false,
}) {
    const coreRef = useRef();
    const spikesRef = useRef();
    const veinsRef = useRef();

    // Make a bunch of spikes around a sphere
    const spikeCount = 48;
    const spikeGeo = useMemo(() => new THREE.ConeGeometry(0.06, 0.32, 8), []);
    const spikeMats = useMemo(() => {
        const m = new THREE.MeshStandardMaterial({
            color: new THREE.Color("#111111"),
            metalness: 0.4,
            roughness: 0.35,
            emissive: new THREE.Color("#3a0000"),
            emissiveIntensity: 0.4,
        });
        return m;
    }, []);

    // Random spike orientations/positions, fixed at init
    const spikeTransforms = useMemo(() => {
        const arr = [];
        const tmp = new THREE.Object3D();
        for (let i = 0; i < spikeCount; i++) {
            const theta = Math.acos(THREE.MathUtils.randFloatSpread(2)); // 0..pi
            const phi = Math.random() * Math.PI * 2; // 0..2pi
            const r = 0.42; // radius from core
            const x = r * Math.sin(theta) * Math.cos(phi);
            const y = r * Math.cos(theta);
            const z = r * Math.sin(theta) * Math.sin(phi);
            tmp.position.set(x, y, z);

            // orient cone to point outward
            tmp.lookAt(0, 0, 0);
            tmp.rotateX(Math.PI / 2);

            // small random scale
            const s = 0.8 + Math.random() * 0.6;
            tmp.scale.setScalar(s);

            tmp.updateMatrix();
            arr.push(tmp.matrix.clone());
        }
        return arr;
    }, []);

    // Core + veins materials
    const coreMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: new THREE.Color("#0b0b0b"),
                metalness: 0.55,
                roughness: 0.25,
                emissive: new THREE.Color("#1a0000"),
                emissiveIntensity: 0.6,
            }),
        []
    );

    const veinMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: "#330000",
                emissive: "#b30000",
                emissiveIntensity: 1.1,
                transparent: true,
                opacity: 0.7,
            }),
        []
    );

    // Animate: subtle breathing, pulsing emissive, small idle twitch.
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        const breathe = dead ? 0.0 : 0.04 * Math.sin(t * 1.6);
        const twitch = dead ? 0.0 : 0.01 * Math.sin(t * 8.0 + 1.7);

        if (coreRef.current) {
            const s = 1 + breathe;
            coreRef.current.scale.setScalar(s);
            // pulse emissive a bit
            coreMat.emissiveIntensity = 0.6 + (dead ? 0 : 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2)));
        }
        if (veinsRef.current) {
            // offset & pulse
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
            {/* Core */}
            <mesh ref={coreRef} castShadow receiveShadow>
                <icosahedronGeometry args={[0.38, 1]} />
                <primitive object={coreMat} attach="material" />
            </mesh>

            {/* Veins (slightly larger sphere with red emissive) */}
            <mesh ref={veinsRef}>
                <icosahedronGeometry args={[0.41, 3]} />
                <primitive object={veinMat} attach="material" />
            </mesh>

            {/* Spikes */}
            <instancedMesh
                ref={spikesRef}
                args={[spikeGeo, spikeMats, spikeCount]}
                castShadow
                receiveShadow
            >
                {spikeTransforms.map((m, i) => (
                    <primitive key={i} attach={`instanceMatrix-${i}`} object={m} />
                ))}
            </instancedMesh>

            {/* Floating nameplate (optional) */}
            {showName && (
                <group position={[0, 1.1, 0]}>
                    {/* Replace with your Text component if you have one */}
                    <mesh>
                        <planeGeometry args={[0.9, 0.24]} />
                        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
                    </mesh>
                </group>
            )}
        </group>
    );
}
