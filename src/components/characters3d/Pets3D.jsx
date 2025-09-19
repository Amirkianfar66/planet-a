import React from "react";
import useItemsSync from "../systems/useItemsSync.js";

/**
 * Very simple visual for pets: a small sphere that follows the owner.
 * It reads the world `items` from the synced store, so no props needed.
 */
export default function Pets3D() {
    const { items } = useItemsSync();            // <-- get items here
    const pets = (items || []).filter(i => i.type === "pet");

    if (!pets.length) return null;

    return (
        <group>
            {pets.map(pet => (
                <mesh
                    key={pet.id}
                    position={[
                        Number(pet.x || 0),
                        Number((pet.y ?? 0) + (pet.hover ?? 0.35)),
                        Number(pet.z || 0),
                    ]}
                    rotation={[0, Number(pet.yaw || 0), 0]}
                >
                    <sphereGeometry args={[0.25, 16, 16]} />
                    <meshStandardMaterial />
                </mesh>
            ))}
        </group>
    );
}
