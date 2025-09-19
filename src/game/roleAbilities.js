// src/game/roleAbilities.js
// Central definition of role abilities (+ defaults).
// Each ability may define: key, label, cooldownMs, range, damage, etc.

import { myPlayer } from "playroomkit";

export const ROLES = ['Engineer', 'Research', 'StationDirector', 'Officer', 'Guard', 'FoodSupplier'];

// ---- Base role abilities ----
export const ROLE_ABILITIES = {
    Guard: [
        {
            id: 'shoot',
            key: 'KeyF',                  // keyboard code
            label: 'Shoot',
            cooldownMs: 7000,
            range: 10,                    // meters
            damage: 100,                  // instant down for now
            friendlyFire: false,
            icon: '🔫',
        }
    ],
    Engineer: [
        { id: 'quick_repair', key: 'KeyF', label: 'Quick Repair', cooldownMs: 4000, icon: '🛠️' },
    ],
    // Research no longer does the blood test (moved to Officer)
    Research: [
        { id: 'pet_order', key: 'KeyF', label: 'Pet Command', cooldownMs: 400, icon: '🤖' },
    ],
    StationDirector: [
        {
            id: 'arrest',
            key: 'KeyF',
            label: 'Arrest (Lockdown)',
            cooldownMs: 0,                // server can enforce; keep 0 client-side
            icon: '🚔',
        },
        {
            id: 'call_meeting',
            key: 'KeyH',                  // avoid conflict with arrest
            label: 'Call Meeting',
            cooldownMs: 20000,
            icon: '📣',
        },
    ],
    Officer: [
        {
            id: 'scan',
            key: 'KeyF',
            label: 'Blood Test (Scan)',
            cooldownMs: 8000,
            range: 2.0,                   // short, face-to-face
            icon: '🧪',
        },
    ],
    FoodSupplier: [
        { id: 'drop_food', key: 'KeyF', label: 'Drop Food', cooldownMs: 6000, icon: '🍱' },
    ],
};

// ---- Infected overlay ability (added on top of any base role) ----
const INFECTED_ABILITY = {
    id: 'bite',
    key: 'KeyG',                 // keep G by default to leave F for role powers
    label: 'Bite (Infect)',
    cooldownMs: 240000,
    range: 1.6,                  // close range
    damage: 0,                   // infection only (no HP damage here)
    icon: '🧛',
};

// Optional: Infected cosmetic toggle
const INFECTED_DISGUISE = {
    id: 'disguise',
    key: 'KeyH',
    label: 'Toggle Disguise',
    cooldownMs: 500,             // tiny debounce so it feels snappy
    icon: '🎭',
};

// Keys we’ll use to resolve conflicts when Infected overlays base role
const KEY_POOL = ['KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];

/**
 * Ensure unique hotkeys. Keeps the earliest ability's desired key if possible,
 * and shifts later conflicting abilities to the next available key in KEY_POOL.
 * We also can prioritize "bite" if requested.
 */
function assignUniqueKeys(abilities, prioritizeBite = true) {
    const used = new Set();
    const byId = Object.fromEntries(abilities.map(a => [a.id, a]));

    // If prioritizeBite, lock Bite first.
    if (prioritizeBite && byId['bite']) {
        const biteKey = byId['bite'].key || 'KeyG';
        byId['bite'].key = biteKey;
        used.add(biteKey);
    }

    // Pass 1: honor requested keys if free (except conflicts with a locked Bite)
    for (const a of abilities) {
        if (a.id === 'bite' && prioritizeBite) continue;
        if (a.key && !used.has(a.key)) {
            used.add(a.key);
        } else {
            a.key = null; // mark for reassignment
        }
    }

    // Pass 2: assign free keys from pool
    for (const a of abilities) {
        if (a.key) continue;
        const next = KEY_POOL.find(k => !used.has(k));
        a.key = next || a.key || 'KeyH';
        used.add(a.key);
    }
    return abilities;
}

/**
 * PUBLIC API (back-compat): get abilities for a *role*, but if the local player
 * is infected, we overlay the Infected Bite (and optional Disguise) on top and fix key conflicts.
 */
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

/**
 * Optional: explicit helper if you ever need to compute abilities
 * for an arbitrary player (not just local).
 */
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
