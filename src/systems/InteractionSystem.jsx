// src/systems/InteractionSystem.jsx
import React, { useEffect, useRef } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS } from "../data/constants.js";

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
                const me = myPlayer(); if (!me) return;
                const bp = Array.isArray(me.getState("backpack")) ? me.getState("backpack") : [];
                const hasType = (t) => bp.some(b => String(b.type).toLowerCase() === t);
                const isTank = (t) => ["food_tank", "fuel_tank", "protection_tank"].includes(String(t).toLowerCase());
                const tankWants = { food_tank: "food", fuel_tank: "fuel", protection_tank: "protection" };
                
                      // 1) Gather candidates within radius, excluding pets and held items
                        const near = [];
                        for (const it of (itemsRef.current || [])) {
                        if (!it || it.holder) continue;
                        if (String(it.type).toLowerCase() === "pet") continue;
                        const dx = px - it.x, dz = pz - it.z, d2 = dx * dx + dz * dz;
                        if (d2 <= PICKUP_RADIUS * PICKUP_RADIUS) near.push([it, d2]);
                     }
                     if (!near.length) return;
                
                      // 2) Split into (A) real items and (B) tanks-that-can-load-now
                      const canLoadTank = (it) => {
                            if (!isTank(it.type)) return false;
                            const want = tankWants[String(it.type).toLowerCase()];
                           const cap = Number(it.cap ?? 6);
                            const stored = Number(it.stored ?? 0);
                            return stored < cap && hasType(want);
                          };
                      const realItems = near.filter(([it]) => !isTank(it.type));
                      const loadableTanks = near.filter(([it]) => canLoadTank(it));
                
                      // 3) Prefer nearest real item; otherwise nearest loadable tank
                      const pickEntry =
                            (realItems.sort((a, b) => a[1] - b[1])[0]) ||
                            (loadableTanks.sort((a, b) => a[1] - b[1])[0]);
                  if (!pickEntry) return;
                  const [pick] = pickEntry;
                  sendReq("pickup", pick.id, 0);
                  return;
            }

            if (k === "o") { if (carryId) sendReq("drop", carryId, 0); return; }

            if (k === "t") {
                if (!carryId) return;
                const yaw = Number(me.getState("yaw") || 0);
                sendReq("throw", carryId, yaw);
                return;
            }

            if (k === "i") {
                if (!carryId) return;

                // nearest device
                let dev = null, best = Infinity;
                for (const d of DEVICES) {
                    const dx = px - d.x, dz = pz - d.z, d2 = dx * dx + dz * dz;
                    const r = Number(d.radius || DEVICE_RADIUS);
                    if (d2 < best && d2 <= r * r) { dev = d; best = d2; }
                }
                if (dev) {
                    // Use item on a device
                    sendReq("use", `${dev.id}|${carryId}`, 0);
                    return;
                }

                // No device nearby — special cases (eat / place CCTV)
                const worldItem = (itemsRef.current || []).find(x => x.id === carryId);
                const isCameraIdOnly = /^cam_/.test(String(carryId)); // daily backpack cam ids
                const isCameraType = worldItem?.type === "cctv";
                const isFood = worldItem?.type === "food";

                if (isCameraType || isCameraIdOnly) {
                    // Place CCTV (works even if camera exists only in backpack)
                    sendReq("use", `place|${carryId}`, 0);
                    return;
                }

                if (isFood) {
                    // Eat food
                    sendReq("use", `eat|${carryId}`, 0);
                    return;
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
