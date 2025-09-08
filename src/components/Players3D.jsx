// src/components/Players3D.jsx
import React from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import { ROLE_COMPONENTS, Engineer as DefaultRole } from "./characters3d/index.js"; // explicit path is safest on Vercel
import { myPlayer, usePlayersList } from "playroomkit";
import { DEVICES } from "../data/gameObjects.js";
export default function Players3D({ dead = [] }) {
    const players = usePlayersList(true);
     // helper: nearest device around (x,z)
         const nearestDevice = (x, z) => {
               let best = null, bestD2 = Infinity;
               for (const d of DEVICES) {
                     const dx = d.x - x, dz = d.z - z, d2 = dx * dx + dz * dz;
                     const r = (d.radius || 1.3);
                     if (d2 < bestD2 && d2 <= r * r) { best = d; bestD2 = d2; }
                   }
               return best;
             };

    return (
        <>
            {players.map((p) => {
                if (dead.includes(p.id)) return null;

                const x = Number(p.getState("x") ?? 0);
                const y = Number(p.getState("y") ?? 0);
                const z = Number(p.getState("z") ?? 0);
                const yaw = Number(p.getState("yaw") ?? 0);

                const name = p.getProfile().name || "Player " + p.id.slice(0, 4);
                const role = String(p.getState("role") || "Engineer");
                const speed = Number(p.getState("spd") || 0);
                const airborne = !!p.getState("air");
                const carry = String(p.getState("carry") || "");

                const Comp = ROLE_COMPONENTS[role] || DefaultRole;
                const isLocal = myPlayer().id === p.id;
                
                          const handleUseCarry = () => {
                                 if (!isLocal || !carry) return;
                                 const dev = nearestDevice(x, z);
                                if (dev) {
                                       requestAction("use", `${dev.id}|${carry}`, 0);
                                     } else {
                                       requestAction("use", `eat|${carry}`, 0);
                                    }
                               };
                
                           const handleThrowCarry = () => {
                                 if (!isLocal || !carry) return;
                                 requestAction("throw", carry, yaw);
                               };

                return (
                    <group key={p.id} position={[x, y, z]} rotation={[0, yaw, 0]}>
                        <Comp
+             name={name}
                                     showName
                                     speed={speed}
                                     airborne={airborne}
                                     carry={carry}
                                     isLocal={isLocal}
                                     yaw={yaw}
                                     onClickCarry={handleUseCarry}
                                     onContextMenuCarry={handleThrowCarry}
                    </group>
                );
            })}
        </>
    );
}
