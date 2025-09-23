// src/game/timePhaseEffects.js
import { useEffect, useRef } from "react";
import { isHost, usePlayersList } from "playroomkit";
import { hostAppendEvent } from "../network/playroom";
import { useGameClock } from "../systems/dayNightClock";

// >>> pull real room info from the map <<<
import {
    ROOM_BY_KEY,
    aabbForRoom,
    roomCenter,
    randomPointInRoom,
    MEETING_ROOM_AABB as MAP_MEETING_AABB,
} from "../map/deckA";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

// Prefer the authored meeting room AABB; otherwise keep a safe fallback.
const FALLBACK_MEETING_AABB = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
const MEETING_AABB =
    MAP_MEETING_AABB ||
    aabbForRoom(ROOM_BY_KEY["meeting_room"]) ||
    FALLBACK_MEETING_AABB;

const insideAABB = (pos, aabb) =>
    pos &&
    typeof pos.x === "number" &&
    typeof pos.z === "number" &&
    pos.x >= aabb.minX &&
    pos.x <= aabb.maxX &&
    pos.z >= aabb.minZ &&
    pos.z <= aabb.maxZ;

const insideMeetingRoom = (pos) => insideAABB(pos, MEETING_AABB);

// Read a player's position from either pos:{x,y,z} or x/y/z.
const readPos = (p) => {
    try {
        const pos = p.getState?.("pos");
        if (pos && typeof pos.x === "number" && typeof pos.z === "number") return pos;
        const x = p.getState?.("x");
        const y = p.getState?.("y");
        const z = p.getState?.("z");
        if (typeof x === "number" && typeof z === "number") return { x, y: y ?? 0, z };
    } catch { }
    return null;
};

const shortId = (pid) => String(pid || "").slice(0, 4);

// Best destination for "lockdown": random point inside, then center, then AABB center, then fallback.
const FALLBACK_LOCKDOWN_POS = { x: -6, y: 1.2, z: -4 };
function getLockdownDestination() {
    // 1) try a random safe point inside the room (avoids stacking players)
    const rnd = randomPointInRoom("lockdown", 0.8);
    if (rnd) return rnd;

    // 2) try the room center
    const ctr = roomCenter("lockdown");
    if (ctr) return { x: ctr.x, y: (ctr.y ?? 1.2), z: ctr.z };

    // 3) try AABB center
    const r = ROOM_BY_KEY["lockdown"];
    if (r) {
        const aabb = aabbForRoom(r);
        if (aabb) return { x: (aabb.minX + aabb.maxX) / 2, y: 1.2, z: (aabb.minZ + aabb.maxZ) / 2 };
    }

    // 4) fallback constant
    return FALLBACK_LOCKDOWN_POS;
}

/* -------------------------------------------------------------------------- */
/* Host: mirror clock 'day'/'night' label into networked phase                */
/* -------------------------------------------------------------------------- */

export function useSyncPhaseToClock({ ready, matchPhase, setPhase }) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'
    const lastSentRef = useRef(null);

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "meeting" || matchPhase === "end") return;

        const label = clockPhase();
        if (matchPhase === label || lastSentRef.current === label) return;

        lastSentRef.current = label;
        setPhase(label, true);
    }, [ready, matchPhase, setPhase, clockPhase]);
}

/* -------------------------------------------------------------------------- */
/* Voting window: 18:00 → 21:00 (open, countdown, resolve on exit)            */
/* -------------------------------------------------------------------------- */

export function useVotingWindowFromClock({
    ready,
    matchPhase,
    setPhase,
    setTimer,
    setEvents,
}) {
    const clockPhase = useGameClock((s) => s.phase);   // () => 'day' | 'night'
    const format = useGameClock((s) => s.format);  // () => 'HH:MM' or 'HH:MM:SS'

    // Parse HH:MM[:SS] → seconds since midnight
    const getSec = () => {
        try {
            const txt = String(format() || "");
            const parts = txt.split(":").map((n) => parseInt(n, 10) || 0);
            const [h = 0, m = 0, s = 0] = parts;
            return h * 3600 + m * 60 + s;
        } catch {
            return 0;
        }
    };

    // Live players for tally
    const players = usePlayersList(true);
    const playersRef = useRef([]);
    useEffect(() => { playersRef.current = players; }, [players]);

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "end") return;

        const start = 18 * 3600; // 18:00
        const end = 21 * 3600; // 21:00
        const inWindow = (sec) => sec >= start && sec < end;

        let raf;
        let wasIn = inWindow(getSec());

        const tick = () => {
            const cur = getSec();
            const nowIn = inWindow(cur);

            // Enter window → open meeting
            if (!wasIn && nowIn) {
                setPhase("meeting", true);
                hostAppendEvent(setEvents, "Voting opened (18:00–21:00).");
            }

            // While in window → live countdown to 21:00
            if (nowIn) {
                setTimer(Math.max(0, Math.floor(end - cur)), true);
            }

            // Exit window → resolve; clear; return to clock phase
            if (wasIn && !nowIn) {
                resolveVotesAndLockdown({
                    players: playersRef.current || [],
                    setEvents,
                    setPhase,
                    setTimer,
                    clockPhase,
                });
            }

            wasIn = nowIn;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ready, matchPhase, setPhase, setTimer, setEvents, clockPhase, format]);
}

