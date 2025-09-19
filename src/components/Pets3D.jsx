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

// Renders one pet with local smoothing
function PetFollower({ pet }) {
    const group = useRef();

    // local visual state (start at network values)
    const state = useMemo(() => ({
        x: Number(pet.x || 0),
        y: Number(pet.y ?? 0),
        z: Number(pet.z || 0),
        yaw: Number(pet.yaw || 0),
    }), [pet.id]); // re-init if pet identity changes

    useFrame((_, dt) => {
        // network targets (updated by store)
        const tx = Number(pet.x || 0);
        const ty = Number(pet.y ?? 0);
        const tz = Number(pet.z || 0);
        const tyaw = Number(pet.yaw || 0);

        // smoothing factors (tune to taste)
        const posEase = Math.min(1, dt * 12); // ~quick but smooth
        const yawEase = Math.min(1, dt * 10);

        state.x = lerp(state.x, tx, posEase);
        state.y = lerp(state.y, ty, posEase);
        state.z = lerp(state.z, tz, posEase);
        state.yaw = lerpAngle(state.yaw, tyaw, yawEase);

        if (group.current) {
            group.current.position.set(state.x, state.y, state.z);
            group.current.rotation.set(0, state.yaw, 0);
        }
    });

    return (
        <group ref={group}>
            <RobotDog />
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
