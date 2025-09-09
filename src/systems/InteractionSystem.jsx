import React, { useEffect } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS } from "../data/constants.js";
import { requestAction } from "../network/playroom";

export default function InteractionSystem() {
    const { items } = useItemsSync();

    useEffect(() => {
        const onKey = (e) => {
            const k = e.key.toLowerCase();
            if (k !== "p" && k !== "o" && k !== "i") return;

            const me = myPlayer();
            const px = Number(me.getState("x") || 0);
            const pz = Number(me.getState("z") || 0);

             // read array-based "backpack"; fall back to legacy "bag" JSON if present
                 const bp = me.getState("backpack");
             const bag = Array.isArray(bp) ? bp.map(b => b?.id).filter(Boolean)
                                               : safeParseBag(me.getState("bag"));

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
                if (bag.length === 0) return;
                const lastId = bag[bag.length - 1];
                requestAction("drop", lastId, 0);
            }

            if (k === "i") {
                if (bag.length === 0) return;
                const lastId = bag[bag.length - 1];

                // if we still have the item record, we can check its type
                const it = items.find(x => x.id === lastId);
                // nearest device
                let nearDev = null, bestD2 = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z;
                    const d2 = dx * dx + dz * dz;
                    const R = (d.radius || DEVICE_RADIUS);
                    if (d2 < bestD2 && d2 <= R * R) { nearDev = d; bestD2 = d2; }
                }

                if (nearDev) {
                    requestAction("use", `${nearDev.id}|${lastId}`, 0);
                } else if (it && it.type === "food") {
                    // eat anywhere
                    requestAction("use", `eat|${lastId}`, 0);
                }
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [items]);

    return null;
}

function safeReadBackpack(p) {
  const bp = p?.getState?.("backpack");
  if (Array.isArray(bp)) return bp.map(b => b?.id).filter(Boolean);
  // legacy fallback: "bag" stored as JSON string of ids
  try {
    const legacy = JSON.parse(p?.getState?.("bag") || "[]");
    return Array.isArray(legacy) ? legacy : [];
  } catch {
    return [];
  }
}