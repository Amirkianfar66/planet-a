// src/systems/ItemsHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList } from "playroomkit";
import useItemsSync from "./useItemsSync.js";
import { useMeters, hostAppendEvent, useEvents } from "../network/playroom";
import { DEVICES, USE_EFFECTS, clamp01 } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, BAG_CAPACITY } from "../data/constants.js";

const FLOOR_Y = 0;
const GRAV = 16;
const THROW_SPEED = 8;

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);
    const { items, setItems } = useItemsSync();
    const { setOxygen, setPower, setCCTV } = useMeters();
    const [, setEvents] = useEvents();
    const processed = useRef(new Map());

    // --- helpers: backpack on player state (array of {id,type,name?}) ---
    const getBackpack = (p) => {
        const v = p.getState?.("backpack");
        return Array.isArray(v) ? v : [];
    };
    const setBackpack = (p, arr) => p.setState?.("backpack", arr, true);
    const nameFromItem = (it) => it.name || (it.type?.toUpperCase?.() || "ITEM");
    const hasCapacity = (p) => getBackpack(p).length < (Number(BAG_CAPACITY) || 8);

    // distance^2 helper
    const near2 = (ax, az, bx, bz, r) => ((ax - bx) ** 2 + (az - bz) ** 2) <= r * r;
    // Announce once
    useEffect(() => {
        if (host) console.log("[HOST] ItemsHostLogic active.");
    }, [host]);

    // Log only when item IDs change (not every reference change)
    useEffect(() => {
        if (!host) return;
        const prevIds = idSetRef.current;
        const currIds = new Set(items.map(i => i.id));

        let changed = false;
        if (!prevIds || prevIds.size !== currIds.size) {
            changed = true;
        } else {
            for (const id of currIds) if (!prevIds.has(id)) { changed = true; break; }
        }

        if (changed) {
            console.groupCollapsed(`[HOST] items changed (${items.length})`);
            console.table(items.map(i => ({ id: i.id, type: i.type, holder: i.holder })));
            console.groupEnd();
            idSetRef.current = currIds;
        }
    }, [host, items]);

    const idSetRef = useRef(null);
    // Simple physics for thrown items
    useEffect(() => {
        if (!host) return;
        const id = setInterval(() => {
            setItems((prev) =>
                prev.map((it) => {
                    if (it.holder) return it; // carried → skip physics
                    let { x, y = FLOOR_Y, z, vx = 0, vy = 0, vz = 0 } = it;
                    if (vx || vy || vz) {
                        vy -= GRAV * 0.05;
                        x += vx * 0.05;
                        y += vy * 0.05;
                        z += vz * 0.05;
                        if (y <= FLOOR_Y) {
                            y = FLOOR_Y;
                            vy *= -0.3;
                            vx *= 0.7;
                            vz *= 0.7;
                            if (Math.abs(vy) < 0.5) {
                                vx = vy = vz = 0;
                            }
                        }
                    }
                    return { ...it, x, y, z, vx, vy, vz };
                })
            );
        }, 50);
        return () => clearInterval(id);
    }, [host, setItems]);

    // Host: process client requests
    useEffect(() => {
        if (!host) return;

        const tick = setInterval(() => {
            for (const p of players) {
                const reqId = Number(p.getState("reqId") || 0);
                const last = processed.current.get(p.id) || 0;
                if (reqId <= last) continue;

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);

                // log incoming
                // eslint-disable-next-line no-console
                console.log(`[HOST] req ${p.id.slice(0, 4)}: type=${type} target=${target} val=${value} id=${reqId}`);

                const name = p.getProfile().name || `Player ${p.id.slice(0, 4)}`;
                const px = Number(p.getState("x") || 0);
                const py = Number(p.getState("y") || 0);
                const pz = Number(p.getState("z") || 0);

                const findItem = (id) => items.find((i) => i.id === id);

                // ---------- PICKUP ----------
                if (type === "pickup") {
                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to pick up a missing item (${target}).`);
                    } else if (it.holder && it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to pick up ${it.type} but it's already held.`);
                    } else if (!hasCapacity(p)) {
                        hostAppendEvent(setEvents, `${name}'s backpack is full.`);
                    } else if (near2(px, pz, it.x, it.z, PICKUP_RADIUS)) {         // ✅ keep the range check
                        // put into player's hand/backpack, remove floor physics
                        setItems(prev =>
                            prev.map(j => j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j)
                        );
                        p.setState("carry", it.id, true);

                        const bp = getBackpack(p);
                        if (!bp.find(b => b.id === it.id)) {
                            setBackpack(p, [...bp, { id: it.id, type: it.type, name: nameFromItem(it) }]);
                        }

                        hostAppendEvent(setEvents, `${name} picked up ${it.type}.`);
                    } else {
                        hostAppendEvent(setEvents, `${name} is too far to pick up ${it?.type || "item"}.`);
                    }
                }

                // ---------- DROP ----------
                if (type === "drop") {
                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to drop a missing item (${target}).`);
                    } else if (it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to drop ${it.type} but isn't holding it.`);
                    } else {
                        setItems(prev =>
                            prev.map(j =>
                                j.id === it.id ? { ...j, holder: null, x: px, y: FLOOR_Y, z: pz, vx: 0, vy: 0, vz: 0 } : j
                            )
                        );
                        p.setState("carry", "", true);
                        setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                        hostAppendEvent(setEvents, `${name} dropped ${it.type}.`);
                    }
                }

                // ---------- THROW ----------
                if (type === "throw") {
                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to throw a missing item (${target}).`);
                    } else if (it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to throw ${it.type} but isn't holding it.`);
                    } else {
                        const yaw = value;                 // radians
                        const vx = Math.sin(yaw) * THROW_SPEED;
                        const vz = Math.cos(yaw) * THROW_SPEED;
                        const vy = 4.5;

                        setItems(prev =>
                            prev.map(j =>
                                j.id === it.id
                                    ? { ...j, holder: null, x: px, y: py + 1.1, z: pz, vx, vy, vz }
                                    : j
                            )
                        );
                        p.setState("carry", "", true);
                        setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                        hostAppendEvent(setEvents, `${name} threw ${it.type}.`);
                    }
                }

                // ---------- USE ----------
                if (type === "use") {
                    // target is "eat|itemId" OR "deviceId|itemId"
                    const [kind, rest] = target.split("|");
                    if (!kind || !rest) { processed.current.set(p.id, reqId); continue; }

                    const bp = getBackpack(p);

                    if (kind === "eat") {
                        const itemId = rest;
                        const it = findItem(itemId);
                        if (!it) {
                            hostAppendEvent(setEvents, `${name} tried to eat a missing item (${itemId}).`);
                        } else if (it.holder !== p.id) {
                            hostAppendEvent(setEvents, `${name} tried to eat ${it.type} but isn't holding it.`);
                        } else if (it.type !== "food") {
                            hostAppendEvent(setEvents, `${name} tried to eat ${it.type} (not edible).`);
                        } else {
                            setItems(prev => prev.filter(j => j.id !== it.id));     // consume
                            p.setState("carry", "", true);
                            setBackpack(p, bp.filter(b => b.id !== it.id));
                            hostAppendEvent(setEvents, `${name} ate some food.`);
                        }
                    } else {
                        const deviceId = kind;
                        const itemId = rest;
                        const it = findItem(itemId);
                        const dev = DEVICES.find(d => d.id === deviceId);

                        if (!it) {
                            hostAppendEvent(setEvents, `${name} tried to use a missing item (${itemId}).`);
                        } else if (it.holder !== p.id) {
                            hostAppendEvent(setEvents, `${name} tried to use ${it.type} but isn't holding it.`);
                        } else if (!dev) {
                            hostAppendEvent(setEvents, `${name} tried to use ${it.type} at unknown device (${deviceId}).`);
                        } else if (!near2(px, pz, dev.x, dev.z, Number(dev.radius) || Number(DEVICE_RADIUS) || 1.3)) {
                            hostAppendEvent(setEvents, `${name} is too far from ${dev.label} to use ${it.type}.`);
                        } else {
                            const eff = USE_EFFECTS[it.type]?.[dev.type];
                            if (!eff) {
                                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label} → no effect.`);
                            } else {
                                const [meter, delta] = eff;
                                if (meter === "oxygen") setOxygen(v => clamp01(Number(v) + delta), true);
                                if (meter === "power") setPower(v => clamp01(Number(v) + delta), true);
                                if (meter === "cctv") setCCTV(v => clamp01(Number(v) + delta), true);

                                setItems(prev => prev.filter(j => j.id !== it.id));   // consume
                                p.setState("carry", "", true);
                                setBackpack(p, bp.filter(b => b.id !== it.id));
                                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label}.`);
                            }
                        }
                    }
                }


                processed.current.set(p.id, reqId);
            }
        }, 120);

        return () => clearInterval(tick);
    }, [host, players, items, setItems, setEvents, setOxygen, setPower, setCCTV]);

    return null;
}
