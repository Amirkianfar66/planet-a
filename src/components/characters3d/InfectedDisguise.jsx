// src/components/characters3d/InfectedDisguise.jsx
import React, { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function InfectedDisguise({
    showName = true,
    bob = true,
    speed = 0,
    dead = false,
}) {
    const rootRef = useRef();
    const coreRef = useRef();
    const veinsRef = useRef();
    const spikesRef = useRef();
    const armL = useRef();
    const armR = useRef();
    const legL = useRef();
    const legR = useRef();
    const handL = useRef();
    const handR = useRef();
    const footL = useRef();
    const footR = useRef();

    // --- geo + materials ---
    const spikeCount = 48;
    const spikeGeo = useMemo(() => new THREE.ConeGeometry(0.06, 0.32, 8), []);
    const spikeMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: "#111111",
                metalness: 0.4,
                roughness: 0.35,
                emissive: "#3a0000",
                emissiveIntensity: 0.4,
            }),
        []
    );

    // Precompute instance transforms (Matrix4 list)
    const spikeMatrices = useMemo(() => {
        const arr = [];
        const tmp = new THREE.Object3D();
        for (let i = 0; i < spikeCount; i++) {
            const theta = Math.acos(THREE.MathUtils.randFloatSpread(2)); // 0..pi
            const phi = Math.random() * Math.PI * 2; // 0..2pi
            const r = 0.42;
            const x = r * Math.sin(theta) * Math.cos(phi);
            const y = r * Math.cos(theta);
            const z = r * Math.sin(theta) * Math.sin(phi);
            tmp.position.set(x, y, z);

            // point outward
            tmp.lookAt(0, 0, 0);
            tmp.rotateX(Math.PI / 2);

            // varied scale
            const s = 0.8 + Math.random() * 0.6;
            tmp.scale.setScalar(s);

            tmp.updateMatrix();
            arr.push(tmp.matrix.clone());
        }
        return arr;
    }, [spikeCount]);

    // Materials for core + veins + limbs
    const coreMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: "#0b0b0b",
                metalness: 0.55,
                roughness: 0.25,
                emissive: "#1a0000",
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
    const limbMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: "#0d0d0d",
                metalness: 0.3,
                roughness: 0.45,
                emissive: "#3a0000",
                emissiveIntensity: 0.35,
            }),
        []
    );
    const clawMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: "#1a0000",
                emissive: "#b30000",
                emissiveIntensity: 1.4,
                metalness: 0.2,
                roughness: 0.6,
            }),
        []
    );

    // Populate instance matrices once
    useEffect(() => {
        const im = spikesRef.current;
        if (!im) return;
        for (let i = 0; i < spikeCount; i++) {
            im.setMatrixAt(i, spikeMatrices[i]);
        }
        im.instanceMatrix.needsUpdate = true;
    }, [spikeCount, spikeMatrices]);

    // Animate: breathing, pulse, and very simple walk cycle
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        const breathe = dead ? 0 : 0.04 * Math.sin(t * 1.6);
        const twitch = dead ? 0 : 0.01 * Math.sin(t * 8 + 1.7);

        const gaitSpeed = Math.min(1.5, 0.3 + (Number(speed) || 0) * 0.2);
        const swing = dead ? 0 : 0.5 * Math.sin(t * (2.5 * gaitSpeed));
        const counter = dead ? 0 : 0.5 * Math.sin(t * (2.5 * gaitSpeed) + Math.PI);

        // root bob (bigger for big model)
        if (rootRef.current) {
            rootRef.current.position.y = dead ? 0 : (bob ? 0.06 * Math.sin(t * 3.2) : 0);
        }

        if (coreRef.current) {
            const s = 1 + (breathe && bob ? breathe : 0);
            coreRef.current.scale.setScalar(s);
            coreMat.emissiveIntensity =
                0.6 + (dead ? 0 : 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2)));
        }
        if (veinsRef.current) {
            veinsRef.current.rotation.y = t * 0.25;
            veinMat.emissiveIntensity =
                1.1 + (dead ? 0 : 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6)));
            veinsRef.current.scale.setScalar(1 + (bob ? breathe * 1.5 : 0));
        }
        if (spikesRef.current) {
            spikesRef.current.rotation.y = -t * 0.2;
            spikesRef.current.position.y = twitch;
        }

        // Arm/leg swing
        if (armL.current) armL.current.rotation.x = swing * 0.6;
        if (armR.current) armR.current.rotation.x = counter * 0.6;
        if (legL.current) legL.current.rotation.x = counter * 0.5;
        if (legR.current) legR.current.rotation.x = swing * 0.5;

        // Subtle claw wiggle
        const wiggle = dead ? 0 : 0.15 * Math.sin(t * 6.0);
        if (handL.current) handL.current.rotation.z = wiggle;
        if (handR.current) handR.current.rotation.z = -wiggle * 0.8;
    });

    return (
        // Root scaled 3x; feet designed to sit at y = 0 even after scaling.
        <group ref={rootRef} scale={[1.5, 1.5, 1.5]}>
            {/* Hips at y=0.6 (so legs reach ground), torso centered ~1.2 */}
            <group position={[0, 0.6, 0]}>
                {/* Torso core */}
                <mesh ref={coreRef} castShadow receiveShadow position={[0, 0.6, 0]}>

                <icosahedronGeometry args={[0.38, 1]} />
                <primitive object={coreMat} attach="material" />
            </mesh>

            {/* Veins shell */}
            <mesh ref={veinsRef} position={[0, 0.6, 0]}>
                <icosahedronGeometry args={[0.41, 3]} />
                <primitive object={veinMat} attach="material" />
            </mesh>

            {/* Spikes around torso */}
            <instancedMesh
                ref={spikesRef}
                args={[spikeGeo, spikeMat, spikeCount]}
                castShadow
                receiveShadow
                position={[0, 0.6, 0]}
            />

            {/* ===== LIMBS ===== */}

            {/* LEFT ARM (upper at shoulder) */}
            <group ref={armL} position={[-0.55, 0.9, 0]}>
                {/* upper arm */}
                <mesh castShadow receiveShadow rotation={[0, 0, Math.PI * 0.04]}>
                    <capsuleGeometry args={[0.08, 0.35, 8, 16]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
                {/* forearm */}
                <mesh castShadow receiveShadow position={[0, -0.45, 0]} rotation={[0, 0, Math.PI * -0.02]}>
                    <capsuleGeometry args={[0.07, 0.32, 8, 16]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
                {/* hand / claws */}
                <group ref={handL} position={[0, -0.75, 0]}>
                    <mesh castShadow receiveShadow position={[0.05, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.06, 0.18, 8]} />
                        <primitive object={clawMat} attach="material" />
                    </mesh>
                    <mesh castShadow receiveShadow position={[-0.05, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.06, 0.18, 8]} />
                        <primitive object={clawMat} attach="material" />
                    </mesh>
                    <mesh castShadow receiveShadow position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.05, 0.16, 8]} />
                        <primitive object={clawMat} attach="material" />
                    </mesh>
                </group>
            </group>

            {/* RIGHT ARM */}
            <group ref={armR} position={[0.55, 0.9, 0]}>
                <mesh castShadow receiveShadow rotation={[0, 0, Math.PI * -0.04]}>
                    <capsuleGeometry args={[0.08, 0.35, 8, 16]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
                <mesh castShadow receiveShadow position={[0, -0.45, 0]} rotation={[0, 0, Math.PI * 0.02]}>
                    <capsuleGeometry args={[0.07, 0.32, 8, 16]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
                <group ref={handR} position={[0, -0.75, 0]}>
                    <mesh castShadow receiveShadow position={[0.05, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.06, 0.18, 8]} />
                        <primitive object={clawMat} attach="material" />
                    </mesh>
                    <mesh castShadow receiveShadow position={[-0.05, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.06, 0.18, 8]} />
                        <primitive object={clawMat} attach="material" />
                    </mesh>
                    <mesh castShadow receiveShadow position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
                        <coneGeometry args={[0.05, 0.16, 8]} />
                        <primitive object={clawMat} attach="material" />
                    </mesh>
                </group>
            </group>

            {/* LEFT LEG */}
            <group ref={legL} position={[-0.28, 0.6, 0]}>
                <mesh castShadow receiveShadow>
                    <capsuleGeometry args={[0.1, 0.45, 8, 16]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
                {/* foot (flat) at ground */}
                <mesh ref={footL} castShadow receiveShadow position={[0, -0.6, 0]}>
                    <boxGeometry args={[0.28, 0.12, 0.42]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
            </group>

            {/* RIGHT LEG */}
            <group ref={legR} position={[0.28, 0.6, 0]}>
                <mesh castShadow receiveShadow>
                    <capsuleGeometry args={[0.1, 0.45, 8, 16]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
                <mesh ref={footR} castShadow receiveShadow position={[0, -0.6, 0]}>
                    <boxGeometry args={[0.28, 0.12, 0.42]} />
                    <primitive object={limbMat} attach="material" />
                </mesh>
            </group>

            {/* Optional nameplate (kept near chest) */}
            {showName && (
                <group position={[0, 1.5, 0]}>
                    <mesh>
                        <planeGeometry args={[0.9, 0.24]} />
                        <meshBasicMaterial color="#000000" transparent opacity={0.45} />
                    </mesh>
                </group>
            )}
        </group>
    </group >
  );
}
