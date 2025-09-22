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
            key: 'KeyF',
            label: 'Shoot',
            cooldownMs: 7000,
            range: 10,
            damage: 100,
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
        // Removed: call_meeting (no key, no ability)
        {
            id: 'arrest',
            key: 'KeyF',
            label: 'Arrest (Lockdown)',
            cooldownMs: 0,  // server can enforce; keep 0 client-side
            icon: '🚔',
        },
    ],
    Officer: [
        {
            id: 'scan',
            key: 'KeyF',
            label: 'Blood Test (Scan)',
            cooldownMs: 8000,
            range: 2.0,
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
    key: 'KeyG', // keep G so F stays for role powers
    label: 'Bite (Infect)',
    cooldownMs: 240000,
    range: 1.6,
    damage: 0,
    icon: '🧛',
};

// Optional: Infected cosmetic toggle
const INFECTED_DISGUISE = {
    id: 'disguise',
    key: 'KeyH',
    label: 'Toggle Disguise',
    cooldownMs: 500,
    icon: '🎭',
};

// Keys we’ll use to resolve conflicts when Infected overlays base role
const KEY_POOL = ['KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];

function assignUniqueKeys(abilities, prioritizeBite = true) {
    const used = new Set();
    const byId = Object.fromEntries(abilities.map(a => [a.id, a]));

    if (prioritizeBite && byId['bite']) {
        const biteKey = byId['bite'].key || 'KeyG';
        byId['bite'].key = biteKey;
        used.add(biteKey);
    }

    // Pass 1: honor requested keys if free (except locked Bite)
    for (const a of abilities) {
        if (a.id === 'bite' && prioritizeBite) continue;
        if (a.key && !used.has(a.key)) {
            used.add(a.key);
        } else {
            a.key = null;
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
