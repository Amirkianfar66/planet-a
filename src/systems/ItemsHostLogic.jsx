// src/systems/ItemsHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import {
    hostHandleShoot,
    readActionPayload,
    hostHandleBite,
    usePhase,
    hostHandleArrest,
    hostHandleDisguise,
    hostHandleScan,
} from "../network/playroom";
import useItemsSync from "./useItemsSync.js";
import { DEVICES, USE_EFFECTS, INITIAL_ITEMS } from "../data/gameObjects.js";
import {
    PICKUP_RADIUS,
    DEVICE_RADIUS,
    BAG_CAPACITY,
} from "../data/constants.js";
import { useGameClock } from "../systems/dayNightClock";
import {
    OUTSIDE_AREA,
    pointInRect,
    clampToRect,
    isOutsideByRoof,
    randomPointInRoom,
    roomCenter,
} from "../map/deckA";
import COOLDOWN from "../data/cooldowns"; //
import { RANDOM_OUTDOOR_TYPES, computeOutdoorSpread } from "../data/spawnUtils.js";

// id helper (prevents seeding from crashing if id is missing)
const cryptoRandomId = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `id_${Math.random().toString(36).slice(2, 10)}`;

const FLOOR_Y = 0;
const GRAV = 16;
const DT = 0.05;
const THROW_SPEED = 8;
const TANK_CAP_DEFAULT = 6;
const UNITS_PER_LOAD = 1;

// Keep spawned things inside the designated outdoor rectangle.
const OUT_MARGIN = 0.75; // small buffer so they don't hug the edge
function ensureOutdoorPos(x, z) {
    if (pointInRect(OUTSIDE_AREA, x, z, OUT_MARGIN)) return { x, z };
    const c = clampToRect(OUTSIDE_AREA, x, z, OUT_MARGIN);
    return { x: c.x, z: c.z };
}
function resolveItemSpawn(it) {
    // If a roomKey is provided, convert to world x/z using the room center and optional offset
    if (it.roomKey) {
        const c = roomCenter(it.roomKey);
        if (c) {
            const ox = it.offset?.x ?? 0;
            const oz = it.offset?.z ?? 0;
            return { ...it, x: c.x + ox, y: it.y ?? 0, z: c.z + oz };
        }
    }
    // Fall back to existing x/z
    return it;
}

// Prefer a random point in the Meeting Room (if it exists).
function spawnInMeetingRoom(fallbackX = 0, fallbackZ = 0) {
    const p = randomPointInRoom("meeting_room", 0.8); // {x,y,z} or null
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        return { x: p.x, z: p.z };
    }
    return ensureOutdoorPos(fallbackX, fallbackZ);
}

/* --- HELPERS (single, case-insensitive) --- */

// normalize type match (case-insensitive)
const isType = (v, t) =>
    String(v || "").toLowerCase() === String(t || "").toLowerCase();

// Treat anything that looks like a food item as edible.
// Excludes tanks/receivers so we don't eat those by accident.
const isFoodConsumableType = (t) => {
    const s = String(t || "").toLowerCase();
    if (!s) return false;
    if (s.endsWith("_tank") || s.endsWith("_receiver")) return false;
    return s === "food" || s === "poison_food" || s.includes("food");
};

// Poison variant of food (poison + food in the name, or explicit poison_food)
const isPoisonFoodType = (t) => {
    const s = String(t || "").toLowerCase();
    return s === "poison_food" || (s.includes("poison") && s.includes("food"));
};
// Map any item type to the implied action
const inferKindFor = (t) => {
  if (isFoodConsumableType(t)) return "eat";   // handles "food", "poison_food", and any *food*-ish name
  if (isType(t, "protection")) return "cure";
  return null;
};

// Tank helpers
const TANK_ACCEPTS = {
    food_tank: "food",
    fuel_tank: "fuel",
    protection_tank: "protection",
    oxygen_device: "fuel",    // NEW
};
const isTankType = (t) =>
    t === "food_tank" || t === "fuel_tank" || t === "protection_tank" || t === "oxygen_device";

// Cure Device (already present in your file)
const isCureDevice = (t) => String(t || "").toLowerCase() === "cure_device";
const cureTotal = (stored) => Number(stored?.red || 0) + Number(stored?.blue || 0);
const CURE_NEED_RED = 2;
const CURE_NEED_BLUE = 2;

// Cure Receiver
const isCureReceiver = (t) => String(t || "").toLowerCase() === "cure_receiver";


// Receivers
const isReceiverType = (t) => t === "food_receiver" || t === "protection_receiver";

// Team normalizer: 'Alpha'/'A'/'teama' -> 'teama'
const TEAM_LABELS_LOWER = { teama: "alpha", teamb: "beta", teamc: "gamma", teamd: "delta" };
function normalizeTeamKey(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (TEAM_LABELS_LOWER[s]) return s;            // already teama/b/c/d
    const hit = Object.entries(TEAM_LABELS_LOWER).find(([, v]) => v === s); // pretty -> slug
    return hit ? hit[0] : "";
}
function isOxygenPowered(itemsList) {
    const ox = (itemsList || []).find(i => i && i.type === "oxygen_device");
    return Number(ox?.stored || 0) > 0;
}
// ---- ROOM-MAPPED OXYGEN POWER -------------------------------------
const ROCKET_DEVICE_ID = "oxygen_device_rocket_1";

// Returns true if *any* oxygen device with stored>0 matches the predicate
function hasPoweredOxygen(itemsList, predicate = () => true) {
    for (const it of (itemsList || [])) {
        if (it?.type !== "oxygen_device") continue;
        if (Number(it?.stored || 0) <= 0) continue;
        if (predicate(it)) return true;
    }
    return false;
}

// We only need to distinguish Rocket vs Not-Rocket per your spec.
// Try to use the actual "Rocket" room center if available.
function isInRocketRoom(x, z) {
    try {
        const c = roomCenter("Rocket");
        if (!c) return false;
        const dx = x - Number(c.x || 0);
        const dz = z - Number(c.z || 0);
        const R = 7; // tweak room radius if Rocket is larger/smaller
        return dx * dx + dz * dz <= R * R;
    } catch {
        return false;
    }
}

