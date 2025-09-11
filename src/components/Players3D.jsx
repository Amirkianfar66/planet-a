import React from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import { ROLE_COMPONENTS, Engineer as DefaultRole } from "./characters3d/index.js";
import { DEVICES } from "../data/gameObjects.js";
import { requestAction } from "../network/playroom";

export default function Players3D({ dead = [] }) {
    const players = usePlayersList(true);

    const nearestDevice = (x, z) => {
        let best = null, bestD2 = Infinity;
        for (const d of DEVICES) {
            const dx = d.x - x, dz = d.z - z;
            const d2 = dx * dx + dz * dz;
            const r = (d.radius || 1.3);
            if (d2 <= r * r && d2 < bestD2) { best = d; bestD2 = d2; }
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

                // ✅ Prefer the editable, network-synced name
                const nameState = String(p.getState?.("name") ?? "").trim();
                const baseName =
                    nameState ||
                    p.getProfile?.().name ||
                    p.name ||
                    `Player-${String(p.id || "").slice(-4)}`;

                const role = String(p.getState("role") || "Engineer");

                // Show "Name — Role" above the head (adjust if you want only the name)
                const headLabel = role ? `${baseName} — ${role}` : baseName;

                const speed = Number(p.getState("spd") || 0);
                const airborne = !!p.getState("air");
                const carry = String(p.getState("carry") || "");

                const Comp = ROLE_COMPONENTS[role] || DefaultRole;
                const isLocal = myPlayer().id === p.id;

                const handleUseCarry = () => {
                    if (!isLocal || !carry) return;
                    const dev = nearestDevice(x, z);
                    if (dev) requestAction("use", `${dev.id}|${carry}`, 0);
                    else requestAction("use", `eat|${carry}`, 0);
                };

                const handleThrowCarry = () => {
                    if (!isLocal || !carry) return;
                    requestAction("throw", carry, yaw);
                };

                return (
                    <group key={p.id} position={[x, y, z]} rotation={[0, yaw, 0]}>
                        <Comp
                            name={headLabel}    // ← use the synced name (and role)
                            showName
                            speed={speed}
                            airborne={airborne}
                            carry={carry}
                            isLocal={isLocal}
                            onClickCarry={handleUseCarry}
                            onContextMenuCarry={handleThrowCarry}
                        />
                    </group>
                );
            })}
        </>
    );
}
