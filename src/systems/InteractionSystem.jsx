import React, { useEffect } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS } from "../data/constants.js";
import { requestAction } from "../network/playroom";

export default function InteractionSystem() {
    const { items } = useItemsSync();

    useEffect(() => {
        function onKey(e) {
            const k = e.key.toLowerCase();
            if (k !== "p" && k !== "o" && k !== "i") return;

            const me = myPlayer();
            const px = Number(me.getState("x") || 0);
            const pz = Number(me.getState("z") || 0);
            const carryId = me.getState("carry") || null; // host sets this on pickup/drop/use

            if (k === "p") {
                // nearest free item within radius
                let best = null, bestD2 = Infinity;
                for (const it of items) {
                    if (it.holder) continue;
                    const dx = px - it.x, dz = pz - it.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 < bestD2 && d2 <= PICKUP_RADIUS * PICKUP_RADIUS) {
                        best = it; bestD2 = d2;
                    }
                }
                if (best) requestAction("pickup", best.id, 0);
            }

            if (k === "o") {
                if (!carryId) return;            // nothing in hand
                requestAction("drop", carryId, 0);
            }

            if (k === "i") {
                if (!carryId) return;

                // try nearest device first
                let nearDev = null, bestD2 = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z;
                    const d2 = dx * dx + dz * dz;
                    const R = Number(d.radius || DEVICE_RADIUS);
                    if (d2 < bestD2 && d2 <= R * R) { nearDev = d; bestD2 = d2; }
                }

                if (nearDev) {
                    requestAction("use", `${nearDev.id}|${carryId}`, 0);
                } else {
                    // fallback: allow eating anywhere
                    const it = items.find(x => x.id === carryId);
                    if (it && it.type === "food") requestAction("use", `eat|${carryId}`, 0);
                }
            }
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [items]);

    return null;
}