/* -------------------------------------------------------------------------- */
/* Resolution (21:00)                                                         */
/* -------------------------------------------------------------------------- */

function resolveVotesAndLockdown({ players, setEvents, setPhase, setTimer, clockPhase }) {
    // Alive players at the moment of resolution
    const alive = players.filter((p) => {
        try { return p.getState?.("dead") !== true; } catch { return true; }
    });

    // Tally valid votes: alive voters, inside meeting room, non-empty, non-"skip"
    const votesByTarget = new Map(); // targetId -> count
    let totalValid = 0;
    for (const voter of alive) {
        let v = "";
        try { v = String(voter.getState?.("vote") || ""); } catch { v = ""; }
        if (!v || v === "skip") continue;

        const pos = readPos(voter);
        if (!insideMeetingRoom(pos)) continue; // only count votes cast from inside the room

        votesByTarget.set(v, (votesByTarget.get(v) || 0) + 1);
        totalValid++;
    }

    // Build per-player summary (sorted desc)
    const nameOf = (p) => p?.getState?.("name") || p?.profile?.name || p?.name || shortId(p?.id);
    const per = alive
        .map((p) => ({ id: p.id, name: nameOf(p), votes: votesByTarget.get(p.id) || 0 }))
        .sort((a, b) => b.votes - a.votes);

    // Emit "Votes:" summary for TopBar
    const summary = per.map((o) => `${o.name}: ${o.votes}`).join(" | ");
    hostAppendEvent(setEvents, `Votes: ${summary || "(none)"}`);

    // Unique top + ≥50% of valid (non-skip) votes
    let topId = "", topCount = 0, tie = false;
    for (const [id, n] of votesByTarget.entries()) {
        if (n > topCount) { topCount = n; topId = id; tie = false; }
        else if (n === topCount) { tie = true; }
    }
    const hasMajority = totalValid > 0 && (topCount / totalValid) >= 0.5;
    const canSummon = topId && !tie && hasMajority && alive.some((p) => p.id === topId);

    if (canSummon) {
        const target = alive.find((p) => p.id === topId);
        const tname = nameOf(target);
        const dst = getLockdownDestination();

        try {
            // Write both pos and x/y/z so all movement systems pick it up
            // Ask the target client to summon itself (LocalController will execute)
            target?.setState?.(
                "summon_to",
                {
                    x: dst.x,
                    y: (dst.y ?? 1.2),
                    z: dst.z,
                    room: "lockdown",
                    lock: true,                  // set in_lockdown + locked client-side
                    reason: "vote_majority",
                    at: Date.now(),
                },
                true
            );

        } catch { }

        hostAppendEvent(
            setEvents,
            `Lockdown: Summoned ${tname} (majority ${topCount}/${totalValid}).`
        );
    } else {
        hostAppendEvent(
            setEvents,
            totalValid === 0
                ? "Lockdown: No summon — no valid votes."
                : tie
                    ? "Lockdown: No summon — tie for top count."
                    : `Lockdown: No summon — top has only ${topCount}/${totalValid}.`
        );
    }

    // Clear all votes for next day
    for (const p of players) {
        try { p.setState?.("vote", null, true); } catch { }
    }

    // Return to the clock phase and stop the timer
    const label = clockPhase();
    setPhase(label, true);
    setTimer(0, true);
}

/* -------------------------------------------------------------------------- */
/* Back-compat exports                                                        */
/* -------------------------------------------------------------------------- */

export function useMeetingFromClock(args) { return useVotingWindowFromClock(args); }
export function useMeetingCountdown() { /* no-op: handled in window hook */ }
