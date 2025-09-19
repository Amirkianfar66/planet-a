// src/components/Pets3D.jsx
import React from "react";
import useItemsSync from "../systems/useItemsSync.js";
import RobotDog from "./RobotDog.jsx";

export default function Pets3D() {
    const { items } = useItemsSync();
    const pets = (items || []).filter((i) => String(i.type).toLowerCase() === "pet");
    if (!pets.length) return null;

    return (
        <group>
            {pets.map((pet) => (
                <group
                    key={pet.id || `${pet.x}-${pet.z}-${Math.random()}`}
                    position={[Number(pet.x || 0), Number(pet.y ?? 0), Number(pet.z || 0)]}
                    rotation={[0, Number(pet.yaw || 0), 0]}
                >
                    <RobotDog />
                </group>
            ))}
        </group>
    );
}
