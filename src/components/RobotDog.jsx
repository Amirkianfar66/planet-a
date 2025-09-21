// src/components/RobotDog.jsx
import React from "react";

export default function RobotDog({
    walkPhase = 0,     // radians, keeps increasing
    walkSpeed = 0,     // m/s (visual)
    idleAction = null, // "tail" | "head" | "paw" | "shake" | null
    idleT = 0,         // 0..1 progress in current idle action
    idleClock = 0,     // seconds; always advances (for breathing at rest)
    flatWalk = false   // true during seek: keep ground-flat but still show subtle motion
}) {
    // Visual walk floor used only for walk amplitude (not movement)
    const animSpeed = Math.max(walkSpeed, 1.0); // keeps legs moving visually in slow seek

    // Gait swing
    const swing = Math.min(0.7, 0.35 + animSpeed * 0.25);
    const s0 = Math.sin(walkPhase);
    const s1 = Math.sin(walkPhase + Math.PI);
    const sHead = Math.sin(walkPhase * 2);

    // Body lean with speed
    const bodyLean = Math.min(0.15, animSpeed * 0.06);

    // Head bob (damped to 0 in flatWalk/seek)
    const headBobY = (flatWalk ? 0.0 : 1.0) * 0.02 * sHead * Math.min(1, animSpeed * 0.8);

    // Subtle walk sway; reduced in flatWalk
    const swayPitch = (flatWalk ? 0.4 : 1.0) * 0.02 * Math.sin(walkPhase + Math.PI * 0.5);
    const swayRoll = (flatWalk ? 0.4 : 1.0) * 0.02 * Math.sin(walkPhase);

    // -------- Idle/Rest body breathing (NEW) --------
    // Strong when still, fades out as walkSpeed rises.
    const rest = Math.max(0, 1 - Math.min(1, walkSpeed * 2)); // 1 at rest → 0 by ~0.5 m/s
    const breath = 0.015 * rest * Math.sin(idleClock * 2.0);   // chest up/down scale
    const restYaw = 0.04 * rest * Math.sin(idleClock * 0.8);   // micro yaw drift
    const restPitch = 0.02 * rest * Math.sin(idleClock * 1.3 + 0.5); // micro pitch drift

    // -------- Idle action envelopes --------
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    const idleE = easeInOut(Math.max(0, Math.min(1, idleT)));

    let headTilt = 0, headYaw = 0;
    let tailYaw = 0, tailPitch = 0;
    let pawLiftFR = 0;
    let bodyShakeYaw = 0;

    // Baseline “alive” micro-look even with no explicit idle action
    const baselineScanYaw = 0.06 * (1 - rest) * Math.sin(idleClock * 0.8); // tiny when walking
    // When completely still, let the baseline scan still happen a bit:
    headYaw += 0.06 * rest * Math.sin(idleClock * 0.8 + 0.7);

    if (idleAction === "tail") {
        tailYaw = Math.sin(idleT * Math.PI * 6) * 0.6 * idleE;
        tailPitch = Math.sin(idleT * Math.PI * 3) * 0.15 * idleE;
    } else if (idleAction === "head") {
        headTilt = 0.35 * Math.sin(idleT * Math.PI) * idleE;
        headYaw += 0.25 * Math.sin(idleT * Math.PI * 2) * idleE;
    } else if (idleAction === "paw") {
        pawLiftFR = 0.12 * Math.sin(idleT * Math.PI) * idleE;
    } else if (idleAction === "shake") {
        bodyShakeYaw = 0.15 * Math.sin(idleT * Math.PI * 10) * idleE;
    } else {
        // no explicit idle action → small baseline scan (already added) + subtle tail twitch at rest
        tailYaw += 0.15 * rest * Math.sin(idleClock * 3.0);
    }

    return (
        <group scale={[0.8, 0.8, 0.8]}>
            {/* body */}
            <group
                rotation={[
                    bodyLean * 0.5 + swayPitch + restPitch,
                    bodyShakeYaw + restYaw,
                    swayRoll
                ]}
            >
                {/* chest/torso mesh with tiny breathing scale in Y */}
                <mesh position={[0, 0.2, 0]} scale={[1, 1 + breath, 1]}>
                    <boxGeometry args={[0.8, 0.3, 1.0]} />
                    <meshStandardMaterial color="#9aa9ff" metalness={0.2} roughness={0.5} />
                </mesh>

                {/* tail */}
                <group position={[0, 0.28, -0.52]} rotation={[tailPitch, tailYaw, 0]}>
                    <mesh>
                        <boxGeometry args={[0.08, 0.08, 0.28]} />
                        <meshStandardMaterial color="#b8c0ff" />
                    </mesh>
                </group>
            </group>

            {/* head */}
            <group position={[0, 0.35 + headBobY, 0.65]} rotation={[headTilt, headYaw + baselineScanYaw, 0]}>
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
            <mesh position={[-0.25, 0.05, 0.35]} rotation={[s0 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>

            <mesh
                position={[0.25, 0.05 + pawLiftFR, 0.35]}
                rotation={[s1 * swing + (pawLiftFR ? 0.25 * pawLiftFR : 0), 0, 0]}
            >
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>

            <mesh position={[-0.25, 0.05, -0.35]} rotation={[s1 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>

            <mesh position={[0.25, 0.05, -0.35]} rotation={[s0 * swing, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
        </group>
    );
}
