// src/systems/InteractionSystem.jsx
import React, { useEffect, useRef } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS } from "../data/constants.js";
import { requestAction } from "../network/playroom.js";

export default function InteractionSystem() {
    const { items } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    useEffect(() => {
        // ensure single global listener
        if (window.__planetAInputAttached) return;
        window.__planetAInputAttached = true;

        const downRef = new Set();

        function onKeyDown(e) {
            const k = (e.key || "").toLowerCase();
            if (k !== "p" && k !== "o" && k !== "i") return;

            // prevent OS repeat / double listeners triggering
            if (e.repeat || downRef.has(k)) return;
            downRef.add(k);

            const me = myPlayer();
            if (!me) return;

            const px = +me.getState("x") || 0;
            const pz = +me.getState("z") || 0;
            const carryId = me.getState("carry") || null;
            const list = itemsRef.current || [];

            if (k === "p") {
                if (carryId) return; // already holding something
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

        function onKeyUp(e) {
            const k = (e.key || "").toLowerCase();
            if (k === "p" || k === "o" || k === "i") {
                // clear pressed state
                // (guard if this listener becomes singleton across hot reloads)
                try { window.__planetAInputDown?.delete(k); } catch { }
            }
        }

        // keep a global set so it survives if component remounts
        window.__planetAInputDown = window.__planetAInputDown || new Set();
        const globalDown = window.__planetAInputDown;

        // proxy to global set
        const keydown = (e) => {
            if (e.repeat) return;
            const k = (e.key || "").toLowerCase();
            if (k === "p" || k === "o" || k === "i") {
                if (globalDown.has(k)) return;
                globalDown.add(k);
            }
            onKeyDown(e);
        };
        const keyup = (e) => {
            const k = (e.key || "").toLowerCase();
            globalDown.delete(k);
            onKeyUp(e);
        };

        window.addEventListener("keydown", keydown, { passive: true });
        window.addEventListener("keyup", keyup, { passive: true });

        return () => {
            window.removeEventListener("keydown", keydown);
            window.removeEventListener("keyup", keyup);
            window.__planetAInputAttached = false;
        };
    }, []);

    return null;
}
