// src/systems/InteractionSystem.jsx
import React, { useEffect, useRef } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, PICKUP_COOLDOWN } from "../data/constants.js";

export default function InteractionSystem() {
    const { items } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    useEffect(() => {
        if (window.__planetAInputAttached) return;
        window.__planetAInputAttached = true;
        const down = (window.__planetAInputDown ||= new Set());

        const sendReq = (type, target, value = 0) => {
            const me = myPlayer(); if (!me) return;
            const id = Math.floor(Math.random() * 1e9);
            me.setState("reqId", id, true);
            me.setState("reqType", type, true);
            me.setState("reqTarget", String(target ?? ""), true);
            me.setState("reqValue", Number(value) || 0, true);
        };

        function onKeyDown(e) {
            const k = (e.key || "").toLowerCase();
            if (!["p", "o", "i", "t"].includes(k)) return;
            if (e.repeat || down.has(k)) return;
            down.add(k);

            const me = myPlayer(); if (!me) return;
            const px = Number(me.getState("x") || 0);
            const pz = Number(me.getState("z") || 0);
            const carryId = me.getState("carry") || "";

            if (k === "p") {
                // cooldown client-side gate (host will also enforce)
                const now = Math.floor(Date.now() / 1000);
                let until = Number(me.getState("pickupUntil") || 0);
                if (until > 1e11) until = Math.floor(until / 1000);
                if (now < until) return;

                // nearest free item
                let pick = null, best = Infinity;
                for (const it of (itemsRef.current || [])) {
                    if (it.holder) continue;
                    const dx = px - it.x, dz = pz - it.z, d2 = dx * dx + dz * dz;
                    if (d2 < best && d2 <= PICKUP_RADIUS * PICKUP_RADIUS) { pick = it; best = d2; }
                }
                if (pick) sendReq("pickup", pick.id, 0);
                return;
            }

            if (k === "o") { // drop
                if (carryId) sendReq("drop", carryId, 0);
                return;
            }

            if (k === "t") { // throw forward (yaw may already be on player state)
                if (!carryId) return;
                const yaw = Number(me.getState("yaw") || 0);
                sendReq("throw", carryId, yaw);
                return;
            }

            if (k === "i") { // use: device in range or eat food
                if (!carryId) return;
                // nearest device in range
                let dev = null, best = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z, d2 = dx * dx + dz * dz;
                    const r = Number(d.radius || DEVICE_RADIUS);
                    if (d2 < best && d2 <= r * r) { dev = d; best = d2; }
                }
                if (dev) sendReq("use", `${dev.id}|${carryId}`, 0);
                else {
                    const it = (itemsRef.current || []).find(x => x.id === carryId);
                    if (it?.type === "food") sendReq("use", `eat|${carryId}`, 0);
                }
            }
        }

        function onKeyUp(e) {
            const k = (e.key || "").toLowerCase();
            if (["p", "o", "i", "t"].includes(k)) down.delete(k);
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
