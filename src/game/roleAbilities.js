// src/game/roleAbilities.js
// Central definition of role abilities (+ defaults). Each ability may define:
// key, label, cooldownMs, range, damage, etc.

import { myPlayer } from "playroomkit";
import COOLDOWN from "../data/cooldowns";

export const ROLES = [
    "Engineer",
    "Research",
    "StationDirector",
    "Officer",
    "Guard",
    "FoodSupplier",
];

// ---- Base role abilities ----
export const ROLE_ABILITIES = {
    Guard: [
        {
            id: "shoot",
            key: "KeyF",
            label: "Shoot",
            cooldownMs: COOLDOWN.ABILITIES.GUARD_SHOOT.CLIENT_MS,
            range: COOLDOWN.ABILITIES.GUARD_SHOOT.RANGE_M ?? 10, // optional central range
            damage: 100,
            friendlyFire: false,
            icon: "🔫",
        },
    ],
    Engineer: [
        {
            id: "quick_repair",
            key: "KeyF",
            label: "Quick Repair",
            cooldownMs: COOLDOWN.ABILITIES.ENGINEER_QUICK_REPAIR.CLIENT_MS,
            icon: "🛠️",
        },
    ],
    Research: [
        {
            id: "pet_order",
            key: "KeyF",
            label: "Pet Command",
            cooldownMs: COOLDOWN.ABILITIES.RESEARCH_PET_ORDER.CLIENT_MS,
            icon: "🤖",
        },
    ],
    StationDirector: [
        {
            id: "arrest",
            key: "KeyF",
            label: "Arrest (Lockdown)",
            cooldownMs: COOLDOWN.ABILITIES.STATIONDIRECTOR_ARREST.CLIENT_MS,
            icon: "🚔",
        },
    ],
    Officer: [
        {
            id: "scan",
            key: "KeyF",
            label: "Blood Test (Scan)",
            cooldownMs: COOLDOWN.ABILITIES.OFFICER_SCAN.CLIENT_MS,
            range: COOLDOWN.ABILITIES.OFFICER_SCAN.RANGE_M,
            icon: "🧪",
        },
    ],
    FoodSupplier: [
        {
            id: "drop_food",
            key: "KeyF",
            label: "Drop Food",
            cooldownMs: COOLDOWN.ABILITIES.FOODSUPPLIER_DROP_FOOD.CLIENT_MS,
            icon: "🍱",
        },
    ],
};

// ---- Infected overlay ability (added on top of any base role) ----
const INFECTED_ABILITY = {
    id: "bite",
    key: "KeyG", // keep G so F stays for role powers
    label: "Bite (Infect)",
    cooldownMs: COOLDOWN.ABILITIES.INFECTED_BITE.CLIENT_MS,
    range: COOLDOWN.ABILITIES.INFECTED_BITE.RANGE_M ?? 1.6, // optional central range
    damage: 0,
    icon: "🧛",
};

// Optional: Infected cosmetic toggle
const INFECTED_DISGUISE = {
    id: "disguise",
    key: "KeyH",
    label: "Toggle Disguise",
    cooldownMs: COOLDOWN.ABILITIES.INFECTED_DISGUISE.CLIENT_MS,
    icon: "🎭",
};

// Keys we’ll use to resolve conflicts when Infected overlays base role
const KEY_POOL = ["KeyF", "KeyG", "KeyH", "KeyJ", "KeyK"];

function assignUniqueKeys(abilities, prioritizeBite = true) {
    const used = new Set();
    const byId = Object.fromEntries(abilities.map((a) => [a.id, a]));

    if (prioritizeBite && byId["bite"]) {
        const biteKey = byId["bite"].key || "KeyG";
        byId["bite"].key = biteKey;
        used.add(biteKey);
    }

    // Pass 1: honor requested keys if free (except locked Bite)
    for (const a of abilities) {
        if (a.id === "bite" && prioritizeBite) continue;
        if (a.key && !used.has(a.key)) {
            used.add(a.key);
        } else {
            a.key = null;
        }
    }

    // Pass 2: assign free keys from pool
    for (const a of abilities) {
        if (a.key) continue;
        const next = KEY_POOL.find((k) => !used.has(k));
        a.key = next || a.key || "KeyH";
        used.add(a.key);
    }
    return abilities;
}

export function getAbilitiesForRole(role) {
    const base = ROLE_ABILITIES[role] || [];
    const abilities = [...base];

    const me = myPlayer?.();
    const infected = !!me?.getState?.("infected");

    if (infected) {
        abilities.unshift({ ...INFECTED_ABILITY });
        abilities.unshift({ ...INFECTED_DISGUISE });
        assignUniqueKeys(abilities, /* prioritizeBite */ false);
    }

    return abilities;
}

export function getAbilitiesForPlayer(baseRole, player) {
    const base = ROLE_ABILITIES[baseRole] || [];
    const abilities = [...base];
    const infected = !!player?.getState?.("infected");
    if (infected) {
        abilities.unshift({ ...INFECTED_ABILITY });
        // You can also add disguise here if you want it network-wide:
        // abilities.unshift({ ...INFECTED_DISGUISE });
        assignUniqueKeys(abilities, true);
    }
    return abilities;
}
