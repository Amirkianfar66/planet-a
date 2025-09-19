// src/systems/ItemsHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import { hostHandleShoot, readActionPayload, hostHandleBite, usePhase, hostHandleArrest, hostHandleDisguise, hostHandleScan, hostHandlePetOrder } from "../network/playroom";
import useItemsSync from "./useItemsSync.js";
import { DEVICES, USE_EFFECTS, INITIAL_ITEMS } from "../data/gameObjects.js";
import { PICKUP_RADIUS, DEVICE_RADIUS, BAG_CAPACITY, PICKUP_COOLDOWN } from "../data/constants.js";
import { useGameClock } from "../systems/dayNightClock";
import { isOutsideByRoof } from "../map/deckA"; // inside/outside by roof

const FLOOR_Y = 0;
const GRAV = 16;
const DT = 0.05;
const THROW_SPEED = 8;
const TANK_CAP_DEFAULT = 6;
const UNITS_PER_LOAD = 2;

/* --- HELPERS (single, case-insensitive) --- */

// normalize type match (case-insensitive)
const isType = (v, t) => String(v || "").toLowerCase() === String(t || "").toLowerCase();

// Tank helpers
const TANK_ACCEPTS = {
    food_tank: "food",
    fuel_tank: "fuel",
    protection_tank: "protection",
};
const isTankType = (t) => t === "food_tank" || t === "fuel_tank" || t === "protection_tank";

// Find an actual world item of a given type held by player p
const findHeldItemByType = (type, p, itemsList) =>
    (itemsList || []).find((i) => isType(i.type, type) && i.holder === p.id);

// Remove exactly ONE unit from the backpack.
// Works for {id,type} entries and stacked {type, qty:n} entries.
const removeOneByType = (bp, type, idToRemove) => {
    if (!Array.isArray(bp)) return [];
    // Prefer exact id if available
    if (idToRemove) {
        const idx = bp.findIndex((b) => b.id === idToRemove);
        if (idx !== -1) return bp.slice(0, idx).concat(bp.slice(idx + 1));
    }
    // Otherwise, remove/decrement the first matching type (case-insensitive)
    const idx = bp.findIndex((b) => isType(b.type, type));
    if (idx === -1) return bp;
    const entry = bp[idx];
    const qty = Number(entry?.qty || 1);
    if (qty > 1) {
        const copy = [...bp];
        copy[idx] = { ...entry, qty: qty - 1 };
        return copy;
    }
    return bp.slice(0, idx).concat(bp.slice(idx + 1));
};

/**
 * Try to load one matching item from player's backpack into the given tank.
 * Adds UNITS_PER_LOAD to tank (clamped to cap) and removes one matching item from backpack.
 * Returns true if a load happened.
 */
const tryLoadIntoTank = ({ player: p, tank, itemsList, getBackpack, setBackpack, setItems }) => {
    const cap = Number(tank.cap ?? TANK_CAP_DEFAULT);
    const stored = Number(tank.stored || 0);
    if (stored >= cap) return false;

    const free = cap - stored;
    const addUnits = Math.min(UNITS_PER_LOAD, free);
    if (addUnits <= 0) return false;

    const want = TANK_ACCEPTS[tank.type];
    if (!want) return false;

    const bp = getBackpack(p);
    const entry = bp.find((b) => isType(b.type, want));
    if (!entry) return false;

    const entity =
        (entry?.id ? (itemsList || []).find((i) => i.id === entry.id) : null) ||
        findHeldItemByType(want, p, itemsList);

    let removed = false;
    let nextBp = bp;

    if (entity && entity.holder === p.id) {
        // consume the world entity
        setItems(
            (prev) => prev.map((j) => (j.id === entity.id ? { ...j, holder: "_gone_", y: -999 } : j)),
            true
        );
        removed = true;
        nextBp = removeOneByType(bp, want, entry?.id);

        // clear carry if it pointed at the consumed item
        if (String(p.getState("carry") || "") === entity.id) {
            p.setState("carry", "", true);
        }
    } else {
        // fallback: decrement backpack even if entity couldn't be found
        const after = removeOneByType(bp, want, entry?.id);
        removed = after !== bp;
        nextBp = after;
    }

    if (!removed) return false;

    setBackpack(p, nextBp);
    // increment using live j.stored and clamp to capacity
    setItems(
        (prev) =>
            prev.map((j) =>
                j.id === tank.id
                    ? { ...j, stored: Math.min(Number(j.cap ?? cap), Number(j.stored || 0) + addUnits) }
                    : j
            ),
        true
    );

    return true;
};

