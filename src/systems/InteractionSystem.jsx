// src/systems/InteractionSystem.jsx
import React, { useEffect, useRef } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, PICKUP_COOLDOWN } from "../data/constants.js";
import { requestAction } from "../network/playroom.js";

export default function InteractionSystem() {
    const { items } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    useEffect(() => {
        if (window.__planetAInputAttached) return;
        window.__planetAInputAttached = true;
        const down = (window.__planetAInputDown ||= new Set());

        function onKeyDown(e) {
            const k = (e.key || "").toLowerCase(); if (!["p", "o", "i"].includes(k)) return;
            if (e.repeat || down.has(k)) return; down.add(k);

            const me = myPlayer(); if (!me) return;
            const px = +me.getState("x") || 0, pz = +me.getState("z") || 0;
            const carryId = me.getState("carry") || null;
            const list = itemsRef.current || [];

            if (k === "p") {
                const now = Math.floor(Date.now() / 1000);
                let until = Number(me.getState("pickupUntil") || 0);
                if (until > 1e11) until = Math.floor(until / 1000);
                if (now < until) return;

                // nearest free item
                let pick = null, best = Infinity;
                for (const it of list) {
                    if (it.holder) continue;
                    const dx = px - it.x, dz = pz - it.z, d2 = dx * dx + dz * dz;
                    if (d2 < best && d2 <= PICKUP_RADIUS * PICKUP_RADIUS) { pick = it; best = d2; }
                }
                if (pick) requestAction("pickup", pick.id, 0);
                return;
            }

            if (k === "o") { if (carryId) requestAction("drop", carryId, 0); return; }

            if (k === "i") {
                if (!carryId) return;
                let dev = null, best = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z, d2 = dx * dx + dz * dz; const r = (+d.radius) || DEVICE_RADIUS;
                    if (d2 < best && d2 <= r * r) { dev = d; best = d2; }
                }
                if (dev) requestAction("use", `${dev.id}|${carryId}`, 0);
            }
        }
        function onKeyUp(e) { const k = (e.key || "").toLowerCase(); if (["p", "o", "i"].includes(k)) (window.__planetAInputDown).delete(k); }
        window.addEventListener("keydown", onKeyDown, { passive: true });
        window.addEventListener("keyup", onKeyUp, { passive: true });
        return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); delete window.__planetAInputAttached; };
    }, []);
    return null;
}
