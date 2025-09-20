// src/data/teamSpawns.js
import { ROOM_KEYS, roomCenter } from "../map/deckA";

const norm = (v) => String(v || "").toLowerCase();

/** Map team names -> deckA room keys */
export const TEAM_ROOM_KEY = {
    alpha: "TeamA",
    beta: "TeamB",
    gamma: "TeamC",
    delta: "TeamD",
};

/** Get a spawn point (room center) for a team. */
export function spawnPointForTeam(teamName) {
    const k = TEAM_ROOM_KEY[norm(teamName)];
    if (k && ROOM_KEYS.includes(k)) {
        const c = roomCenter(k);
        if (c) return c;
    }
    // fallback: origin
    return { x: 0, y: 0, z: 0 };
}
