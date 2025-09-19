// src/components/Pets3D.jsx
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import useItemsSync from "../systems/useItemsSync.js";
import RobotDog from "./RobotDog.jsx";

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Renders one pet with local smoothing + walk/bob params
function PetFollower({ pet }) {
    const group = useRef();
    const inner = useRef(); // child group to apply bob/tilt

    // local visual state (smoothed)
    const state = useMemo(() => ({
        x: Number(pet.x || 0),
        y: Number(pet.y ?? 0),
        z: Number(pet.z || 0),
        yaw: Number(pet.yaw || 0),
        prevX: Number(pet.x || 0),
        prevZ: Number(pet.z || 0),
        visSpeed: 0,   // m/s (approx)
        walkPhase: 0,  // radians
    }), [pet.id]);

    useFrame((_, dt) => {
        // targets from network/store
        const tx = Number(pet.x || 0);
        const ty = Number(pet.y ?? 0);
        const tz = Number(pet.z || 0);
        const tyaw = Number(pet.yaw || 0);

        // smooth toward targets
        const posEase = Math.min(1, dt * 12);
        const yawEase = Math.min(1, dt * 10);

        const prevX = state.x, prevZ = state.z;

        state.x = lerp(state.x, tx, posEase);
        state.y = lerp(state.y, ty, posEase);
        state.z = lerp(state.z, tz, posEase);
        state.yaw = lerpAngle(state.yaw, tyaw, yawEase);

        // instantaneous visual speed (m/s) from smoothed motion
        const dx = state.x - prevX;
        const dz = state.z - prevZ;
        const frameDist = Math.hypot(dx, dz);
        const speed = (dt > 0) ? frameDist / dt : 0;

        // low-pass filter the speed a bit
        state.visSpeed = lerp(state.visSpeed, speed, 0.25);

        // advance walk phase based on speed
        // tune 4.5 for step frequency; higher => faster leg swing
        state.walkPhase += state.visSpeed * 4.5 * dt;

        // apply transforms
        if (group.current) {
            group.current.position.set(state.x, state.y, state.z);
            group.current.rotation.set(0, state.yaw, 0);
        }

        // bob amount scales with speed (clamped)
        const bobAmp = clamp(state.visSpeed * 0.02, 0, 0.08);
        const bob = Math.sin(state.walkPhase * 2) * bobAmp; // faster bob
        const tiltPitch = clamp(state.visSpeed * 0.03, 0, 0.12) * Math.sin(state.walkPhase + Math.PI * 0.5); // subtle pitch
        const tiltRoll = clamp(state.visSpeed * 0.02, 0, 0.08) * Math.sin(state.walkPhase); // subtle roll

        if (inner.current) {
            // add vertical bob on inner group (so world Y stays smoothed in parent)
            inner.current.position.y = bob;
            inner.current.rotation.set(tiltPitch, 0, tiltRoll);
        }
    });

    return (
        <group ref={group}>
            <group ref={inner}>
                <RobotDog walkPhase={state.walkPhase} walkSpeed={state.visSpeed} />
            </group>
        </group>
    );
}

export default function Pets3D() {
    const { items } = useItemsSync();
    const pets = (items || []).filter(i => String(i.type).toLowerCase() === "pet");
    if (!pets.length) return null;

    return (
        <group>
            {pets.map(pet => (
                <PetFollower key={pet.id} pet={pet} />
            ))}
        </group>
    );
}
