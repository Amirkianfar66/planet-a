import React from "react";
import { usePlayersList } from "playroomkit";
import { ROLE_COMPONENTS, Engineer as DefaultRole } from "./characters3d";

export default function Players3D({ dead = [] }) {
  const players = usePlayersList(true);

  return (
    <>
      {players.map((p) => {
        if (dead.includes(p.id)) return null;

        const x = Number(p.getState("x") ?? 0);
        const y = Number(p.getState("y") ?? 0);
        const z = Number(p.getState("z") ?? 0);
        const yaw = Number(p.getState("yaw") ?? 0);

        const name = p.getProfile().name || "Player " + p.id.slice(0, 4);
        const role = String(p.getState("role") || "Engineer"); // fallback to a valid role wrapper
        const speed = Number(p.getState("spd") || 0);
        const airborne = !!p.getState("air");

        const Comp = ROLE_COMPONENTS[role] || DefaultRole;

        return (
          <group key={p.id} position={[x, y, z]} rotation={[0, yaw, 0]}>
            <Comp name={name} showName speed={speed} airborne={airborne} />
          </group>
        );
      })}
    </>
  );
}
