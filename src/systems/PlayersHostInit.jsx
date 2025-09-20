import { useEffect } from "react";
import { isHost, usePlayersList } from "playroomkit";
import { roomCenter, ROOM_KEYS } from "../map/deckA";

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
    const players = usePlayersList(true); // you already use 'true' in App

    useEffect(() => {
        if (!host) return;

        players.forEach((p) => {
            // Only set once per player
            if (p.getState?.("spawned")) return;

            // Try multiple places for team; fall back to alpha
            const team =
                p.getState?.("team") ??
                p.state?.team ??
                p.team ??
                "alpha";

            const rk = TEAM_ROOM_KEY[norm(team)];
            const pt = rk && ROOM_KEYS.includes(rk) ? roomCenter(rk) : null;

            const spawn = pt ?? { x: 0, y: 0, z: 0 };
            // Commit authoritative spawn
            p.setState?.({ ...p.state, x: spawn.x, y: spawn.y, z: spawn.z, spawned: true }, true);
        });
    }, [host, players]);

    return null;
}
