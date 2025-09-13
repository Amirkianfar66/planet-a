// src/game/timePhaseEffects.js
import { useEffect, useRef } from "react";
import { isHost, usePlayersList } from "playroomkit";
import { hostAppendEvent } from "../network/playroom";
import { useGameClock } from "../systems/dayNightClock";

/**
 * Meeting room bounds shared with the UI gate (adjust to your actual room).
 */
const MEETING_ROOM_AABB = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
const insideMeetingRoom = (pos) =>
    pos && typeof pos.x === "number" && typeof pos.z === "number" &&
    pos.x >= MEETING_ROOM_AABB.minX && pos.x <= MEETING_ROOM_AABB.maxX &&
    pos.z >= MEETING_ROOM_AABB.minZ && pos.z <= MEETING_ROOM_AABB.maxZ;

// Best-effort position reader (works with either {pos:{x,y,z}} or x/y/z states)
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

/**
 * Host-only: mirror the clock's day/night label into the networked `phase`,
 * but never override lobby/meeting/end. Edge-triggered (no spamming).
 */
export function useSyncPhaseToClock({ ready, matchPhase, setPhase }) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'
    const lastSentRef = useRef(null);

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "meeting" || matchPhase === "end") return;

        const label = clockPhase(); // 'day' | 'night'
        if (matchPhase === label || lastSentRef.current === label) return;

        lastSentRef.current = label;
        setPhase(label, true);
    }, [ready, matchPhase, setPhase, clockPhase]);
}

/**
 * 18:00–21:00 voting window + resolution at 21:00.
 * Works even if the clock store DOESN'T provide nowGameSec().
 * We read the formatted time (HH:MM or HH:MM:SS) and parse seconds.
 */
export function useVotingWindowFromClock({
    ready,
    matchPhase,
    setPhase,
    setTimer,
    setEvents,
}) {
    const clockPhase = useGameClock((s) => s.phase);   // () => 'day' | 'night'
    const format = useGameClock((s) => s.format);      // () => 'HH:MM' (maybe ':SS')

    // Parse HH:MM[:SS] -> seconds since midnight
    const getSec = () => {
        try {
            const txt = String(format() || "");
            const parts = txt.split(":").map((n) => parseInt(n, 10) || 0);
            const [h = 0, m = 0, s = 0] = parts;
            return (h * 3600) + (m * 60) + s;
        } catch {
            return 0;
        }
    };

    // Live list of players for tally
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

        const short = (pid) => String(pid || "").slice(0, 4);

        const tick = () => {
            const cur = getSec();
            const nowIn = inWindow(cur);

            // Enter voting window
            if (!wasIn && nowIn) {
                setPhase("meeting", true);
                hostAppendEvent(setEvents, "Voting opened (18:00–21:00).");
            }

            // Live countdown (game-seconds) to 21:00
            if (nowIn) {
                setTimer(Math.max(0, Math.floor(end - cur)), true);
            }

            // Exit window: resolve votes and return to clock phase
            if (wasIn && !nowIn) {
                // ---------- RESOLUTION @ 21:00 ----------
                const list = playersRef.current || [];

                // Alive players
                const alive = list.filter((p) => {
                    try { return p.getState?.("dead") !== true; } catch { return true; }
                });

                // Collect votes from ALIVE voters who are INSIDE the meeting room at 21:00
                const votesByTarget = new Map();
                for (const voter of alive) {
                    let targetId = null;
                    try { targetId = voter.getState?.("vote"); } catch { }
                    if (!targetId) continue;

                    const pos = readPos(voter);
                    if (!insideMeetingRoom(pos)) continue; // 🚫 not in room → vote ignored

                    votesByTarget.set(targetId, (votesByTarget.get(targetId) || 0) + 1);
                }

                const threshold = Math.ceil(0.5 * alive.length); // ≥50% of alive players

                // Per-player vote counts (sorted, for readability)
                const nameOf = (p) => p?.getState?.("name") || p?.profile?.name || p?.name || short(p?.id);
                const per = alive.map((p) => ({
                    id: p.id,
                    name: nameOf(p),
                    votes: votesByTarget.get(p.id) || 0,
                })).sort((a, b) => b.votes - a.votes);

                // ALWAYS emit a Votes: line (TopBar watches this)
                const summary = per.map((o) => `${o.name}: ${o.votes}`).join(" | ");
                hostAppendEvent(setEvents, `Votes: ${summary || "(none)"}`);

                // Lockdown resolution
                const lockedNow = [];
                for (const p of alive) {
                    const cnt = votesByTarget.get(p.id) || 0;
                    if (cnt >= threshold) {
                        try {
                            p.setState?.("locked", true, true);
                            lockedNow.push({ id: p.id, votes: cnt });
                        } catch { }
                    }
                }

                // Clear all votes for next day
                for (const p of list) {
                    try { p.setState?.("vote", null, true); } catch { }
                }

                // Announce
                if (lockedNow.length === 0) {
                    hostAppendEvent(setEvents, `Voting closed. No one reached ${threshold}/${alive.length} votes.`);
                } else {
                    const msg = lockedNow.map((o) => `${short(o.id)} (${o.votes}/${alive.length})`).join(", ");
                    hostAppendEvent(setEvents, `Voting closed. Lockdown: ${msg}.`);
                }

                // Return to clock label
                const label = clockPhase();
                setPhase(label, true);
                setTimer(0, true);
            }

            wasIn = nowIn;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ready, matchPhase, setPhase, setTimer, setEvents, clockPhase, format]);
}

/* Back-compat exports */
export function useMeetingFromClock(args) { return useVotingWindowFromClock(args); }
export function useMeetingCountdown() { /* no-op: handled in window hook */ }