/* ---- NEW: role helper for Officer/Guard/Security ---- */
const isOfficerRole = (r) => {
    const s = String(r || "").toLowerCase();
    return s.includes("officer") || s.includes("guard") || s.includes("security");
};
/* --- END HELPERS --- */

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);
    const [phase] = usePhase();

    const { items, setItems } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
        // lightweight global read hook for host handlers
        window.__itemsCache__ = () => itemsRef.current || [];
    }, [items]);

    const playersRef = useRef(players);
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const processed = useRef(new Map());

    // Day/phase tracking (energy decay uses this)
    const dayNumber = useGameClock((s) => s.dayNumber);
    const prevDayRef = useRef(dayNumber);
    const clockPhase = useGameClock((s) => s.phase);
    const prevPhaseRef = useRef(clockPhase);

    const getBackpack = (p) => {
        const raw = p?.getState("backpack");
        return Array.isArray(raw) ? raw : [];
    };
    const setBackpack = (p, arr) => p?.setState("backpack", Array.isArray(arr) ? arr : [], true);
    const hasCapacity = (p) => getBackpack(p).length < Number(BAG_CAPACITY || 8);

    // Seed initial items once (host only) — the ONLY place that creates world items.
    useEffect(() => {
        if (!host) return;
        const needsSeed = !Array.isArray(itemsRef.current) || itemsRef.current.length === 0;
        if (needsSeed) {
            const seeded = (INITIAL_ITEMS || []).map((it) => ({
                holder: null,
                vx: 0,
                vy: 0,
                vz: 0,
                y: 0,
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
            setItems((prev) =>
                prev.map((it) => {
                    if (it.holder) return it;
                    let { x, y = FLOOR_Y, z, vx = 0, vy = 0, vz = 0 } = it;
                    if (!(vx || vy || vz)) return it;
                    vy -= GRAV * DT;
                    x += vx * DT;
                    y += vy * DT;
                    z += vz * DT;
                    if (y <= FLOOR_Y) {
                        y = FLOOR_Y;
                        vy = 0;
                        vx *= 0.6;
                        vz *= 0.6;
                        if (Math.abs(vx) < 0.02) vx = 0;
                        if (Math.abs(vz) < 0.02) vz = 0;
                    }
                    return { ...it, x, y, z, vx, vy, vz };
                }),
                true
            );
        }, DT * 1000);
        return () => clearInterval(h);
    }, [host, setItems]);

    // ENERGY DECAY: subtract 25 once per new dayNumber
    useEffect(() => {
        if (!host) return;

        const readClock = () =>
            (typeof useGameClock.getState === "function" ? useGameClock.getState() : null);

        let lastDay = Number(readClock()?.dayNumber ?? 0);

        const applyDecay = (d) => {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            for (const pl of everyone) {
                if (pl.getState?.("dead")) continue;
                const cur = Number(pl.getState?.("energy") ?? 100);
                const next = Math.max(0, Math.min(100, cur - 25));
                pl.setState?.("energy", next, true);
            }
            console.log(`[HOST] Day ${d}: reduced personal energy by 25 for all alive players.`);
        };

        let rafId = 0;
        const tick = () => {
            const s = readClock();
            if (s) {
                const d = Number(s.dayNumber ?? 0);
                if (d !== lastDay) {
                    applyDecay(d);
                    lastDay = d;
                }
            }
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [host]);

    // BASELINE per-player state (life, role charges, oxygen)
    useEffect(() => {
        if (!host) return;
        const everyone = [...(playersRef.current || [])];
        const self = myPlayer();
        if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

        for (const pl of everyone) {
            const hasLife = pl.getState?.("life");
            if (hasLife === undefined || hasLife === null) {
                pl.setState?.("life", 100, true);
            }
            // Default 1 arrest charge for Station Director
            const role = String(pl.getState?.("role") || "");
            const arrests = pl.getState?.("arrestsLeft");
            if (role === "StationDirector" && (arrests === undefined || arrests === null)) {
                pl.setState?.("arrestsLeft", 1, true);
            }

            // ensure oxygen exists (100%)
            const oxy = pl.getState?.("oxygen");
            if (oxy === undefined || oxy === null) {
                pl.setState?.("oxygen", 100, true);
            }
        }
    }, [host, players]);

    // OXYGEN DRAIN while OUTSIDE (roofless)
    useEffect(() => {
        if (!host) return;
        const DRAIN_PER_TICK = 1; // % per second
        const TICK_MS = 1000;

        const timer = setInterval(() => {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            for (const pl of everyone) {
                if (pl.getState?.("dead")) continue;

                const px = Number(pl.getState?.("x") || 0);
                const pz = Number(pl.getState?.("z") || 0);
                const outside = isOutsideByRoof(px, pz);

                if (outside) {
                    const cur = Number(pl.getState?.("oxygen") ?? 100);
                    if (cur <= 0) continue;
                    const next = Math.max(0, Math.min(100, cur - DRAIN_PER_TICK));
                    pl.setState?.("oxygen", next, true);
                }
            }
        }, TICK_MS);

        return () => clearInterval(timer);
    }, [host]);

    /* -------- NEW: give Officers one CCTV camera at the start of each day -------- */
    useEffect(() => {
        if (!host) return;

        const everyone = [...(playersRef.current || [])];
        const self = myPlayer();
        if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

        for (const p of everyone) {
            const role = p.getState?.("role");
            if (!isOfficerRole(role)) continue;

            const camId = `cam_${p.id}_d${dayNumber}`;
            const bp = (p.getState?.("backpack") || []);
            const hasTodayCam = Array.isArray(bp) && bp.some((b) => b.id === camId);

            if (!hasTodayCam) {
                const nextBp = [...bp, { id: camId, type: "cctv", name: "CCTV Camera" }];
                p.setState?.("backpack", nextBp, true);
                // auto-equip if hands free
                const carry = String(p.getState?.("carry") || "");
                if (!carry) p.setState?.("carry", camId, true);
                console.log(`[HOST] Granted daily CCTV to ${p.id}: ${camId}`);
            }
        }
    }, [host, dayNumber]);
    /* -------- END DAILY CCTV -------- */

    // Process client requests (pickup / drop / throw / use / abilities / container)
    useEffect(() => {
        if (!host) return;

        let cancelled = false;
        let timerId = null;

        const loop = () => {
            if (cancelled) return;

            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            // Ensure baseline per-player state (kept for late joiners)
            for (const pl of everyone) {
                const hasLife = pl.getState?.("life");
                if (hasLife === undefined || hasLife === null) {
                    pl.setState?.("life", 100, true);
                }
                const role = String(pl.getState?.("role") || "");
                const arrests = pl.getState?.("arrestsLeft");
                if (role === "StationDirector" && (arrests === undefined || arrests === null)) {
                    pl.setState?.("arrestsLeft", 1, true);
                }
                // keep oxygen present for late joiners
                const oxy = pl.getState?.("oxygen");
                if (oxy === undefined || oxy === null) {
                    pl.setState?.("oxygen", 100, true);
                }
            }

            const list = itemsRef.current || [];
            const findItem = (id) => list.find((i) => i.id === id);
            // --- SPAWN PETS for each Research who lacks one ---
            const haveIds = new Set(list.map(i => i.id));
            const spawnPetIfMissing = (owner) => {
                const ownerId = owner.id;
                const already = list.find((i) => i.type === "pet" && i.owner === ownerId);
                if (already) return;

                const ox = Number(owner.getState("x") || 0);
                const oy = Number(owner.getState("y") || 0);
                const oz = Number(owner.getState("z") || 0);

                // unique id
                let idx = 1, newId = `pet_${ownerId}_${idx}`;
                while (haveIds.has(newId)) { idx++; newId = `pet_${ownerId}_${idx}`; }
                haveIds.add(newId);

                // create world item as the pet
                setItems(prev => ([
                    ...(prev || []),
                    {
                        id: newId,
                        type: "pet",
                        name: "Research Bot",
                        owner: ownerId,
                        x: ox - 0.8,
                        y: Math.max(oy + 0.2, 0.2),
                        z: oz - 0.8,
                        yaw: Number(owner.getState("yaw") || 0),
                        mode: owner.getState("petMode") || "follow",
                        speed: 2.2,       // m/s
                        hover: 0.35,      // visual lift
                    }
                ]), true);
            };

            for (const pl of everyone) {
                if (String(pl.getState?.("role") || "") === "Research") spawnPetIfMissing(pl);
            }
            // --- END SPAWN ---

            // unique id helper (kept)
            const mkId = (prefix) => {
                const existing = new Set((itemsRef.current || []).map((i) => i.id));
                let i = 1,
                    id = `${prefix}${i}`;
                while (existing.has(id)) {
                    i += 1;
                    id = `${prefix}${i}`;
                }
                return id;
            };

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

                // --------- ABILITIES ----------
                if (type === "ability" && target === "shoot") {
                    const payload = readActionPayload(p);
                    hostHandleShoot({ shooter: p, payload, setEvents: undefined, players: everyone });
                    processed.current.set(p.id, reqId);
                    continue;
                }
                if (type === "ability" && target === "bite") {
                    hostHandleBite({ biter: p, setEvents: undefined, players: everyone });
                    processed.current.set(p.id, reqId);
                    continue;
                }
                // ABILITY: disguise (infected-only cosmetic)
                if (type === "ability" && target === "disguise") {
                              hostHandleDisguise({ player: p, setEvents: undefined });
                              processed.current.set(p.id, reqId);
                              continue;
                            }

                if (type === "ability" && target === "arrest") {
                    hostHandleArrest({ officer: p, players: everyone, setEvents: undefined });
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // ABILITY: scan (Officer blood test)
                if (type === "ability" && target === "scan") {
                      hostHandleScan({ officer: p, players: everyone, setEvents: undefined });
                      processed.current.set(p.id, reqId);
                      continue;
                }

                 // ABILITY: pet order (Research)
                if (type === "ability" && target === "pet_order") {
                        const payload = readActionPayload(p);
                        hostHandlePetOrder({ researcher: p, setEvents: undefined, payload });
                        processed.current.set(p.id, reqId);
                        continue;
                 }

                // --------- END ABILITIES ----------

                // CONTAINER (any Tank) — stationary, load-only, must be near
                if (type === "container") {
                    const payload = readActionPayload(p) || {};
                    const { containerId, op } = payload || {};
                    const tank = findItem(String(containerId));
                    if (!tank || !isTankType(tank.type)) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    // must be close to the stationary tank
                    const dx = px - tank.x,
                        dz = pz - tank.z;
                    if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    let changed = false;
                    if (op === "load" || op === "toggle") {
                        changed = tryLoadIntoTank({
                            player: p,
                            tank,
                            itemsList: list,
                            getBackpack,
                            setBackpack,
                            setItems,
                        });
                    }

                    processed.current.set(p.id, reqId);
                    continue;
                }

                // PICKUP
                if (type === "pickup") {
                    const nowSec = Math.floor(Date.now() / 1000);
                    let until = Number(p.getState("pickupUntil") || 0);
                    if (until > 1e11) until = Math.floor(until / 1000);
                    if (nowSec < until) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    const it = findItem(target);
                    if (!it) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }
                    // Pets cannot be picked up
                     if (it.type === "pet") {
                           processed.current.set(p.id, reqId);
                           continue;
                         }
                    // Tanks are NOT pickable — treat P near any tank as "load one matching item"
                    if (isTankType(it.type)) {
                        const dx = px - it.x,
                            dz = pz - it.z;
                        if (Math.hypot(dx, dz) <= PICKUP_RADIUS) {
                            const ok = tryLoadIntoTank({
                                player: p,
                                tank: it,
                                itemsList: list,
                                getBackpack,
                                setBackpack,
                                setItems,
                            });
                            if (ok) {
                                p.setState("pickupUntil", nowSec + Number(PICKUP_COOLDOWN || 20), true);
                            }
                        }
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    if (it.holder && it.holder !== p.id) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }
                    if (!hasCapacity(p)) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    const dx = px - it.x,
                        dz = pz - it.z;
                    if (Math.hypot(dx, dz) > PICKUP_RADIUS) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    setItems(
                        (prev) => prev.map((j) => (j.id === it.id ? { ...j, holder: p.id, vx: 0, vy: 0, vz: 0 } : j)),
                        true
                    );

                    const carry = String(p.getState("carry") || "");
                    if (!carry) p.setState("carry", it.id, true);

                    // add to backpack (with role bonuses)
                    const bp = getBackpack(p);
                    if (!bp.find((b) => b.id === it.id)) {
                        // put the picked world item in as usual
                        let nextBp = [...bp, { id: it.id, type: it.type }];

                        const role = String(p.getState?.("role") || "");

                        // --- FoodSupplier bonus: +1 FOOD (stacked, no extra slot)
                        if (role === "FoodSupplier" && isType(it.type, "food")) {
                            const idx = nextBp.findIndex((b) => !b.id && isType(b.type, "food"));
                            if (idx >= 0) {
                                const entry = nextBp[idx];
                                nextBp[idx] = { ...entry, qty: Number(entry?.qty || 1) + 1, bonus: true };
                            } else {
                                nextBp.push({ type: "food", qty: 1, bonus: true });
                            }
                        }

                        // --- Engineer bonus: +1 FUEL (stacked, no extra slot)
                        if (role === "Engineer" && isType(it.type, "fuel")) {
                            const idx = nextBp.findIndex((b) => !b.id && isType(b.type, "fuel"));
                            if (idx >= 0) {
                                const entry = nextBp[idx];
                                nextBp[idx] = { ...entry, qty: Number(entry?.qty || 1) + 1, bonus: true };
                            } else {
                                nextBp.push({ type: "fuel", qty: 1, bonus: true });
                            }
                        }

                        setBackpack(p, nextBp);
                    }



                    p.setState("pickupUntil", nowSec + Number(PICKUP_COOLDOWN || 20), true);
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // DROP
                if (type === "drop") {
                    const it = findItem(target);
                    if (!it || it.holder !== p.id) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    setItems(
                        (prev) =>
                            prev.map((j) =>
                                j.id === it.id
                                    ? {
                                        ...j,
                                        holder: null,
                                        x: px,
                                        y: Math.max(py + 0.5, FLOOR_Y + 0.01),
                                        z: pz,
                                        vx: 0,
                                        vy: 0,
                                        vz: 0,
                                    }
                                    : j
                            ),
                        true
                    );

                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                    setBackpack(p, getBackpack(p).filter((b) => b.id !== it.id));

                    processed.current.set(p.id, reqId);
                    continue;
                }

                // THROW
                if (type === "throw") {
                    const it = findItem(target);
                    if (!it || it.holder !== p.id) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }
                    const yaw = Number(p.getState("yaw") || value || 0);
                    const vx = Math.sin(yaw) * THROW_SPEED;
                    const vz = Math.cos(yaw) * THROW_SPEED;
                    const vy = 4.5;

                    setItems(
                        (prev) =>
                            prev.map((j) =>
                                j.id === it.id
                                    ? {
                                        ...j,
                                        holder: null,
                                        x: px,
                                        y: Math.max(py + 1.1, FLOOR_Y + 0.2),
                                        z: pz,
                                        vx,
                                        vy,
                                        vz,
                                    }
                                    : j
                            ),
                        true
                    );

                    if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                    setBackpack(p, getBackpack(p).filter((b) => b.id !== it.id));

                    processed.current.set(p.id, reqId);
                    continue;
                }

                // USE (includes CCTV place)
                if (type === "use") {
                    const [kind, idStr] = String(p.getState("reqTarget") || "").split("|");
                    const it = findItem(idStr);
                    const bp = getBackpack(p);

                    // --- NEW: PLACE CCTV from backpack (or while held) ---
                    if (kind === "place") {
                        // Allowed if:
                        //  - item exists and is held by player, OR
                        //  - camera entry exists in backpack (id match) even if not a world item yet
                        const heldOk = !!it && it.holder === p.id && it.type === "cctv";
                        const bpCam = bp.find((b) => b.id === idStr && b.type === "cctv");

                        if (!heldOk && !bpCam) {
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        const yaw = Number(p.getState("yaw") || 0);
                        const fdx = Math.sin(yaw), fdz = Math.cos(yaw);

                        // If camera not a world item yet, spawn it; otherwise move+drop the held one to mounted pose
                        if (!it) {
                            setItems((prev) => [
                                ...prev,
                                {
                                    id: idStr,
                                    type: "cctv",
                                    name: "CCTV Camera",
                                    holder: null,
                                    x: px + fdx * 0.6,
                                    y: Math.max(py + 1.4, FLOOR_Y + 1.4),
                                    z: pz + fdz * 0.6,
                                    yaw,
                                    placed: true,
                                    owner: p.id,
                                    day: useGameClock.getState().dayNumber,
                                },
                            ], true);
                        } else {
                            setItems((prev) =>
                                prev.map((j) =>
                                    j.id === it.id
                                        ? {
                                            ...j,
                                            holder: null,
                                            x: px + fdx * 0.6,
                                            y: Math.max(py + 1.4, FLOOR_Y + 1.4),
                                            z: pz + fdz * 0.6,
                                            vx: 0, vy: 0, vz: 0,
                                            yaw,
                                            placed: true,
                                            owner: p.id,
                                        }
                                        : j
                                ),
                                true);
                        }

                        // Remove from backpack and clear carry if needed
                        setBackpack(p, bp.filter((b) => b.id !== idStr));
                        if (String(p.getState("carry") || "") === idStr) p.setState("carry", "", true);

                        processed.current.set(p.id, reqId);
                        continue;
                    }
                    // --- END PLACE CCTV ---

                    // From here down: legacy "use" flows that require a held world item
                    if (!it || it.holder !== p.id) {
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    // eat food
                    if (kind === "eat" && it.type === "food") {
                        setItems((prev) => prev.map((j) => (j.id === it.id ? { ...j, holder: "_gone_", y: -999 } : j)), true);
                        setBackpack(p, getBackpack(p).filter((b) => b.id !== it.id));
                        if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    // use on device (reactor/medbay/shield/etc.)
                    const dev = DEVICES.find((d) => d.id === kind);
                    if (dev) {
                        const dx = px - dev.x, dz = pz - dev.z;
                        const r = Number(dev.radius || DEVICE_RADIUS);
                        if (dx * dx + dz * dz <= r * r) {
                            const eff = USE_EFFECTS?.[it.type]?.[dev.type];
                            if (eff) {
                                // Apply effects in your meters system if desired
                                // Consume item
                                setItems((prev) => prev.map((j) => (j.id === it.id ? { ...j, holder: "_used_", y: -999 } : j)), true);
                                setBackpack(p, getBackpack(p).filter((b) => b.id !== it.id));
                                if (String(p.getState("carry") || "") === it.id) p.setState("carry", "", true);
                            }
                        }
                    }
                    processed.current.set(p.id, reqId);
                    continue;
                }

                // Fallback
                processed.current.set(p.id, reqId);
            }
            // --- PET AI: follow owner / stay / seekCure ---
            {
                const PET_DT = 0.05; // ~50ms loop cadence
                const pets = (itemsRef.current || []).filter(i => i.type === "pet");
                if (pets.length) {
                    const updated = new Map();

                    // helper: shortest-arc yaw interpolation
                    const lerpAngle = (a, b, t) => {
                        let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                        return a + d * t;
                    };

                    // helper: nearest cure item (free on floor)
                    const nearestCure = (x, z) => {
                        let best = null, bestD2 = Infinity;
                        for (const it of (itemsRef.current || [])) {
                            if (!it || it.holder) continue;
                            const t = String(it.type || "").toLowerCase();
                            if (t !== "cure_red" && t !== "cure_blue") continue;
                            const dx = it.x - x, dz = it.z - z;
                            const d2 = dx * dx + dz * dz;
                            if (d2 < bestD2) { best = it; bestD2 = d2; }
                        }
                        return best;
                    };

                    for (const pet of pets) {
                        const owner = (playersRef.current || []).find(pl => pl.id === pet.owner) || myPlayer();
                        const mode = String(owner?.getState?.("petMode") || pet.mode || "follow");

                        let { x, y, z } = pet;
                        let yaw = pet.yaw || 0;

                        const speed = pet.speed ?? 2.2;
                        const hoverY = pet.hover ?? 0.35;

                        // default target is current position
                        let tgtX = x, tgtZ = z, tgtY = y, lookAtYaw = yaw;

                        if (mode === "follow" && owner) {
                            const ox = Number(owner.getState("x") || 0);
                            const oy = Number(owner.getState("y") || 0);
                            const oz = Number(owner.getState("z") || 0);
                            const ry = Number(owner.getState("ry") ?? owner.getState("yaw") ?? 0);

                            // behind-right of owner (keeping your formation offsets)
                            const backX = -Math.sin(ry), backZ = -Math.cos(ry);
                            const rightX = Math.cos(ry), rightZ = -Math.sin(ry);

                            tgtX = ox + backX * 2.4 + rightX * 1.2; // doubled spacing
                            tgtZ = oz + backZ * 2.4 + rightZ * 1.2; // doubled spacing
                            tgtY = Math.max(oy + hoverY, 0.2);
                            lookAtYaw = Math.atan2(ox - x, oz - z); // glance toward owner
                        }

                        if (mode === "seekCure") {
                            const it = nearestCure(x, z);
                            if (it) {
                                const dx = it.x - x, dz = it.z - z;
                                const dist = Math.hypot(dx, dz) || 1;
                                const desiredYaw = Math.atan2(dx, dz);
                                lookAtYaw = desiredYaw;

                                const stopDist = 0.7;              // stand-off from the item
                                const wantDist = Math.max(0, dist - stopDist);

                                // ⬇️ PUT THESE 3 LINES HERE (replace your previous step calc)
                                const SLOW_FACTOR = 1 / 3;                            // 3× slower
                                const base = Number(pet.seekSpeed ?? 1.4) * SLOW_FACTOR;
                                const slow = Math.max(0.6, Math.min(1, wantDist / 1.5)); // keep the near-target easing
                                const step = Math.min(wantDist, (base * slow) * PET_DT);


                                if (wantDist > 0.001) {
                                    x += (dx / dist) * step;
                                    z += (dz / dist) * step;
                                }
                                // slight hover settle
                                tgtY = Math.max((pet.y || 0) + hoverY, 0.2);
                            } else if (owner) {
                                // no cure on map → gracefully fall back to follow position
                                const ox = Number(owner.getState("x") || 0);
                                const oy = Number(owner.getState("y") || 0);
                                const oz = Number(owner.getState("z") || 0);
                                const ry = Number(owner.getState("ry") ?? owner.getState("yaw") ?? 0);
                                const backX = -Math.sin(ry), backZ = -Math.cos(ry);
                                const rightX = Math.cos(ry), rightZ = -Math.sin(ry);
                                tgtX = ox + backX * 2.4 + rightX * 1.2;
                                tgtZ = oz + backZ * 2.4 + rightZ * 1.2;
                                tgtY = Math.max(oy + hoverY, 0.2);
                                lookAtYaw = Math.atan2(ox - x, oz - z);
                            }
                        }

                        if (mode === "stay") {
                            // just hover and face the owner a bit if available
                            if (owner) {
                                const ox = Number(owner.getState("x") || 0);
                                const oz = Number(owner.getState("z") || 0);
                                lookAtYaw = Math.atan2(ox - x, oz - z);
                            }
                            tgtX = x; tgtZ = z; tgtY = Math.max((pet.y || 0) + hoverY, 0.2);
                        }

                        // move toward target (follow mode uses tgtX/Z above; seekCure may have already moved x/z)
                        if (mode !== "seekCure") {
                            const dx = tgtX - x, dz = tgtZ - z;
                            const dist = Math.hypot(dx, dz);
                            const step = Math.min(dist, speed * PET_DT);
                            if (dist > 0.001) { x += (dx / dist) * step; z += (dz / dist) * step; }
                        }

                        // ease yaw
                        yaw = lerpAngle(yaw, lookAtYaw, 0.25);

                        // smooth vertical
                        y += ((tgtY ?? (pet.y || 0)) - y) * 0.2;

                        updated.set(pet.id, { x, y, z, yaw, mode });
                    }

                    if (updated.size) {
                        setItems(prev => prev.map(j => {
                            const u = updated.get(j.id);
                            return u ? { ...j, ...u } : j;
                        }), true);
                    }
                }
            }
            // --- END PET AI ---


            // schedule next tick
            timerId = setTimeout(loop, 50);
        };

        loop();

        // cleanup
        return () => {
            cancelled = true;
            if (timerId) clearTimeout(timerId);
        };
    }, [host, setItems]);

    return null;
}