// Given player position and items, decide if indoor oxygen should be powered
function isRoomOxygenPoweredForPlayer(x, z, itemsList) {
    // Rocket room is powered ONLY by the Rocket device
    if (isInRocketRoom(x, z)) {
        return hasPoweredOxygen(itemsList, (it) => it.id === ROCKET_DEVICE_ID);
    }
    // All other rooms are powered by any oxygen device that is NOT the Rocket device
    return hasPoweredOxygen(itemsList, (it) => it.id !== ROCKET_DEVICE_ID);
}

// Add one stackable item to backpack
function addOneToBackpack(bp, type) {
    const list = Array.isArray(bp) ? bp : [];
    const idx = list.findIndex((b) => !b?.id && String(b?.type).toLowerCase() === String(type).toLowerCase());
    if (idx >= 0) {
        const e = list[idx];
        const qty = Number(e.qty || 1);
        const next = [...list];
        next[idx] = { ...e, qty: qty + 1 };
        return next;
    }
    return [...list, { type, qty: 1 }];
}


// Find an actual world item of a given type held by player p
const findHeldItemByType = (type, p, itemsList) =>
    (itemsList || []).find((i) => isType(i.type, type) && i.holder === p.id);

// Remove exactly ONE unit from the backpack.
const removeOneByType = (bp, type, idToRemove) => {
    if (!Array.isArray(bp)) return [];
    if (idToRemove) {
        const idx = bp.findIndex((b) => b.id === idToRemove);
        if (idx !== -1) return bp.slice(0, idx).concat(bp.slice(idx + 1));
    }
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
const tryLoadIntoTank = ({
    player: p,
    tank,
    itemsList,
    getBackpack,
    setBackpack,
    setItems,
}) => {
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
            (prev) =>
                prev.map((j) =>
                    j.id === entity.id ? { ...j, holder: "_gone_", y: -999, hidden: true } : j
                ),
            true
        );
        removed = true;
        nextBp = removeOneByType(bp, want, entry?.id);

        if (String(p.getState("carry") || "") === entity.id) {
            p.setState("carry", "", true);
        }
    } else {
        const after = removeOneByType(bp, want, entry?.id);
        removed = after !== bp;
        nextBp = after;
    }

    if (!removed) return false;

    setBackpack(p, nextBp);
    setItems(
        (prev) =>
            prev.map((j) =>
                j.id === tank.id
                    ? {
                        ...j,
                        stored: Math.min(
                            Number(j.cap ?? cap),
                            Number(j.stored || 0) + addUnits
                        ),
                    }
                    : j
            ),
        true
    );

    return true;
};

/**
 * Load ONE cure item (A or B) into a Cure Device.
 * - Prefers the type that moves toward 2A/2B.
 * - Consumes from held entity if applicable, else from stack row in backpack.
 * - After loading, if stored == 2A/2B, crafts Cure (Advanced) and spawns it on floor.
 */
const tryLoadIntoCureDevice = ({
    player: p,
    device,
    itemsList,
    getBackpack,
    setBackpack,
    setItems,
}) => {
    if (!isCureDevice(device?.type)) return false;

    const cap = Number(device.cap ?? 4);
    const red = Number(device?.stored?.red || 0);
    const blue = Number(device?.stored?.blue || 0);
    const total = red + blue;
    if (total >= cap) return false;

    const bp = getBackpack(p) || [];

    // what the player is carrying right now
    const carryId = String(p.getState?.("carry") || "");
    const carriedEntity = (itemsList || []).find(
        (i) =>
            i?.id === carryId &&
            (isType(i?.type, "cure_red") || isType(i?.type, "cure_blue"))
    );

    // pick which color to load next (bias toward completing 2+2)
    const hasA = carriedEntity
        ? isType(carriedEntity.type, "cure_red")
        : bp.some((b) => isType(b?.type, "cure_red"));
    const hasB = carriedEntity
        ? isType(carriedEntity.type, "cure_blue")
        : bp.some((b) => isType(b?.type, "cure_blue"));

    const needR = Math.max(0, CURE_NEED_RED - red);
    const needB = Math.max(0, CURE_NEED_BLUE - blue);

    let loadType = null; // "cure_red" | "cure_blue"
    if (needR > 0 && hasA) loadType = "cure_red";
    else if (needB > 0 && hasB) loadType = "cure_blue";
    else if (hasA) loadType = "cure_red";
    else if (hasB) loadType = "cure_blue";
    else return false;

    if (total + 1 > cap) return false;

    // remove from carry/backpack
    let nextBp = bp;
    if (carriedEntity && isType(carriedEntity.type, loadType)) {
        setItems(
            (prev) =>
                prev.map((j) =>
                    j.id === carriedEntity.id
                        ? { ...j, holder: "_gone_", y: -999, hidden: true, vx: 0, vy: 0, vz: 0 }
                        : j
                ),
            true
        );
        nextBp = removeOneByType(bp, loadType, carriedEntity.id);
        if (String(p.getState("carry") || "") === carriedEntity.id) {
            p.setState("carry", "", true);
        }
    } else {
        const after = removeOneByType(bp, loadType);
        if (after === bp) return false;
        nextBp = after;
    }
    setBackpack(p, nextBp);

    // compute the post-deposit counts immediately
    const rNext = red + (isType(loadType, "cure_red") ? 1 : 0);
    const bNext = blue + (isType(loadType, "cure_blue") ? 1 : 0);

    // Case 1: this deposit COMPLETES 2A+2B → craft now (same tick)
    if (rNext === CURE_NEED_RED && bNext === CURE_NEED_BLUE) {
        setItems(
            (prev) => {
                const arr = Array.isArray(prev) ? prev : [];

                // find nearest Cure Receiver
                let recIdx = -1;
                let bestD2 = Infinity;
                for (let i = 0; i < arr.length; i++) {
                    const it = arr[i];
                    if (!isCureReceiver(it?.type)) continue;
                    const dx = Number(device?.x || 0) - Number(it.x || 0);
                    const dz = Number(device?.z || 0) - Number(it.z || 0);
                    const d2 = dx * dx + dz * dz;
                    if (d2 < bestD2) { bestD2 = d2; recIdx = i; }
                }

                let delivered = false;

                const updated = arr.map((obj, i) => {
                    // consume the 2+2 from the device (since this deposit completes it)
                    if (obj.id === device.id) {
                        return { ...obj, stored: { red: 0, blue: 0 } };
                    }
                    // try to increment the receiver if available and not full
                    if (i === recIdx) {
                        const cap = Number(obj.cap ?? 6);
                        const cur = Number(obj.stored || 0);
                        if (cur < cap) {
                            delivered = true;
                            return { ...obj, stored: cur + 1 };
                        }
                    }
                    return obj;
                });

                // fallback: spawn Cure (Advanced) on the floor near the device
                if (!delivered) {
                    updated.push({
                        id: cryptoRandomId(),
                        type: "cure_advanced",
                        name: "Cure (Advanced)",
                        x: Number(device?.x ?? 0) + 0.4,
                        y: FLOOR_Y,
                        z: Number(device?.z ?? 0) + 0.0,
                    });
                }

                return updated;
            },
            true
        );

        return true;
    }

    // Case 2: still filling → just store the one unit we deposited
    setItems(
        (prev) =>
            prev.map((j) =>
                j.id === device.id
                    ? {
                        ...j,
                        stored: {
                            red: rNext,
                            blue: bNext,
                        },
                    }
                    : j
            ),
        true
    );

    return true;
};


