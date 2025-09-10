// src/systems/ItemsHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES, USE_EFFECTS, clamp01 } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, BAG_CAPACITY, PICKUP_COOLDOWN } from "../data/constants.js";

// simple floor + physics params
const FLOOR_Y = 0;
const GRAV = 16;
const DT = 0.05; // 50 ms
const THROW_SPEED = 8;

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);
    const { items, setItems } = useItemsSync();

    // live refs
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    const playersRef = useRef(players);
    useEffect(() => { playersRef.current = players; }, [players]);

    // processed request ids (per player)
    const processed = useRef(new Map());

    // tiny helper
    const getBackpack = (p) => {
        const raw = p?.getState("backpack");
        return Array.isArray(raw) ? raw : [];
    };
    const setBackpack = (p, arr) => p?.setState("backpack", Array.isArray(arr) ? arr : [], true);
    const hasCapacity = (p) => getBackpack(p).length < Number(BAG_CAPACITY || 8);

    // --- Integrate simple physics for thrown items ---
    useEffect(() => {
        if (!host) return;
        const h = setInterval(() => {
            setItems(prev => prev.map(it => {
                if (it.holder) return it;
                let { x, y = FLOOR_Y, z, vx = 0, vy = 0, vz = 0 } = it;
                if (!(vx || vy || vz)) return it;

                vy -= GRAV * DT;
                x += vx * DT; y += vy * DT; z += vz * DT;

                if (y <= FLOOR_Y) {
                    y = FLOOR_Y; vy = 0; vx *= 0.6; vz *= 0.6;
                    if (Math.abs(vx) < 0.02) vx = 0;
                    if (Math.abs(vz) < 0.02) vz = 0;
                }
                return { ...it, x, y, z, vx, vy, vz };
            }), true);
        }, DT * 1000);
        return () => clearInterval(h);
    }, [host, setItems]);

    // --- Host processes client requests (like the working demo) ---
    useEffect(() => {
        if (!host) return;

        const tick = () => {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find(p => p.id === self.id)) everyone.push(self);

            const list = itemsRef.current || [];
            const findItem = (id) => list.find(i => i.id === id);

            for (const p of everyone) {
                const reqId = Number(p?.getState("reqId") || 0);
                if (!reqId) continue;
                if (processed.current.get(p.id) === reqId) continue;

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);
                const name = p.getProfile().name || `Player ${p.id.slice(0, 4)}`;

                const px = Number(p.getState("x") || 0);
                const py = Number(p.getState("y") || 0);
                const pz = Number(p.getState("z") || 0);

                // ---------- PICKUP ----------
                if (type === "pickup") {
                    const nowSec = Math.floor(Date.now() / 1000);
                    let until = Number(p.getState("pickupUntil") || 0);
                    if (until > 1e11) until = Math.floor(until / 1000);
                    if (nowSec < until) { processed.current.set(p.id, reqId); continue; }

                    const it = findItem(target);
                    if (!it) { processed.current.set(p.id, reqId); continue; }
                    if (it.holder && it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }
                    if (!hasCapacity(p)) { processed.current.set(p.id, reqId); continue; }

                    const dx = px - it.x, dz = pz - it.z;
                    if (Math.hypot(dx, dz) > PICKUP_RADIUS) { processed.current.set(p.id, reqId); continue; }

                    // mark held → removes floor copy
                    setItems(prev => prev.map(j =>
                        j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j
                    ), true);

                    // put in hand only if empty
                    const carry = String(p.getState("carry") || "");
                    if (!carry) p.setState("carry", it.id, true);

                    // add to backpack once
                    const bp = getBackpack(p);
                    if (!bp.find(b => b.id === it.id)) setBackpack(p, [...bp, { id: it.id, type: it.type }]);

                    // cooldown
                    p.setState("pickupUntil", nowSec + Number(PICKUP_COOLDOWN || 20), true);

                    console.log("[HOST] PICKUP", it.id, "by", name);
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // ---------- DROP ----------
                if (type === "drop") {
                    const it = findItem(target);
                    if (!it || it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }

                    setItems(prev => prev.map(j =>
                        j.id === it.id ? { ...j, holder: null, x: px, y: Math.max(py + 0.5, FLOOR_Y + 0.01), z: pz, vx: 0, vy: 0, vz: 0 } : j
                    ), true);

                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                    // (optional) remove from backpack on drop:
                    // setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));

                    console.log("[HOST] DROP", it.id, "by", name);
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // ---------- THROW ----------
                if (type === "throw") {
                    const it = findItem(target);
                    if (!it || it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }

                    const yaw = Number(p.getState("yaw") || value || 0); // prefer player yaw if available; else use value
                    const vx = Math.sin(yaw) * THROW_SPEED;
                    const vz = Math.cos(yaw) * THROW_SPEED;
                    const vy = 4.5;

                    setItems(prev => prev.map(j =>
                        j.id === it.id
                            ? { ...j, holder: null, x: px, y: Math.max(py + 1.1, FLOOR_Y + 0.2), z: pz, vx, vy, vz }
                            : j
                    ), true);

                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                    // (optional) remove from backpack on throw:
                    // setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));

                    console.log("[HOST] THROW", it.id, "by", name);
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // ---------- USE ----------
                if (type === "use") {
                    const [kind, idStr] = target.split("|");
                    const it = findItem(idStr);
                    if (!it || it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }

                    // eat food
                    if (kind === "eat" && it.type === "food") {
                        // consume: mark gone (not re-spawned)
                        setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: "_gone_", y: -999 } : j), true);
                        setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                        if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                        console.log("[HOST] EAT", it.id, "by", name);
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    // use on device
                    const dev = DEVICES.find(d => d.id === kind);
                    if (dev) {
                        const dx = px - dev.x, dz = pz - dev.z;
                        const r = Number(dev.radius || DEVICE_RADIUS);
                        if (dx * dx + dz * dz <= r * r) {
                            const eff = USE_EFFECTS?.[it.type]?.[dev.type]; // e.g., ["power", +20]
                            if (eff) {
                                // apply effect via device-side code if you have meters; here we just consume:
                                setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: "_used_", y: -999 } : j), true);
                                setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                                if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                                console.log("[HOST] USE", it.id, "on", dev.id, "by", name);
                            }
                        }
                    }
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // Unknown action → mark processed to avoid repeats
                processed.current.set(p.id, reqId);
            }

            // keep looping (low cost)
            setTimeout(tick, 50);
        };

        console.log("[HOST] ItemsHostLogic running.");
        tick();
        return () => { /* stopped on unmount */ };
    }, [host, setItems]);

    return null;
}
