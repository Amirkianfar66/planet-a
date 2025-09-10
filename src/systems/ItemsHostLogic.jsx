// src/systems/ItemsHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { useMeters, hostAppendEvent, useEvents } from "../network/playroom.js";
import { DEVICES, USE_EFFECTS, clamp01 } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, BAG_CAPACITY, PICKUP_COOLDOWN } from "../data/constants.js";

const FLOOR_Y = 0;
const GRAV = 16;
const THROW_SPEED = 8;

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);

    const { items, setItems } = useItemsSync();
    const { setOxygen, setPower, setCCTV } = useMeters();
    const { events, setEvents } = useEvents();

    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    const playersRef = useRef(players);
    useEffect(() => { playersRef.current = players; }, [players]);

    // processed reqId per player to avoid reprocessing the same action
    const processed = useRef(new Map());

    /* ---------------- Helpers ---------------- */
    const nameFromItem = (it) => {
        switch (String(it?.type)) {
            case "o2can": return "O₂ Canister";
            case "battery": return "Battery";
            case "fuel": return "Fuel Rod";
            case "food": return "Food";
            default: return (it?.type || "Item").toString();
        }
    };

    const getBackpack = (p) => {
        try {
            const raw = p.getState("backpack");
            return Array.isArray(raw) ? raw : [];
        } catch { return []; }
    };

    const setBackpack = (p, arr) => {
        try { p.setState("backpack", Array.isArray(arr) ? arr : [], true); } catch { }
    };

    const hasCapacity = (p) => {
        const cap = Number(BAG_CAPACITY || 8);
        const n = getBackpack(p).length;
        return n < cap;
    };

    // meters apply helper
    const applyMeterDelta = (meter, delta) => {
        const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
        if (meter === "oxygen") setOxygen((v) => clamp01(n(v, 100) + delta), true);
        if (meter === "power") setPower((v) => clamp01(n(v, 100) + delta), true);
        if (meter === "cctv") setCCTV((v) => clamp01(n(v, 100) + delta), true);
    };

    // Announce once
    useEffect(() => { if (host) console.log("[HOST] ItemsHostLogic active."); }, [host]);

    // Log item ids once when they change (handy while debugging)
    const idSetRef = useRef(null);
    useEffect(() => {
        if (!host) return;
        const prev = idSetRef.current;
        const curr = new Set(items.map(i => i.id));
        let changed = !prev || prev.size !== curr.size;
        if (!changed && prev) for (const id of curr) { if (!prev.has(id)) { changed = true; break; } }
        if (changed) {
            console.groupCollapsed(`[HOST] items changed (${items.length})`);
            console.table(items.map(i => ({ id: i.id, type: i.type, holder: i.holder })));
            console.groupEnd();
            idSetRef.current = curr;
        }
    }, [host, items]);

    // Simple physics for thrown items
    useEffect(() => {
        if (!host) return;
        const id = setInterval(() => {
            setItems(prev =>
                prev.map((it) => {
                    if (it.holder) return it; // carried → skip physics
                    let { x, y = FLOOR_Y, z, vx = 0, vy = 0, vz = 0 } = it;
                    if (!(vx || vy || vz)) return it;

                    // integrate
                    vy -= GRAV * 0.05;
                    x += vx * 0.05; y += vy * 0.05; z += vz * 0.05;

                    // collide with floor
                    if (y <= FLOOR_Y) {
                        y = FLOOR_Y; vy = 0; vx *= 0.6; vz *= 0.6;
                        if (Math.abs(vx) < 0.02) vx = 0;
                        if (Math.abs(vz) < 0.02) vz = 0;
                    }
                    if (vx === 0 && vy === 0 && vz === 0) {
                        return { ...it, x, y, z, vx: 0, vy: 0, vz: 0 };
                    }
                    return { ...it, x, y, z, vx, vy, vz };
                }),
                true);
        }, 50);
        return () => clearInterval(id);
    }, [host, setItems]);

    /* -------- rAF-driven host processing (exposed to HostRafDriver) -------- */
    useEffect(() => {
        if (!host) return;

        const process = () => {
            const selfNow = myPlayer();
            const list = [...(playersRef.current || [])];
            if (selfNow) list.push(selfNow);

            // dedupe by id
            const seen = new Set();
            const everyone = list.filter(p => p && !seen.has(p.id) && seen.add(p.id));

            for (const p of everyone) {
                const reqId = Number(p.getState("reqId") || 0);
                const prev = processed.current.get(p.id);
                if (prev && prev.id === reqId) continue; // already handled

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);

                // Ignore initial/uninitialized state (id=0), but mark processed so we don't spam
                if (reqId === 0) {
                    processed.current.set(p.id, { id: 0 });
                    continue;
                }

                console.log(`[HOST] req ${p.id.slice(0, 4)}: type=${type} target=${target} val=${value} id=${reqId}`);

                const name = p.getProfile().name || `Player ${p.id.slice(0, 4)}`;
                const px = Number(p.getState("x") || 0);
                const py = Number(p.getState("y") || 0);
                const pz = Number(p.getState("z") || 0);

                const itemsNow = itemsRef.current || [];
                const findItem = (id) => itemsNow.find((i) => i.id === id);

                /* -------------------- PICKUP -------------------- */
                if (type === "pickup") {
                    // cooldown (seconds) with ms→s safety
                    const nowSec = Math.floor(Date.now() / 1000);
                    let until = Number(p.getState("pickupUntil") || 0);
                    if (until > 1e11) until = Math.floor(until / 1000);
                    if (nowSec < until) {
                        const left = Math.max(0, Math.ceil(until - nowSec));
                        hostAppendEvent(setEvents, `${name} tried to pick up but is on cooldown (${left}s left).`);
                        processed.current.set(p.id, { id: reqId });
                        continue;
                    }

                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to pick up a missing item (${target}).`);
                    } else if (it.holder && it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to pick up ${it.type} but it's already held.`);
                    } else if (!hasCapacity(p)) {
                        hostAppendEvent(setEvents, `${name}'s backpack is full.`);
                    } else {
                        const dx = px - it.x, dz = pz - it.z;
                        const dist = Math.hypot(dx, dz);
                        console.log(`[HOST] pickup check ${it.id} dist=${dist.toFixed(2)} R=${PICKUP_RADIUS}`);

                        if (dist <= PICKUP_RADIUS) {
                            // ✅ Always mark held by this player (removes floor copy)
                            setItems(prev => prev.map(j =>
                                j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j
                            ), true);

                            // put in hand only if empty hand
                            const carrying = String(p.getState("carry") || "");
                            if (!carrying) p.setState("carry", it.id, true);

                            // ensure in backpack (once)
                            const bp = getBackpack(p);
                            if (!bp.find(b => b.id === it.id)) {
                                setBackpack(p, [...bp, { id: it.id, type: it.type, name: nameFromItem(it) }]);
                            }

                            // Start cooldown (seconds)
                            p.setState("pickupUntil", nowSec + Number(PICKUP_COOLDOWN || 20), true);

                            console.log("[HOST] PICKUP OK", it.id, "(floor removed)");
                            hostAppendEvent(setEvents, `${name} picked up ${it.type}.`);
                        } else {
                            hostAppendEvent(setEvents, `${name} is too far to pick up ${it.type}.`);
                        }
                    }
                }

                /* -------------------- DROP -------------------- */
                if (type === "drop") {
                    const it = findItem(target);
                    const carryId = String(p.getState("carry") || "");
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to drop a missing item (${target}).`);
                    } else if (it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to drop ${it.type} but isn't holding it.`);
                    } else {
                        // place just ahead of the player
                        setItems(prev => prev.map(j =>
                            j.id === it.id ? { ...j, holder: null, x: px, y: py + 0.5, z: pz, vx: 0, vy: 0, vz: 0 } : j
                        ), true);

                        // clear carry if we dropped the one in hand
                        if (carryId === it.id) p.setState("carry", "", true);

                        // also remove from backpack (design choice)
                        setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));

                        hostAppendEvent(setEvents, `${name} dropped ${it.type}.`);
                    }
                }

                /* -------------------- THROW (optional from UI) -------------------- */
                if (type === "throw") {
                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to throw a missing item (${target}).`);
                    } else if (it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to throw ${it.type} but isn't holding it.`);
                    } else {
                        const yaw = value; // radians
                        const vx = Math.sin(yaw) * THROW_SPEED;
                        const vz = Math.cos(yaw) * THROW_SPEED;
                        const vy = 4.5;

                        setItems(prev => prev.map(j =>
                            j.id === it.id
                                ? { ...j, holder: null, x: px, y: py + 1.1, z: pz, vx, vy, vz }
                                : j
                        ), true);

                        p.setState("carry", "", true);
                        setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                        hostAppendEvent(setEvents, `${name} threw ${it.type}.`);
                    }
                }

                /* -------------------- USE -------------------- */
                if (type === "use") {
                    const [kind, rest] = String(target).split("|");
                    if (!kind || !rest) { processed.current.set(p.id, { id: reqId }); continue; }
                    const bp = getBackpack(p);

                    if (kind === "eat") {
                        const it = findItem(rest);
                        if (!it) {
                            hostAppendEvent(setEvents, `${name} tried to eat a missing item (${rest}).`);
                        } else if (it.holder !== p.id) {
                            hostAppendEvent(setEvents, `${name} tried to eat ${it.type} but isn't holding it.`);
                        } else if (it.type !== "food") {
                            hostAppendEvent(setEvents, `${name} can't eat ${it.type}.`);
                        } else {
                            // consume: remove from backpack, clear carry, delete floor copy by not re-spawning
                            setBackpack(p, bp.filter(b => b.id !== it.id));
                            p.setState("carry", "", true);
                            // Remove item from world by clearing holder and moving below floor
                            setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: "_gone_", y: -999 } : j), true);
                            hostAppendEvent(setEvents, `${name} ate some food.`);
                        }
                    } else {
                        // device use: `${deviceId}|${itemId}`
                        const device = DEVICES.find(d => d.id === kind);
                        const it = findItem(rest);
                        if (!device || !it) {
                            hostAppendEvent(setEvents, `${name} tried to use but target not found.`);
                        } else if (it.holder !== p.id) {
                            hostAppendEvent(setEvents, `${name} tried to use ${it.type} but isn't holding it.`);
                        } else {
                            const dx = px - device.x, dz = pz - device.z;
                            const dist = Math.hypot(dx, dz);
                            const r = Number(device.radius || DEVICE_RADIUS);
                            if (dist > r) {
                                hostAppendEvent(setEvents, `${name} is too far to use ${device.label || device.type}.`);
                            } else {
                                // meter effect mapping
                                const eff = USE_EFFECTS[it.type]?.[device.type];
                                if (!eff) {
                                    hostAppendEvent(setEvents, `${name} can't use ${it.type} on ${device.type}.`);
                                } else {
                                    const [meter, delta] = eff;
                                    applyMeterDelta(meter, Number(delta || 0));
                                    // consume item
                                    setBackpack(p, bp.filter(b => b.id !== it.id));
                                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                                    setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: "_used_", y: -999 } : j), true);
                                    hostAppendEvent(setEvents, `${name} used ${it.type} on ${device.label || device.type}.`);
                                }
                            }
                        }
                    }
                }

                // mark processed
                processed.current.set(p.id, { id: reqId });
            }
        };

        window.__planetAHostTick = process;
        return () => { delete window.__planetAHostTick; };
    }, [host, setItems, setEvents, setOxygen, setPower, setCCTV]);

    return null;
}