function tryDispenseFromTeamTank({ player: p, receiver, itemsList, getBackpack, setBackpack, setItems }) {
    const want = receiver.type === "food_receiver" ? "food" : "protection";
    const tankType = `${want}_tank`;

    // Team gate
    const myTeam = normalizeTeamKey(p.getState?.("team") || p.getState?.("teamName"));
    const rxTeam = normalizeTeamKey(receiver.team);
    if (!myTeam || !rxTeam || myTeam !== rxTeam) return false;

    // Find that team's tank of the right kind
    const tank = (itemsList || []).find((it) => it?.type === tankType && normalizeTeamKey(it.team) === myTeam);
    if (!tank) return false;

    const stored = Number(tank.stored || 0);
    if (stored < 1) return false;                           // must have at least 1

    const bp = getBackpack(p) || [];
    if (bp.length >= Number(BAG_CAPACITY || 8)) return false;

    // -1 from tank
    setItems((prev) => prev.map((j) => (j.id === tank.id ? { ...j, stored: stored - 1 } : j)), true);

    // +1 to backpack (stackable)
    const nextBp = addOneToBackpack(bp, want);
    setBackpack(p, nextBp);

    return true;
}
function tryDispenseFromCureReceiver({ player: p, receiver, getBackpack, setBackpack, setItems }) {
    const stored = Number(receiver?.stored || 0);
    if (stored <= 0) return false;

    const bp = getBackpack(p) || [];
    if (bp.length >= Number(BAG_CAPACITY || 8)) return false;

    // -1 from receiver
    setItems(prev => prev.map(j => (j.id === receiver.id ? { ...j, stored: stored - 1 } : j)), true);

    // +1 Cure Advanced to backpack (stackable)
    const nextBp = addOneToBackpack(bp, "cure_advanced");
    setBackpack(p, nextBp);

    return true;
}

/* ---- role helper for Officer/Guard/Security ---- */
const isOfficerRole = (r) => {
    const s = String(r || "").toLowerCase();
    return s.includes("officer") || s.includes("guard") || s.includes("security");
};

