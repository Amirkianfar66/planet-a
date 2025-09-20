// src/data/teamSpawns.js
import { ROOM_KEYS, roomCenter } from "../map/deckA";

const norm = (v) => String(v || "").toLowerCase();
const compact = (s) => norm(s).replace(/[^a-z0-9]/g, ""); // drop spaces, _ , - , etc.

// Map team name -> intended room label (human-facing)
export const TEAM_ROOM_KEY = {
    alpha: "TeamA",
    beta: "TeamB",
    gamma: "TeamC",
    delta: "TeamD",
};

// Try to find an actual room key in ROOM_KEYS that matches a given label,
// allowing case differences and separators (space/_/-) differences.
function resolveRoomKey(label) {
    if (!label) return null;
    const exact = ROOM_KEYS.find(k => k === label);
    if (exact) return exact;

    const lower = ROOM_KEYS.find(k => norm(k) === norm(label));
    if (lower) return lower;

    const target = compact(label);
    const compactHit = ROOM_KEYS.find(k => compact(k) === target);
    if (compactHit) return compactHit;

    // As a last resort, prefix match like "teama" vs "team-a (east)"
    const starts = ROOM_KEYS.find(k => compact(k).startsWith(target));
    return starts || null;
}

/** Get a spawn point (room center) for a team, robust to key naming differences. */
export function spawnPointForTeam(teamName) {
    const intended = TEAM_ROOM_KEY[norm(teamName)] || "TeamA";
    const key = resolveRoomKey(intended);

    if (key) {
        const c = roomCenter(key);
        if (c) return c;
    }

    // DEV warning so you catch it early
    const isDev = (typeof import.meta !== "undefined") ? !!import.meta.env?.DEV : (process.env.NODE_ENV !== "production");
    if (isDev) {
        // eslint-disable-next-line no-console
        console.warn("[teamSpawns] Could not resolve room for team",
            { team: teamName, intended, ROOM_KEYS });
    }

    // fallback: origin
    return { x: 0, y: 0, z: 0 };
}
