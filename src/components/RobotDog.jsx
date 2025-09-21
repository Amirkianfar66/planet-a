import React from "react";

export default function RobotDog({
    walkPhase = 0,    // radians, keeps increasing
    walkSpeed = 0,    // m/s (visual)
    idleAction = null, // "tail" | "head" | "paw" | "shake" | null
    idleT = 0,        // 0..1 progress in current idle action
    flatWalk = false  // true during seek: keep ground-flat but still show subtle motion
}) {
    // Visual walk floor so parts still move even at very low speeds (seek)
    const animSpeed = Math.max(walkSpeed, 1.0); // purely for animation amplitude (not movement)

    // Gait: swing more when moving faster (clamped)
    const swing = Math.min(0.7, 0.35 + animSpeed * 0.25);

    const s0 = Math.sin(walkPhase);
    const s1 = Math.sin(walkPhase + Math.PI);     // opposite legs
    const sHead = Math.sin(walkPhase * 2);

    // Body lean forward with speed
    const bodyLean = Math.min(0.15, animSpeed * 0.06);

    // Head bob (damp to 0 in flatWalk/seek so root Y stays flat visually)
    const headBobY = (flatWalk ? 0.0 : 1.0) * 0.02 * sHead * Math.min(1, animSpeed * 0.8);

    // Subtle body sway that survives flatWalk (reduced amplitude)
    const swayPitch = (flatWalk ? 0.4 : 1.0) * 0.02 * Math.sin(walkPhase + Math.PI * 0.5);
    const swayRoll = (flatWalk ? 0.4 : 1.0) * 0.02 * Math.sin(walkPhase);

    // -------- Idle action envelopes --------
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    const idleE = easeInOut(Math.max(0, Math.min(1, idleT)));

    // Defaults (no idle)
    let headTilt = 0, headYaw = 0;
    let tailYaw = 0, tailPitch = 0;
    let pawLiftFR = 0;   // front-right paw Y offset
    let bodyShakeYaw = 0;

    if (idleAction === "tail") {
        // wag: figure-eight yaw/pitch
        tailYaw = Math.sin(idleT * Math.PI * 6) * 0.6 * idleE;
        tailPitch = Math.sin(idleT * Math.PI * 3) * 0.15 * idleE;
    } else if (idleAction === "head") {
        // curious tilt & small yaw
        headTilt = 0.35 * Math.sin(idleT * Math.PI) * idleE;
        headYaw = 0.25 * Math.sin(idleT * Math.PI * 2) * idleE;
    } else if (idleAction === "paw") {
        // lift/tap front-right paw
        pawLiftFR = 0.12 * Math.sin(idleT * Math.PI) * idleE; // up-down
    } else if (idleAction === "shake") {
        // quick body shake (yaw oscillation)
        bodyShakeYaw = 0.15 * Math.sin(idleT * Math.PI * 10) * idleE;
    }

    return (
        <group scale={[0.8, 0.8, 0.8]}>
            {/* body */}
            <group rotation={[bodyLean * 0.5 + swayPitch, bodyShakeYaw, swayRoll]}>
                <mesh position={[0, 0.2, 0]}>
                    <boxGeometry args={[0.8, 0.3, 1.0]} />
                    <meshStandardMaterial color="#9aa9ff" metalness={0.2} roughness={0.5} />
                </mesh>

                {/* simple tail (small box), at rear */}
                <group position={[0, 0.28, -0.52]} rotation={[tailPitch, tailYaw, 0]}>
                    <mesh>
                        <boxGeometry args={[0.08, 0.08, 0.28]} />
                        <meshStandardMaterial color="#b8c0ff" />
                    </mesh>
                </group>
            </group>

            {/* head */}
            <group position={[0, 0.35 + headBobY, 0.65]} rotation={[headTilt, headYaw, 0]}>
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
            {/* Front Right (adds idle paw lift) */}
            <mesh
                position={[0.25, 0.05 + pawLiftFR, 0.35]}
                rotation={[s1 * swing + (pawLiftFR ? 0.25 * pawLiftFR : 0), 0, 0]}
            >
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
