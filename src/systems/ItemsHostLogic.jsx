// src/systems/ItemsHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList } from "playroomkit";
import useItemsSync from "./useItemsSync.js"; // explicit .js for Vercel
import { useMeters, hostAppendEvent, useEvents } from "../network/playroom";
import { DEVICES, USE_EFFECTS, clamp01 } from "../data/gameObjects.js"; // explicit .js
import { PICKUP_RADIUS } from "../data/constants.js";

const THROW_SPEED = 8;
const GRAV = 16;
const FLOOR_Y = 0;

// Small utility: squared distance in XZ plane
const dist2XZ = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
};
const within = (ax, az, bx, bz, r) => dist2XZ(ax, az, bx, bz) <= r * r;

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);

    const { items, setItems } = useItemsSync();
    const itemsRef = useRef(items);
    itemsRef.current = items;

    const { setOxygen, setPower, setCCTV } = useMeters();
    const [, setEvents] = useEvents();

    // Track last processed reqId per player
    const processed = useRef(new Map());

    // ---------------- Physics for thrown items ----------------
    useEffect(() => {
        if (!host) return;
        const STEP = 0.05; // 50 ms
        const id = setInterval(() => {
            setItems(prev =>
                prev.map(it => {
                    if (it.holder) return it; // skip physics while carried
                    let { x, y, z, vx = 0, vy = 0, vz = 0 } = it;

                    if (vx || vy || vz) {
                        vy -= GRAV * STEP;
                        x += vx * STEP; y += vy * STEP; z += vz * STEP;

                        if (y <= FLOOR_Y) {
                            y = FLOOR_Y;
                            vy *= -0.3;
                            vx *= 0.7;
                            vz *= 0.7;
                            if (Math.abs(vy) < 0.5) { vy = 0; vx = 0; vz = 0; }
                        }
                    }

                    return (vx || vy || vz)
                        ? { ...it, x, y, z, vx, vy, vz }
                        : it;
                })
            );
        }, 50);
        return () => clearInterval(id);
    }, [host, setItems]);

    // ---------------- Host request processor ----------------
    useEffect(() => {
        if (!host) {
            // eslint-disable-next-line no-console
            console.log("[HOST] Not host here — ItemsHostLogic is inactive.");
            return;
        }
        // eslint-disable-next-line no-console
        console.log("[HOST] ItemsHostLogic active.");

        const id = setInterval(() => {
            // Snapshot once per tick
            const itemsNow = itemsRef.current;

            for (const p of players) {
                const reqId = Number(p.getState("reqId") || 0);
                const last = processed.current.get(p.id) || 0;
                if (reqId <= last) continue;

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);

                // Debug: confirm the host received a new request
                // eslint-disable-next-line no-console
                console.log(
                    `[HOST] req from ${p.id.slice(0, 4)} type=${type} target=${target} value=${value} reqId=${reqId}`
                );

                const name = p.getProfile().name || ("Player " + p.id.slice(0, 4));
                const px = Number(p.getState("x") || 0);
                const py = Number(p.getState("y") || 0);
                const pz = Number(p.getState("z") || 0);

                const findItem = (id) => itemsNow.find(i => i.id === id);

                // ---------- Actions ----------
                if (type === "pickup") {
                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to pick up a missing item (${target}).`);
                    } else if (it.holder && it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to pick up ${it.type} but it's already held.`);
                    } else if (within(px, pz, it.x, it.z, PICKUP_RADIUS)) {
                        setItems(prev => prev.map(j =>
                            j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j
                        ));
                        p.setState("carry", it.id, true);
                        hostAppendEvent(setEvents, `${name} picked up ${it.type}.`);
                    } else {
                        hostAppendEvent(setEvents, `${name} is too far to pick up ${it.type}. Move closer.`);
                    }
                }

                else if (type === "throw") {
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
                        ));
                        p.setState("carry", "", true);
                        hostAppendEvent(setEvents, `${name} threw ${it.type}.`);
                    }
                }

                else if (type === "drop") {
                    const it = findItem(target);
                    if (!it) {
                        hostAppendEvent(setEvents, `${name} tried to drop a missing item (${target}).`);
                    } else if (it.holder !== p.id) {
                        hostAppendEvent(setEvents, `${name} tried to drop ${it.type} but isn't holding it.`);
                    } else {
                        setItems(prev => prev.map(j =>
                            j.id === it.id
                                ? { ...j, holder: null, x: px, y: FLOOR_Y, z: pz, vx: 0, vy: 0, vz: 0 }
                                : j
                        ));
                        p.setState("carry", "", true);
                        hostAppendEvent(setEvents, `${name} dropped ${it.type}.`);
                    }
                }

                else if (type === "use") {
                    // target format: "deviceId|itemId" OR "eat|itemId"
                    const [kind, rest] = target.split("|");

                    if (kind === "eat") {
                        const it = findItem(rest);
                        if (!it) {
                            hostAppendEvent(setEvents, `${name} tried to eat a missing item (${rest}).`);
                        } else if (it.holder !== p.id) {
                            hostAppendEvent(setEvents, `${name} tried to eat ${it.type} but isn't holding it.`);
                        } else if (it.type !== "food") {
                            hostAppendEvent(setEvents, `${name} tried to eat ${it.type} (not edible).`);
                        } else {
                            setItems(prev => prev.filter(j => j.id !== it.id));
                            p.setState("carry", "", true);
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
                        } else if (!within(px, pz, dev.x, dev.z, dev.radius || 1.3)) {
                            hostAppendEvent(setEvents, `${name} is too far from ${dev.label} to use ${it.type}.`);
                        } else {
                            const eff = USE_EFFECTS[it.type]?.[dev.type];
                            if (!eff) {
                                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label}, but nothing happened.`);
                            } else {
                                const [meter, delta] = eff;
                                if (meter === "oxygen") setOxygen(v => clamp01(Number(v) + delta), true);
                                if (meter === "power") setPower(v => clamp01(Number(v) + delta), true);
                                if (meter === "cctv") setCCTV(v => clamp01(Number(v) + delta), true);

                                setItems(prev => prev.filter(j => j.id !== it.id)); // consume
                                p.setState("carry", "", true);
                                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label}.`);
                            }
                        }
                    }
                }

                // Remember we processed this request
                processed.current.set(p.id, reqId);
            }
        }, 150);

        return () => clearInterval(id);
    }, [host, players, setItems, setEvents, setOxygen, setPower, setCCTV]);

    return null;
}
