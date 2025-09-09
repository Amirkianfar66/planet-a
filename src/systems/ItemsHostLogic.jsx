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

    // Debug announce (helps ensure host logic mounted)
    useEffect(() => { if (host) console.log("[HOST] ItemsHostLogic active."); }, [host]);

    // Simple physics for thrown items
    useEffect(() => {
        if (!host) return;
        const id = setInterval(() => {
            setItems(prev => prev.map(it => {
                if (it.holder) return it;
                let { x, y = FLOOR_Y, z, vx = 0, vy = 0, vz = 0 } = it;
                if (vx || vy || vz) {
                    vy -= GRAV * 0.05;
                    x += vx * 0.05; y += vy * 0.05; z += vz * 0.05;
                    if (y <= FLOOR_Y) {
                        y = FLOOR_Y;
                        vy *= -0.3; vx *= 0.7; vz *= 0.7;
                        if (Math.abs(vy) < 0.5) { vx = vy = vz = 0; }
                    }
                }
                return { ...it, x, y, z, vx, vy, vz };
            }));
        }, 50);
        return () => clearInterval(id);
    }, [host, setItems]);

    useEffect(() => {
        if (!host) return;
        const id = setInterval(() => {
            for (const p of players) {
                const reqId = Number(p.getState("reqId") || 0);
                const last = processed.current.get(p.id) || 0;
                if (reqId <= last) continue;

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);

                const name = p.getProfile().name || ("Player " + p.id.slice(0, 4));
                const px = Number(p.getState("x") || 0);
                const py = Number(p.getState("y") || 0);
                const pz = Number(p.getState("z") || 0);

                const bag = readBag(p);
                const findItem = (id) => items.find(i => i.id === id);
                const near = (ax, az, bx, bz, r) => ((ax - bx) ** 2 + (az - bz) ** 2) <= r * r;

                if (type === "pickup") {
                    const it = findItem(target);
                    if (!it) { hostAppendEvent(setEvents, `${name} tried to pick a missing item.`); }
                    else if (it.holder && it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to pick ${it.type}, but it's held.`);
                    } else if (bag.length >= BAG_CAPACITY) {
                        hostAppendEvent(setEvents, `${name}'s backpack is full.`);
                    } else if (!near(px, pz, it.x, it.z, PICKUP_RADIUS)) {
                        hostAppendEvent(setEvents, `${name} is too far to pick ${it.type}.`);
                    } else {
                        // put into backpack, keep the item entity but mark holder
                        setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j));
                        writeBag(p, [...bag, it.id]);
                        hostAppendEvent(setEvents, `${name} picked up ${it.type}.`);
                    }
                }

                if (type === "drop") {
                    const idx = bag.lastIndexOf(target);
                    if (idx === -1) {
                        hostAppendEvent(setEvents, `${name} tried to drop an item not in backpack.`);
                    } else {
                        const it = findItem(target);
                        if (!it || it.holder !== p.id) {
                            hostAppendEvent(setEvents, `${name} tried to drop, but server doesn't think they hold it.`);
                        } else {
                            // drop where the player is
                            setItems(prev => prev.map(j => j.id === it.id
                                ? { ...j, holder: null, x: px, y: FLOOR_Y, z: pz, vx: 0, vy: 0, vz: 0 }
                                : j));
                            const newBag = bag.slice(0, idx).concat(bag.slice(idx + 1));
                            writeBag(p, newBag);
                            hostAppendEvent(setEvents, `${name} dropped ${it.type}.`);
                        }
                    }
                }

                if (type === "use") {
                    // "eat|itemId" OR "deviceId|itemId"
                    const [kind, rest] = target.split("|");
                    if (!kind || !rest) { processed.current.set(p.id, reqId); continue; }

                    if (kind === "eat") {
                        const itemId = rest;
                        const idx = bag.lastIndexOf(itemId);
                        const it = findItem(itemId);
                        if (idx === -1 || !it) {
                            hostAppendEvent(setEvents, `${name} tried to eat a missing item.`);
                        } else if (it.holder !== p.id || it.type !== "food") {
                            hostAppendEvent(setEvents, `${name} tried to eat ${it?.type || "unknown"} (invalid).`);
                        } else {
                            // consume (remove the entity & from bag)
                            setItems(prev => prev.filter(j => j.id !== it.id));
                            const newBag = bag.slice(0, idx).concat(bag.slice(idx + 1));
                            writeBag(p, newBag);
                            hostAppendEvent(setEvents, `${name} ate food.`);
                        }
                    } else {
                        const deviceId = kind;
                        const itemId = rest;
                        const dev = DEVICES.find(d => d.id === deviceId);
                        const idx = bag.lastIndexOf(itemId);
                        const it = findItem(itemId);

                        if (!dev) hostAppendEvent(setEvents, `${name} used at unknown device.`);
                        else if (idx === -1 || !it) hostAppendEvent(setEvents, `${name} tried to use missing item.`);
                        else if (it.holder !== p.id) hostAppendEvent(setEvents, `${name} doesn't hold that item.`);
                        else if (!near(px, pz, dev.x, dev.z, dev.radius || DEVICE_RADIUS)) {
                            hostAppendEvent(setEvents, `${name} is too far from ${dev.label}.`);
                        } else {
                            const eff = USE_EFFECTS[it.type]?.[dev.type];
                            if (!eff) {
                                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label} → no effect.`);
                            } else {
                                const [meter, delta] = eff;
                                if (meter === "oxygen") setOxygen(v => clamp01(Number(v) + delta), true);
                                if (meter === "power") setPower(v => clamp01(Number(v) + delta), true);
                                if (meter === "cctv") setCCTV(v => clamp01(Number(v) + delta), true);
                                // consume the item
                                setItems(prev => prev.filter(j => j.id !== it.id));
                                const newBag = bag.slice(0, idx).concat(bag.slice(idx + 1));
                                writeBag(p, newBag);
                                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label}.`);
                            }
                        }
                    }
                }

                // Optional: throw (kept for completeness; bound elsewhere)
                if (type === "throw") {
                    const it = items.find(i => i.id === target);
                    if (it && it.holder === p.id) {
                        const yaw = value;                      // radians
                        const vx = Math.sin(yaw) * THROW_SPEED; // forward in your coord system
                        const vz = Math.cos(yaw) * THROW_SPEED;
                        const vy = 4.5;
                        setItems(prev => prev.map(j => j.id === it.id
                            ? { ...j, holder: null, x: px, y: py + 1.1, z: pz, vx, vy, vz }
                            : j));
                        // also remove from backpack if present
                        const idx = bag.lastIndexOf(it.id);
                        if (idx !== -1) writeBag(p, bag.slice(0, idx).concat(bag.slice(idx + 1)));
                        hostAppendEvent(setEvents, `${name} threw ${it.type}.`);
                    }
                }

                processed.current.set(p.id, reqId);
            }
        }, 120);
        return () => clearInterval(id);
    }, [host, players, items, setItems, setEvents, setOxygen, setPower, setCCTV]);

    return null;
}

/* ---- helpers: backpack encode/decode on player state ---- */
function readBag(p) {
    try {
        const a = JSON.parse(p.getState("bag") || "[]");
        return Array.isArray(a) ? a : [];
    } catch { return []; }
}
function writeBag(p, arr) {
    p.setState("bag", JSON.stringify(arr), true);
}
