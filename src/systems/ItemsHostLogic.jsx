import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import { hostHandleShoot, readActionPayload, hostHandleBite, usePhase } from "../network/playroom";
import useItemsSync from "./useItemsSync.js";
import { DEVICES, USE_EFFECTS, INITIAL_ITEMS } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, BAG_CAPACITY, PICKUP_COOLDOWN } from "../data/constants.js";
import { useGameClock } from "../systems/dayNightClock"; // ⬅️ NEW

const FLOOR_Y = 0;
const GRAV = 16;
const DT = 0.05;
const THROW_SPEED = 8;

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);
    const [phase] = usePhase();

    const { items, setItems } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    const playersRef = useRef(players);
    useEffect(() => { playersRef.current = players; }, [players]);

    const processed = useRef(new Map());

    // ⬇️ track the day number; we’ll decay energy exactly once per increment
    const dayNumber = useGameClock((s) => s.dayNumber);
    const prevDayRef = useRef(dayNumber);

    const getBackpack = (p) => {
        const raw = p?.getState("backpack");
        return Array.isArray(raw) ? raw : [];
    };
    const setBackpack = (p, arr) => p?.setState("backpack", Array.isArray(arr) ? arr : [], true);
    const hasCapacity = (p) => getBackpack(p).length < Number(BAG_CAPACITY || 8);

    // Seed initial items once (host only)
    useEffect(() => {
        if (!host) return;
        const needsSeed = !Array.isArray(itemsRef.current) || itemsRef.current.length === 0;
        if (needsSeed) {
            const seeded = (INITIAL_ITEMS || []).map(it => ({
                holder: null, vx: 0, vy: 0, vz: 0, y: 0,
                ...it,
            }));
            setItems(seeded, true);
            console.log("[HOST] Seeded", seeded.length, "items.");
        }
    }, [host, setItems]);

    // Simple throw physics
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

    // ✅ ENERGY DECAY: fire once per new day number (host-authoritative)
    useEffect(() => {
        if (!host) return;
        if (prevDayRef.current === undefined) {
            prevDayRef.current = dayNumber;
            return;
        }
        if (dayNumber !== prevDayRef.current) {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find(p => p.id === self.id)) everyone.push(self);

            for (const pl of everyone) {
                const cur = Number(pl.getState?.("energy") ?? 100);
                const next = Math.max(0, Math.floor(cur * 0.5)); // −50% per new day
                pl.setState?.("energy", next, true);
            }
            prevDayRef.current = dayNumber;
            console.log(`[HOST] Day ${dayNumber}: halved player energy.`);
        }
    }, [host, dayNumber]);

    // Process client requests (pickup / drop / throw / use / abilities)
    useEffect(() => {
        if (!host) return;

        let cancelled = false;
        let timerId = null;

        const loop = () => {
            if (cancelled) return;

            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find(p => p.id === self.id)) everyone.push(self);

            // Ensure each player has life + energy meters (host-side, one-time per player)
            for (const pl of everyone) {
                const hasLife = pl.getState?.("life");
                if (hasLife === undefined || hasLife === null) pl.setState?.("life", 100, true);
                const hasEnergy = pl.getState?.("energy");
                if (hasEnergy === undefined || hasEnergy === null) pl.setState?.("energy", 100, true);
            }

            const list = itemsRef.current || [];
            const findItem = (id) => list.find(i => i.id === id);

            for (const p of everyone) {
                const reqId = Number(p?.getState("reqId") || 0);
                if (!reqId) continue;
                if (processed.current.get(p.id) === reqId) continue;

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);

                const px = Number(p.getState("x") || 0);
                const py = Number(p.getState("y") || 0);
                const pz = Number(p.getState("z") || 0);

                // ABILITY: shoot
                if (type === "ability" && target === "shoot") {
                    const payload = readActionPayload(p);
                    hostHandleShoot({ shooter: p, payload, setEvents: undefined, players: everyone });
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // ABILITY: bite (infect)
                if (type === "ability" && target === "bite") {
                    hostHandleBite({ biter: p, setEvents: undefined, players: everyone });
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // PICKUP
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

                    setItems(prev => prev.map(j =>
                        j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j
                    ), true);

                    const carry = String(p.getState("carry") || "");
                    if (!carry) p.setState("carry", it.id, true);

                    const bp = getBackpack(p);
                    if (!bp.find(b => b.id === it.id)) setBackpack(p, [...bp, { id: it.id, type: it.type }]);

                    p.setState("pickupUntil", nowSec + Number(PICKUP_COOLDOWN || 20), true);
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // DROP (and remove from backpack)
                if (type === "drop") {
                    const it = findItem(target);
                    if (!it || it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }

                    setItems(prev => prev.map(j =>
                        j.id === it.id
                            ? { ...j, holder: null, x: px, y: Math.max(py + 0.5, FLOOR_Y + 0.01), z: pz, vx: 0, vy: 0, vz: 0 }
                            : j
                    ), true);

                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                    setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));

                    processed.current.set(p.id, reqId);
                    continue;
                }

                // THROW (and remove from backpack)
                if (type === "throw") {
                    const it = findItem(target);
                    if (!it || it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }
                    const yaw = Number(p.getState("yaw") || value || 0);
                    const vx = Math.sin(yaw) * THROW_SPEED;
                    const vz = Math.cos(yaw) * THROW_SPEED;
                    const vy = 4.5;

                    setItems(prev => prev.map(j =>
                        j.id === it.id
                            ? { ...j, holder: null, x: px, y: Math.max(py + 1.1, FLOOR_Y + 0.2), z: pz, vx, vy, vz }
                            : j
                    ), true);

                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                    setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));

                    processed.current.set(p.id, reqId);
                    continue;
                }

                // USE
                if (type === "use") {
                    const [kind, idStr] = String(target).split("|");
                    const it = findItem(idStr);
                    if (!it || it.holder !== p.id) { processed.current.set(p.id, reqId); continue; }

                    // eat food → refill ENERGY for non-infected only
                    if (kind === "eat" && it.type === "food") {
                        const isInfected = !!p.getState?.("infected");
                        if (!isInfected) {
                            p.setState?.("energy", 100, true);
                        }
                        setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: "_gone_", y: -999 } : j), true);
                        setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                        if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    // use on device
                    const dev = DEVICES.find(d => d.id === kind);
                    if (dev) {
                        const dx = px - dev.x, dz = pz - dev.z;
                        const r = Number(dev.radius || DEVICE_RADIUS);
                        if (dx * dx + dz * dz <= r * r) {
                            const eff = USE_EFFECTS?.[it.type]?.[dev.type];
                            if (eff) {
                                // apply any station/room effects here if desired
                                setItems(prev => prev.map(j => j.id === it.id ? { ...j, holder: "_used_", y: -999 } : j), true);
                                setBackpack(p, getBackpack(p).filter(b => b.id !== it.id));
                                if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                            }
                        }
                    }
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // default: mark processed so we don't loop on it
                processed.current.set(p.id, reqId);
            };

            // schedule next tick
            timerId = setTimeout(loop, 50);
        };

        loop();

        return () => {
            cancelled = true;
            if (timerId) clearTimeout(timerId);
        };
    }, [host, setItems]);

    return null;
}
