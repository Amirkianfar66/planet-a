import React, { useEffect, useRef } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, PICKUP_COOLDOWN } from "../data/constants.js";
import { requestAction } from "../network/playroom.js";

/**
 * Keyboard handler for P/O/I.
 * - Singleton listener (guards against double mounts and OS key-repeat)
 * - Reads items via ref (no re-subscribes)
 */
export default function InteractionSystem() {
    const { items } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    useEffect(() => {
        if (window.__planetAInputAttached) return;
        window.__planetAInputAttached = true;

        // Global set to block repeat
        window.__planetAInputDown = window.__planetAInputDown || new Set();
        const down = window.__planetAInputDown;

        function onKeyDown(e) {
            const k = (e.key || "").toLowerCase();
            if (k !== "p" && k !== "o" && k !== "i") return;
            if (e.repeat || down.has(k)) return;
            down.add(k);

            const me = myPlayer();
            if (!me) return;

            const px = +me.getState("x") || 0;
            const pz = +me.getState("z") || 0;
            const carryId = me.getState("carry") || null;
            const list = itemsRef.current || [];

            // ---------- PICKUP (P) ----------
            if (k === "p") {
                // allow pickup EVEN IF already holding something:
                // - host will add to backpack
                // - if not holding, host may also set carry
                // cooldown UX (host is authoritative)
                const nowSec = Math.floor(Date.now() / 1000);
                let until = Number(me.getState("pickupUntil") || 0);
                if (until > 1e11) until = Math.floor(until / 1000); // normalize if ms slipped in

                if (nowSec < until) {
                    const left = Math.max(0, Math.ceil(until - nowSec));
                    console.warn(`[pickup] cooldown: ${left}s remaining (of ${PICKUP_COOLDOWN}s)`);
                    return;
                }

                // find nearest free item within radius
                let pick = null, best = Infinity;
                for (const it of list) {
                    if (it.holder) continue; // skip items already owned by someone
                    const dx = px - it.x, dz = pz - it.z, d2 = dx * dx + dz * dz;
                    if (d2 < best && d2 <= PICKUP_RADIUS * PICKUP_RADIUS) { pick = it; best = d2; }
                }
                if (pick) requestAction("pickup", pick.id, 0);
                return;
            }

            // ---------- DROP (O) ----------
            if (k === "o") {
                if (carryId) requestAction("drop", carryId, 0);
                return;
            }

            // ---------- USE (I) ----------
            if (k === "i") {
                if (!carryId) return;

                // nearest device first
                let dev = null, best = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z, d2 = dx * dx + dz * dz;
                    const r = +d.radius || DEVICE_RADIUS;
                    if (d2 < best && d2 <= r * r) { dev = d; best = d2; }
                }

                if (dev) {
                    requestAction("use", `${dev.id}|${carryId}`, 0);
                } else {
                    const it = list.find(x => x.id === carryId);
                    if (it && it.type === "food") requestAction("use", `eat|${carryId}`, 0);
                }
            }
        }

        function onKeyUp(e) {
            const k = (e.key || "").toLowerCase();
            if (k === "p" || k === "o" || k === "i") down.delete(k);
        }

        window.addEventListener("keydown", onKeyDown, { passive: true });
        window.addEventListener("keyup", onKeyUp, { passive: true });

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            delete window.__planetAInputAttached;
        };
    }, []);

    return null;
}
