// src/game/timePhaseEffects.js
import { useEffect, useRef } from "react";
import { isHost, usePlayersList } from "playroomkit";
import { hostAppendEvent } from "../network/playroom";
import { useGameClock } from "../systems/dayNightClock";

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
 * - While inside: sets `timer` to remaining game-seconds until 21:00
 * - At 21:00: tallies votes from ALIVE players only
 *   Any target with votes >= ceil(0.5 * aliveCount) becomes `locked`
 *   (multiple players can be locked if they each cross the threshold)
 */
export function useVotingWindowFromClock({
    ready,
    matchPhase,
    setPhase,
    setTimer,
    setEvents,
}) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'
    const store = typeof useGameClock.getState === "function" ? useGameClock.getState() : null;
    const getSec = store && typeof store.nowGameSec === "function" ? store.nowGameSec : null;

    // Keep a live list of players for tally
    const players = usePlayersList(true);
    const playersRef = useRef([]);
    useEffect(() => { playersRef.current = players; }, [players]);

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "end") return;
        if (!getSec) return;

        const start = 18 * 3600; // 18:00
        const end = 21 * 3600; // 21:00
        const inWindow = (sec) => sec >= start && sec < end;

        let raf;
        let wasIn = inWindow(getSec());

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

                // Alive filter: prefer explicit 'dead' state if available; else assume alive.
                const alive = list.filter((p) => {
                    try {
                        const d = p.getState?.("dead");
                        return d !== true;
                    } catch { return true; }
                });

                // Collect votes from ALIVE voters only
                const votesByTarget = new Map();
                for (const voter of alive) {
                    let targetId = null;
                    try { targetId = voter.getState?.("vote"); } catch { }
                    if (!targetId) continue;
                    votesByTarget.set(targetId, (votesByTarget.get(targetId) || 0) + 1);
                }

                const threshold = Math.ceil(0.5 * alive.length); // ≥50% of alive players
                const lockedNow = [];

                // Any candidate with votes >= threshold gets locked
                for (const p of alive) {
                    const cnt = votesByTarget.get(p.id) || 0;
                    if (cnt >= threshold) {
                        try {
                            p.setState?.("locked", true, true);   // flag as locked
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
                    const msg = lockedNow
                        .map((o) => `${short(o.id)} (${o.votes}/${alive.length})`)
                        .join(", ");
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

        const short = (pid) => String(pid).slice(0, 4);
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ready, matchPhase, setPhase, setTimer, setEvents, clockPhase, getSec]);
}

/* Back-compat: if your App still imports these, they now piggyback on the window. */
export function useMeetingFromClock(args) { return useVotingWindowFromClock(args); }
export function useMeetingCountdown() { /* no-op: handled in window hook */ }