export default function ItemsHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);
    const [phase] = usePhase();

    const { items, setItems } = useItemsSync();

    // live refs
    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
        // lightweight global read hook for host handlers & debugging
        window.__itemsCache__ = () => itemsRef.current || [];
    }, [items]);

    const playersRef = useRef(players);
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const processed = useRef(new Map());
    const seededOnce = useRef(false);

    const getBackpack = (p) => {
        const raw = p?.getState("backpack");
        return Array.isArray(raw) ? raw : [];
    };
    const setBackpack = (p, arr) =>
        p?.setState("backpack", Array.isArray(arr) ? arr : [], true);
    const hasCapacity = (p) => getBackpack(p).length < Number(BAG_CAPACITY || 8);

    /* ───────────────────────────────── SEEDING (host only, once) ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;
        if (seededOnce.current) return;

        const list = itemsRef.current || [];
        const hasNonPet =
            Array.isArray(list) &&
            list.some((i) => i && String(i.type).toLowerCase() !== "pet");
        if (hasNonPet) {
            // already have items; nothing to do
            seededOnce.current = true;
            return;
        }

        // 0) Prime IDs so the spread map has stable keys even if INITIAL_ITEMS omit id
        const allInitialPrimed = (Array.isArray(INITIAL_ITEMS) ? INITIAL_ITEMS : []).map(
            (raw, idx) => ({
                ...raw,
                id:
                    raw.id || `seed_${idx}_${String(raw.type || "item").toLowerCase()}`,
            })
        );

        // 1) Build randomized outdoor layout for select types
        const toRandomize = allInitialPrimed.filter((it) =>
            RANDOM_OUTDOOR_TYPES.has(String(it.type || "").toLowerCase())
        );
        const seed = Date.now(); // for deterministic replays, store/read a shared seed instead
        const posMap = computeOutdoorSpread(toRandomize, { minDist: 10, seed });

        // 2) Build the seeded list, overriding x/z for randomized types
        const seeded = allInitialPrimed.map((raw) => {
            const base = resolveItemSpawn(raw);

            let { x, z } = base;
            if (RANDOM_OUTDOOR_TYPES.has(String(base.type || "").toLowerCase())) {
                const pOut = posMap.get(base.id);
                if (pOut) {
                    x = pOut.x;
                    z = pOut.z;
                }
            }

            const needsFallback = !(Number.isFinite(x) && Number.isFinite(z));
            const p = needsFallback ? spawnInMeetingRoom(x ?? 0, z ?? 0) : { x, z };

            return {
                holder: "",
                vx: 0,
                vy: 0,
                vz: 0,
                y: 0,
                ...base,
                x: needsFallback ? p.x : x,
                z: needsFallback ? p.z : z,
                id: base.id || cryptoRandomId(),
            };
        });

        setItems(
            (prev) => {
                const base = Array.isArray(prev) ? prev : [];
                const pets = base.filter(
                    (i) => i && String(i.type).toLowerCase() === "pet"
                );
                const existing = new Set(base.map((i) => i?.id));
                const add = seeded.filter((i) => !existing.has(i.id));
                return [...pets, ...add];
            },
            true
        );

        seededOnce.current = true;
        console.log("[ITEMS] Seeded items. Count:", seeded.length);
    }, [host, setItems]);

    /* ───────────────────────────────── THROW PHYSICS ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;
        const h = setInterval(() => {
            setItems(
                (prev) =>
                    prev.map((it) => {
                        if (it.holder && it.holder !== null && it.holder !== "") return it; // held/consumed/hidden: no physics
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

    /* ───────────────────────────────── DAILY TICKS (energy, etc.) ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;

        const readClock = () =>
            typeof useGameClock.getState === "function"
                ? useGameClock.getState()
                : null;

        let lastDay = Number(readClock()?.dayNumber ?? 0);

        const applyDailyUpdates = (d) => {
            // Energy -25 for all alive players
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            for (const pl of everyone) {
                if (pl.getState?.("dead")) continue;
                const cur = Number(pl.getState?.("energy") ?? 100);
                const next = Math.max(0, Math.min(100, cur - 25));
                pl.setState?.("energy", next, true);
            }
        };

        let rafId = 0;
        const tick = () => {
            const s = readClock();
            if (s) {
                const d = Number(s.dayNumber ?? 0);
                if (d !== lastDay) {
                    applyDailyUpdates(d);
                    lastDay = d;
                }
            }
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [host, setItems]);

    /* ───────────────────────────────── BASELINE PLAYER STATE ───────────────────────────────── */
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

    /* ───────────────────────────────── OXYGEN: DRAIN ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;
        const DRAIN_PER_TICK = 1; // % per second
        const TICK_MS = 1000;

        const timer = setInterval(() => {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            const list = itemsRef.current || [];

            for (const pl of everyone) {
                if (pl.getState?.("dead")) continue;

                const px = Number(pl.getState?.("x") || 0);
                const pz = Number(pl.getState?.("z") || 0);
                const outside = isOutsideByRoof(px, pz);

                // room-scoped power (Rocket vs non-Rocket mapping)
                const roomPowered = isRoomOxygenPoweredForPlayer(px, pz, list);

                if (outside || !roomPowered) {
                    const cur = Number(pl.getState?.("oxygen") ?? 100);
                    if (cur <= 0) continue;
                    const next = Math.max(0, Math.min(100, cur - DRAIN_PER_TICK));
                    pl.setState?.("oxygen", next, true);
                }
            }
        }, TICK_MS);

        return () => clearInterval(timer);
    }, [host]);

    /* ───────────────────────────────── OXYGEN: REGEN (+3 per in-game hour) ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;

        const store =
            typeof useGameClock.getState === "function"
                ? useGameClock.getState()
                : null;
        const getSec =
            store && typeof store.nowGameSec === "function"
                ? store.nowGameSec
                : null;
        if (!getSec) return; // safe no-op if your clock doesn't expose seconds

        let prevSec = getSec();

        const onHour = () => {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            for (const pl of everyone) {
                if (pl.getState?.("dead")) continue;

                const x = Number(pl.getState?.("x") || 0);
                const z = Number(pl.getState?.("z") || 0);
                const outside = isOutsideByRoof(x, z);
                const roomPowered = isRoomOxygenPoweredForPlayer(
                    x,
                    z,
                    itemsRef.current || []
                );
                if (!outside && roomPowered) {
                    const cur = Number(pl.getState?.("oxygen") ?? 100);
                    const next = Math.min(100, cur + 3);
                    if (next !== cur) pl.setState?.("oxygen", next, true);
                }
            }
        };

        let raf;
        const tick = () => {
            const curSec = getSec();
            const hPrev = Math.floor(prevSec / 3600);
            const hCur = Math.floor(curSec / 3600);
            if (hCur !== hPrev) onHour();

            prevSec = curSec;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [host]);

    /* ───────────────────────────────── POISON DOT ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;
        const DMG_PER_TICK = 1;
        const TICK_MS = 1000;

        const timer = setInterval(() => {
            const everyone = [...(playersRef.current || [])];
            const self = myPlayer();
            if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

            for (const pl of everyone) {
                if (pl.getState?.("dead")) continue;
                const poisoned = !!pl.getState?.("poisoned");
                if (!poisoned) continue;

                const life = Number(pl.getState?.("life") ?? 100);
                if (life <= 0) continue;
                const next = Math.max(0, life - DMG_PER_TICK);
                pl.setState?.("life", next, true);
                if (next <= 0) pl.setState?.("dead", true, true);
            }
        }, TICK_MS);

        return () => clearInterval(timer);
    }, [host]);

    /* ───────────────────────────────── O2 RESET (every in-game “day”) ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;
        const store =
            typeof useGameClock.getState === "function"
                ? useGameClock.getState()
                : null;
        const getSec =
            store && typeof store.nowGameSec === "function"
                ? store.nowGameSec
                : null;
        if (!getSec) return;

        const resetAll = (tag = "ingame1day") => {
            setItems(
                (prev) => {
                    const list = Array.isArray(prev) ? prev : [];
                    const next = list.map((it) =>
                        String(it?.type || "").trim().toLowerCase() === "oxygen_device"
                            ? { ...it, stored: 0, _o2ResetAt: Date.now(), _o2ResetTag: tag }
                            : it
                    );
                    return next;
                },
                true
            );
            try {
                const arr = (window.__itemsCache__?.() || [])
                    .filter((i) => String(i?.type || "").toLowerCase() === "oxygen_device")
                    .map((i) => `${i.id}=${i.stored}`);
                console.log(`[HOST] O2 reset (${tag}) →`, arr.join(", "));
            } catch { }
        };

        let prevBucket = Math.floor(getSec() / 79999);
        let raf;
        const loop = () => {
            const curBucket = Math.floor(getSec() / 79999);
            if (curBucket !== prevBucket) {
                resetAll();
                prevBucket = curBucket;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [host, setItems]);

    /* ───────────────────────────────── ONE-TIME CCTV FOR OFFICERS ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;

        const everyone = [...(playersRef.current || [])];
        const self = myPlayer();
        if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

        for (const p of everyone) {
            const role = String(p.getState?.("role") || "");
            if (!isOfficerRole(role)) continue;

            // One-time flag on the player to prevent re-grant
            const hasFlag = !!p.getState?.("hasCCTVOnce");
            if (hasFlag) continue;

            const bp = p.getState?.("backpack") || [];
            const camId = `cam_${p.id}`;
            const alreadyHas = Array.isArray(bp) && bp.some((b) => b.id === camId);

            if (!alreadyHas) {
                const nextBp = [...bp, { id: camId, type: "cctv", name: "CCTV Camera" }];
                p.setState?.("backpack", nextBp, true);
                const carry = String(p.getState?.("carry") || "");
                if (!carry) p.setState?.("carry", camId, true);
                console.log(`[HOST] Granted one-time CCTV to ${p.id}: ${camId}`);
            }

            p.setState?.("hasCCTVOnce", true, true);
        }
    }, [host]);

    /* ───────────────────────────────── REQUEST LOOP ───────────────────────────────── */
    useEffect(() => {
        if (!host) return;

        let cancelled = false;
        let timerId = null;

        const loop = () => {
            if (cancelled) return;
            try {
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
                    const oxy = pl.getState?.("oxygen");
                    if (oxy === undefined || oxy === null) {
                        pl.setState?.("oxygen", 100, true);
                    }
                }

                const list = itemsRef.current || [];
                const findItem = (id) => list.find((i) => i && i.id === id);

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

                    /* ───────── abilities ───────── */
                    if (type === "ability" && target === "shoot") {
                        const payload = readActionPayload(p);
                        hostHandleShoot({
                            shooter: p,
                            payload,
                            setEvents: undefined,
                            players: everyone,
                        });
                        processed.current.set(p.id, reqId);
                        continue;
                    }
                    if (type === "ability" && target === "bite") {
                        hostHandleBite({ biter: p, setEvents: undefined, players: everyone });
                        processed.current.set(p.id, reqId);
                        continue;
                    }
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
                    if (type === "ability" && target === "scan") {
                        hostHandleScan({ officer: p, players: everyone, setEvents: undefined });
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    /* ───────── container (tanks / cure device) ───────── */
                    if (type === "container") {
                        const payload = readActionPayload(p) || {};
                        const { containerId, op } = payload || {};
                        const cont = findItem(String(containerId));
                        if (!cont || (!isTankType(cont.type) && !isCureDevice(cont.type))) {
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        const dx = px - cont.x,
                            dz = pz - cont.z;
                        if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) {
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        if (op === "load" || op === "toggle") {
                            if (isTankType(cont.type)) {
                                tryLoadIntoTank({
                                    player: p,
                                    tank: cont,
                                    itemsList: list,
                                    getBackpack,
                                    setBackpack,
                                    setItems,
                                });
                            } else if (isCureDevice(cont.type)) {
                                tryLoadIntoCureDevice({
                                    player: p,
                                    device: cont,
                                    itemsList: list,
                                    getBackpack,
                                    setBackpack,
                                    setItems,
                                });
                            }
                        }

                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    /* ───────── pickup ───────── */
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

                        // Team food/protection receiver → dispense from team tank
                        if (isReceiverType(it.type)) {
                            const dx = px - it.x,
                                dz = pz - it.z;
                            if (Math.hypot(dx, dz) <= PICKUP_RADIUS) {
                                const ok = tryDispenseFromTeamTank({
                                    player: p,
                                    receiver: it,
                                    itemsList: list,
                                    getBackpack,
                                    setBackpack,
                                    setItems,
                                });
                                if (ok) {
                                    const nowSec = Math.floor(Date.now() / 1000);
                                    p.setState(
                                        "pickupUntil",
                                        nowSec + Number(COOLDOWN?.ITEMS?.PICKUP_SEC || 20),
                                        true
                                    );
                                }
                            }
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // Cure device near → load one cure unit
                        if (isCureDevice(it.type)) {
                            const dx = px - it.x,
                                dz = pz - it.z;
                            if (Math.hypot(dx, dz) <= PICKUP_RADIUS) {
                                const ok = tryLoadIntoCureDevice({
                                    player: p,
                                    device: it,
                                    itemsList: list,
                                    getBackpack,
                                    setBackpack,
                                    setItems,
                                });
                                if (ok) {
                                    const nowSec = Math.floor(Date.now() / 1000);
                                    p.setState(
                                        "pickupUntil",
                                        nowSec + Number(COOLDOWN?.ITEMS?.PICKUP_SEC || 20),
                                        true
                                    );
                                }
                            }
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // Cure receiver → take one Cure (Advanced)
                        if (it && isCureReceiver(it.type)) {
                            const dx = px - it.x,
                                dz = pz - it.z;
                            if (Math.hypot(dx, dz) <= PICKUP_RADIUS) {
                                const ok = tryDispenseFromCureReceiver({
                                    player: p,
                                    receiver: it,
                                    getBackpack,
                                    setBackpack,
                                    setItems,
                                });
                                if (ok) {
                                    const nowSec = Math.floor(Date.now() / 1000);
                                    p.setState(
                                        "pickupUntil",
                                        nowSec + Number(COOLDOWN?.ITEMS?.PICKUP_SEC || 20),
                                        true
                                    );
                                }
                            }
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // Tanks near → load one matching item
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
                                    p.setState(
                                        "pickupUntil",
                                        nowSec + Number(COOLDOWN.ITEMS.PICKUP_SEC || 20),
                                        true
                                    );
                                }
                            }
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // Regular item pickup
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

                        // make picked item disappear immediately (authoritative)
                        setItems(
                            (prev) =>
                                prev.map((j) =>
                                    j.id === it.id
                                        ? {
                                            ...j,
                                            holder: p.id,
                                            vx: 0,
                                            vy: 0,
                                            vz: 0,
                                            y: -999,
                                            hidden: true,
                                        }
                                        : j
                                ),
                            true
                        );

                        const carry = String(p.getState("carry") || "");
                        if (!carry) p.setState("carry", it.id, true);

                        // add to backpack (with role bonuses)
                        const bp = getBackpack(p);
                        if (!bp.find((b) => b.id === it.id)) {
                            let nextBp = [...bp, { id: it.id, type: it.type }];

                            const role = String(p.getState?.("role") || "");
                            if (role === "FoodSupplier" && isType(it.type, "food")) {
                                const idx = nextBp.findIndex((b) => !b.id && isType(b.type, "food"));
                                if (idx >= 0) {
                                    const entry = nextBp[idx];
                                    nextBp[idx] = {
                                        ...entry,
                                        qty: Number(entry?.qty || 1) + 1,
                                        bonus: true,
                                    };
                                } else {
                                    nextBp.push({ type: "food", qty: 1, bonus: true });
                                }
                            }
                            if (role === "Engineer" && isType(it.type, "fuel")) {
                                const idx = nextBp.findIndex((b) => !b.id && isType(b.type, "fuel"));
                                if (idx >= 0) {
                                    const entry = nextBp[idx];
                                    nextBp[idx] = {
                                        ...entry,
                                        qty: Number(entry?.qty || 1) + 1,
                                        bonus: true,
                                    };
                                } else {
                                    nextBp.push({ type: "fuel", qty: 1, bonus: true });
                                }
                            }

                            setBackpack(p, nextBp);
                        }

                        p.setState(
                            "pickupUntil",
                            nowSec + Number(COOLDOWN.ITEMS.PICKUP_SEC || 20),
                            true
                        );
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    /* ───────── drop ───────── */
                    if (type === "drop") {
                        const tok = String(target || "");
                        const it = findItem(tok);

                        // Case 1: dropping a world entity I'm holding
                        if (it && it.holder === p.id) {
                            setItems(
                                (prev) =>
                                    prev.map((j) =>
                                        j.id === it.id
                                            ? {
                                                ...j,
                                                holder: null,
                                                hidden: false,
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

                            if (String(p.getState("carry") || "") === it.id)
                                p.setState("carry", "", true);
                            setBackpack(
                                p,
                                getBackpack(p).filter((b) => b.id !== it.id)
                            );

                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // Case 2: drop one unit from a stack by type token
                        const tLower = tok.toLowerCase();
                        if (tLower) {
                            const bp = getBackpack(p);
                            const idx = bp.findIndex(
                                (b) => !b?.id && String(b?.type || "").toLowerCase() === tLower
                            );
                            if (idx !== -1) {
                                const row = bp[idx];
                                const qty = Number(row?.qty || 1);
                                const next = [...bp];
                                if (qty > 1) next[idx] = { ...row, qty: qty - 1 };
                                else next.splice(idx, 1);
                                setBackpack(p, next);

                                const nameMap = {
                                    food: "Ration Pack",
                                    poison_food: "Poisoned Ration",
                                    protection: "Shield Badge",
                                    fuel: "Fuel Rod",
                                    cure_advanced: "Cure (Advanced)",
                                    cure_red: "Cure — A",
                                    cure_blue: "Cure — B",
                                };
                                const spawnId = cryptoRandomId();
                                setItems(
                                    (prev) => [
                                        ...(Array.isArray(prev) ? prev : []),
                                        {
                                            id: spawnId,
                                            type: tLower,
                                            name: nameMap[tLower] || tLower,
                                            holder: null,
                                            hidden: false,
                                            x: px,
                                            y: Math.max(py + 0.5, FLOOR_Y + 0.01),
                                            z: pz,
                                            vx: 0,
                                            vy: 0,
                                            vz: 0,
                                        },
                                    ],
                                    true
                                );

                                processed.current.set(p.id, reqId);
                                continue;
                            }
                        }

                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    /* ───────── throw ───────── */
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
                                            hidden: false,
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

                        if (String(p.getState("carry") || "") === it.id)
                            p.setState("carry", "", true);
                        setBackpack(p, getBackpack(p).filter((b) => b.id !== it.id));

                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    /* ───────── use ───────── */
                    let [kind, idStr] = String(p.getState("reqTarget") || "").split("|");
                    let it = findItem(idStr);
                    const bp = getBackpack(p);

                    if (!it && kind && !idStr) {
                        const maybe = findItem(kind);
                        if (maybe) {
                            it = maybe;
                            idStr = kind;
                        }
                    }

                    if (!kind || kind === "use" || kind === "item") {
                        if (it) {
                            const inferred = inferKindFor(it.type);
                            if (inferred) kind = inferred;
                        } else {
                            const key = String(idStr || kind || "").toLowerCase();
                            if (isFoodConsumableType(key)) kind = "eat";
                            else if (isType(key, "protection")) kind = "cure";
                        }
                    }

                    if (type === "use") {
                        // place CCTV
                        if (kind === "place") {
                            const heldOk =
                                !!it && it.holder === p.id && it.type === "cctv";
                            const bpCam = bp.find((b) => b.id === idStr && b.type === "cctv");
                            if (!heldOk && !bpCam) {
                                processed.current.set(p.id, reqId);
                                continue;
                            }

                            const yaw = Number(p.getState("yaw") || 0);
                            const fdx = Math.sin(yaw),
                                fdz = Math.cos(yaw);
                            if (!it) {
                                setItems(
                                    (prev) => [
                                        ...prev,
                                        {
                                            id: idStr,
                                            type: "cctv",
                                            name: "CCTV Camera",
                                            holder: null,
                                            hidden: false,
                                            x: px + fdx * 0.6,
                                            y: Math.max(py + 1.4, FLOOR_Y + 1.4),
                                            z: pz + fdz * 0.6,
                                            yaw,
                                            placed: true,
                                            owner: p.id,
                                            day: useGameClock.getState().dayNumber,
                                        },
                                    ],
                                    true
                                );
                            } else {
                                setItems(
                                    (prev) =>
                                        prev.map((j) =>
                                            j.id === it.id
                                                ? {
                                                    ...j,
                                                    holder: null,
                                                    hidden: false,
                                                    x: px + fdx * 0.6,
                                                    y: Math.max(py + 1.4, FLOOR_Y + 1.4),
                                                    z: pz + fdz * 0.6,
                                                    vx: 0,
                                                    vy: 0,
                                                    vz: 0,
                                                    yaw,
                                                    placed: true,
                                                    owner: p.id,
                                                }
                                                : j
                                        ),
                                    true
                                );
                            }
                            setBackpack(p, bp.filter((b) => b.id !== idStr));
                            if (String(p.getState("carry") || "") === idStr)
                                p.setState("carry", "", true);
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // eat (any food-like; poison_* sets poisoned)
                        if (kind === "eat") {
                            const applyEat = (player, itemType) => {
                                const e = Number(player.getState?.("energy") ?? 100);
                                const nextE = Math.min(100, e + 25);
                                player.setState?.("energy", nextE, true);
                                if (isPoisonFoodType(itemType))
                                    player.setState("poisoned", true, true);
                            };

                            const consumeOneFoodStack = (bpArr, preferType = null) => {
                                if (!Array.isArray(bpArr)) return null;
                                const findIdx = (pred) => bpArr.findIndex(pred);

                                let idx = -1;
                                if (preferType) {
                                    idx = findIdx(
                                        (b) =>
                                            !b?.id &&
                                            isFoodConsumableType(b?.type) &&
                                            isType(b?.type, preferType)
                                    );
                                }
                                if (idx === -1) {
                                    idx = findIdx((b) => !b?.id && isFoodConsumableType(b?.type));
                                }
                                if (idx === -1) return null;

                                const row = bpArr[idx];
                                const qty = Number(row?.qty || 1);
                                const eatenType = row?.type;
                                if (qty > 1) {
                                    const next = [...bpArr];
                                    next[idx] = { ...row, qty: qty - 1 };
                                    return { nextBp: next, eatenType };
                                }
                                return {
                                    nextBp: bpArr.filter((_, i) => i !== idx),
                                    eatenType,
                                };
                            };

                            const consumeIdRowByIdIfFood = (id) => {
                                const idEntry = bp.find(
                                    (b) => b.id === id && isFoodConsumableType(b.type)
                                );
                                if (!idEntry) return false;

                                const entity = findItem(idEntry.id);
                                if (entity) {
                                    setItems(
                                        (prev) =>
                                            prev.map((j) =>
                                                j.id === entity.id
                                                    ? { ...j, holder: "_gone_", y: -999, hidden: true }
                                                    : j
                                            ),
                                        true
                                    );
                                    if (String(p.getState("carry") || "") === entity.id)
                                        p.setState("carry", "", true);
                                }
                                setBackpack(p, bp.filter((b) => b.id !== idEntry.id));
                                applyEat(p, idEntry.type);
                                return true;
                            };

                            const findFirstIdRowAnyFood = (bpArr, preferType = null) => {
                                return (
                                    (bpArr || []).find(
                                        (b) =>
                                            b.id &&
                                            isFoodConsumableType(b.type) &&
                                            (!preferType || isType(b.type, preferType))
                                    ) ||
                                    (bpArr || []).find((b) => b.id && isFoodConsumableType(b.type))
                                );
                            };

                            // A) explicit id
                            if (idStr && consumeIdRowByIdIfFood(idStr)) {
                                processed.current.set(p.id, reqId);
                                continue;
                            }

                            // B) held world item
                            if (it && it.holder === p.id && isFoodConsumableType(it.type)) {
                                applyEat(p, it.type);
                                setItems(
                                    (prev) =>
                                        prev.map((j) =>
                                            j.id === it.id
                                                ? { ...j, holder: "_gone_", y: -999, hidden: true }
                                                : j
                                        ),
                                    true
                                );
                                setBackpack(
                                    p,
                                    getBackpack(p).filter((b) => b.id !== it.id)
                                );
                                if (String(p.getState("carry") || "") === it.id)
                                    p.setState("carry", "", true);
                                processed.current.set(p.id, reqId);
                                continue;
                            }

                            // C) explicit type: food / poison_food / *food*
                            if (idStr && isFoodConsumableType(idStr)) {
                                const stackTry = consumeOneFoodStack(bp, idStr);
                                if (stackTry) {
                                    setBackpack(p, stackTry.nextBp);
                                    applyEat(p, stackTry.eatenType);
                                    processed.current.set(p.id, reqId);
                                    continue;
                                }
                                const idEntryMatch = findFirstIdRowAnyFood(bp, idStr);
                                if (idEntryMatch) {
                                    const entity = findItem(idEntryMatch.id);
                                    if (entity) {
                                        setItems(
                                            (prev) =>
                                                prev.map((j) =>
                                                    j.id === entity.id
                                                        ? { ...j, holder: "_gone_", y: -999, hidden: true }
                                                        : j
                                                ),
                                            true
                                        );
                                        if (String(p.getState("carry") || "") === entity.id)
                                            p.setState("carry", "", true);
                                    }
                                    setBackpack(p, bp.filter((b) => b.id !== idEntryMatch.id));
                                    applyEat(p, idEntryMatch.type);
                                    processed.current.set(p.id, reqId);
                                    continue;
                                }
                            }

                            // D) fallback: any stack food, else any id-row food
                            const stackAny = consumeOneFoodStack(bp);
                            if (stackAny) {
                                setBackpack(p, stackAny.nextBp);
                                applyEat(p, stackAny.eatenType);
                                processed.current.set(p.id, reqId);
                                continue;
                            }
                            const idEntryAny = findFirstIdRowAnyFood(bp);
                            if (idEntryAny) {
                                const entity = findItem(idEntryAny.id);
                                if (entity) {
                                    setItems(
                                        (prev) =>
                                            prev.map((j) =>
                                                j.id === entity.id
                                                    ? { ...j, holder: "_gone_", y: -999, hidden: true }
                                                    : j
                                            ),
                                        true
                                    );
                                    if (String(p.getState("carry") || "") === entity.id)
                                        p.setState("carry", "", true);
                                }
                                setBackpack(p, bp.filter((b) => b.id !== idEntryAny.id));
                                applyEat(p, idEntryAny.type);
                                processed.current.set(p.id, reqId);
                                continue;
                            }

                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // cure (Protection)
                        if (kind === "cure") {
                            const consumeOneProtectionFromStack = (bpArr) => {
                                const idx = Array.isArray(bpArr)
                                    ? bpArr.findIndex(
                                        (b) => !b?.id && isType(b?.type, "protection")
                                    )
                                    : -1;
                                if (idx === -1) return null;
                                const row = bpArr[idx];
                                const qty = Number(row?.qty || 1);
                                if (qty > 1) {
                                    const next = [...bpArr];
                                    next[idx] = { ...row, qty: qty - 1 };
                                    return next;
                                }
                                return bpArr.filter((_, i) => i !== idx);
                            };

                            let cured = false;
                            if (it && it.holder === p.id && isType(it.type, "protection")) {
                                setItems(
                                    (prev) =>
                                        prev.map((j) =>
                                            j.id === it.id
                                                ? { ...j, holder: "_used_", y: -999, hidden: true }
                                                : j
                                        ),
                                    true
                                );
                                setBackpack(
                                    p,
                                    getBackpack(p).filter((b) => b.id !== it.id)
                                );
                                if (String(p.getState("carry") || "") === it.id)
                                    p.setState("carry", "", true);
                                cured = true;
                            } else {
                                const nextBp = consumeOneProtectionFromStack(bp);
                                if (nextBp) {
                                    setBackpack(p, nextBp);
                                    cured = true;
                                }
                            }
                            if (cured) p.setState("poisoned", false, true);
                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // advanced cure (extend incubation)
                        if (
                            kind === "adv" ||
                            (it && isType(it.type, "cure_advanced")) ||
                            isType(idStr, "cure_advanced")
                        ) {
                            const ADD_MS = 4 * 60 * 1000;
                            const bpNow = getBackpack(p);
                            let consumed = false;

                            if (it && it.holder === p.id && isType(it.type, "cure_advanced")) {
                                setItems(
                                    (prev) =>
                                        prev.map((j) =>
                                            j.id === it.id
                                                ? { ...j, holder: "_used_", y: -999, hidden: true }
                                                : j
                                        ),
                                    true
                                );
                                setBackpack(p, bpNow.filter((b) => b.id !== it.id));
                                if (String(p.getState("carry") || "") === it.id)
                                    p.setState("carry", "", true);
                                consumed = true;
                            } else if (idStr) {
                                const row = bpNow.find(
                                    (b) => b.id === idStr && isType(b.type, "cure_advanced")
                                );
                                if (row) {
                                    const ent = (itemsRef.current || []).find((x) => x.id === idStr);
                                    if (ent) {
                                        setItems(
                                            (prev) =>
                                                prev.map((j) =>
                                                    j.id === ent.id
                                                        ? { ...j, holder: "_used_", y: -999, hidden: true }
                                                        : j
                                                ),
                                            true
                                        );
                                        if (String(p.getState("carry") || "") === ent.id)
                                            p.setState("carry", "", true);
                                    }
                                    setBackpack(p, bpNow.filter((b) => b.id !== idStr));
                                    consumed = true;
                                }
                            } else {
                                const idx = bpNow.findIndex(
                                    (b) => !b?.id && isType(b?.type, "cure_advanced")
                                );
                                if (idx !== -1) {
                                    const row = bpNow[idx];
                                    const qty = Number(row?.qty || 1);
                                    const next = [...bpNow];
                                    if (qty > 1) next[idx] = { ...row, qty: qty - 1 };
                                    else next.splice(idx, 1);
                                    setBackpack(p, next);
                                    consumed = true;
                                }
                            }

                            if (consumed) {
                                const now = Date.now();
                                const infected = !!p.getState("infected");
                                const until = Number(p.getState("infectionRevealUntil") || 0);
                                if (!infected && until > now) {
                                    const extended = until + ADD_MS;
                                    p.setState("infectionRevealUntil", extended, true);
                                    p.setState("cd_bite_until", extended, true);
                                }
                            }

                            processed.current.set(p.id, reqId);
                            continue;
                        }

                        // device use fallback
                        if (it && it.holder === p.id) {
                            const dev = DEVICES.find((d) => d.id === kind);
                            if (dev) {
                                const dx = px - dev.x,
                                    dz = pz - dev.z;
                                const r = Number(dev.radius || DEVICE_RADIUS);
                                if (dx * dx + dz * dz <= r * r) {
                                    const eff = USE_EFFECTS?.[it.type]?.[dev.type];
                                    if (eff) {
                                        setItems(
                                            (prev) =>
                                                prev.map((j) =>
                                                    j.id === it.id
                                                        ? { ...j, holder: "_used_", y: -999, hidden: true }
                                                        : j
                                                ),
                                            true
                                        );
                                        setBackpack(
                                            p,
                                            getBackpack(p).filter((b) => b.id !== it.id)
                                        );
                                        if (String(p.getState("carry") || "") === it.id)
                                            p.setState("carry", "", true);
                                    }
                                }
                            }
                        }
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    // fallback
                    processed.current.set(p.id, reqId);
                }
            } catch (err) {
                console.error("[HOST] Items loop crashed:", err);
            } finally {
                timerId = setTimeout(loop, 50);
            }
        };

        loop();
        return () => {
            cancelled = true;
            if (timerId) clearTimeout(timerId);
        };
    }, [host, setItems]);

    return null;
}
