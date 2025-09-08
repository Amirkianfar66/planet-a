// src/game/timePhaseEffects.js
import { useEffect, useRef } from "react";
import { isHost } from "playroomkit";
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
 * Host-only: start a meeting when the clock crosses 18:00.
 * If your dayNightClock store doesn't expose nowGameSec(), this will no-op safely.
 */
export function useMeetingFromClock({
    ready,
    matchPhase, setPhase,
    timer, setTimer,
    meetingLength,
    setEvents,
}) {
    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "end" || matchPhase === "meeting") return;

        // Optional API: support if your store provides a nowGameSec() getter
        const store = typeof useGameClock.getState === "function" ? useGameClock.getState() : null;
        const getSec = store && typeof store.nowGameSec === "function" ? store.nowGameSec : null;
        if (!getSec) return; // no-op if not available

        const sixPM = 18 * 3600;
        const crossed = (from, to, target) => {
            if (to === from) return false;
            return (to > from) ? (target > from && target <= to)
                : (target > from || target <= to); // wrap at midnight
        };

        let raf;
        let prev = getSec();

        const tick = () => {
            const cur = getSec();
            if (crossed(prev, cur, sixPM)) {
                setPhase("meeting", true);
                setTimer(meetingLength, true);
                hostAppendEvent(setEvents, "Meeting started.");
            }
            prev = cur;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ready, matchPhase, setPhase, setTimer, meetingLength, setEvents]);
}

/**
 * Host-only: during meeting, tick the timer; when it hits 0,
 * exit meeting back to the clock-provided label.
 */
export function useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents }) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'

    // 1s countdown while in meeting
    useEffect(() => {
        if (!ready || !isHost() || matchPhase !== "meeting") return;
        const id = setInterval(() => setTimer((t) => Math.max(0, Number(t) - 1), true), 1000);
        return () => clearInterval(id);
    }, [ready, matchPhase, setTimer]);

    // When timer finishes, return to clock label
    useEffect(() => {
        if (!ready || !isHost() || matchPhase !== "meeting") return;
        if (Number(timer) > 0) return;

        const label = clockPhase(); // 'day' | 'night'
        setPhase(label, true);
        hostAppendEvent(setEvents, "Meeting ended.");
    }, [ready, matchPhase, timer, setPhase, setEvents, clockPhase]);
}
