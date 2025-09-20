// src/systems/PlayersHostInit.jsx
import { useEffect } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import { roomCenter, ROOM_KEYS } from "../map/deckA";
import { hostAppendEvent } from "../network/playroom";
import { setTeamFromQuery } from "../data/teamSpawns"; // if you added this helper

// Map team names -> room keys in your deckA
const TEAM_ROOM_KEY = {
    alpha: "TeamA",
    beta: "TeamB",
    gamma: "TeamC",
    delta: "TeamD",
};

const norm = (v) => String(v || "").toLowerCase();

export default function PlayersHostInit() {
    const host = isHost();
    const players = usePlayersList(true);

    useEffect(() => {
        if (!host) return;

        // Let the host grab ?team= for their own player once
        try { setTeamFromQuery?.(); } catch { }

        for (const p of players) {
            // Only set once per player
            if (p.getState?.("spawned")) continue;

            // Team from several places; default to alpha
            const team =
                p.getState?.("team") ??
                p.state?.team ??
                p.team ??
                "alpha";

            const rk = TEAM_ROOM_KEY[norm(team)];
            const pt = rk && ROOM_KEYS.includes(rk) ? roomCenter(rk) : null;
            const spawn = pt ?? { x: 0, y: 0, z: 0 };

            // Commit authoritative spawn — set only the fields we need
            p.setState?.("x", spawn.x, true);
            p.setState?.("y", spawn.y, true);
            p.setState?.("z", spawn.z, true);
            p.setState?.("spawned", true, true);

            const name = p.getProfile?.()?.name || "Player";
            hostAppendEvent?.((...args) => { }, `Spawned ${name} at team ${team}.`);
        }
    }, [host, players]);

    return null;
}
