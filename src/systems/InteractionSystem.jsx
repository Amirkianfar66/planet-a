import React, { useEffect, useRef } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS } from "../data/constants.js";
import { requestAction } from "../network/playroom.js"; // note .js

export default function InteractionSystem() {
    const { items } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    useEffect(() => {
        function onKey(e) {
            const k = (e.key || "").toLowerCase();
            if (k !== "p" && k !== "o" && k !== "i") return;

            const me = myPlayer();
            if (!me) return;

            const px = +me.getState("x") || 0;
            const pz = +me.getState("z") || 0;
            const carryId = me.getState("carry") || null;
            const list = itemsRef.current || [];

            // quick client trace
            console.debug("[Input]", k, { px, pz, carryId, items: list.length });

            if (k === "p") {
                let pick = null, best = Infinity;
                for (const it of list) {
                    if (it.holder) continue;
                    const dx = px - it.x, dz = pz - it.z, d2 = dx * dx + dz * dz;
                    if (d2 < best && d2 <= PICKUP_RADIUS * PICKUP_RADIUS) { pick = it; best = d2; }
                }
                if (pick) requestAction("pickup", pick.id, 0);
                return;
            }

            if (k === "o") {
                if (carryId) requestAction("drop", carryId, 0);
                return;
            }

            if (k === "i") {
                if (!carryId) return;

                let dev = null, best = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z, d2 = dx * dx + dz * dz;
                    const r = +d.radius || DEVICE_RADIUS;
                    if (d2 < best && d2 <= r * r) { dev = d; best = d2; }
                }
                if (dev) requestAction("use", `${dev.id}|${carryId}`, 0);
                else {
                    const it = list.find(x => x.id === carryId);
                    if (it && it.type === "food") requestAction("use", `eat|${carryId}`, 0);
                }
            }
        }

        window.addEventListener("keydown", onKey, { passive: true });
        return () => window.removeEventListener("keydown", onKey);
    }, []); // ← IMPORTANT: empty deps

    return null;
}
