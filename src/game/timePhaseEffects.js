// src/game/timePhaseEffects.js
import { useEffect, useRef } from "react";
import { hostAppendEvent } from "../network/playroom";
import { isHost } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";

/** Mirror the clock's day/night into the networked `phase`,
 *  but never override lobby/meeting/end. (Host only) */
export function useSyncPhaseToClock({ ready, matchPhase, setPhase }) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "meeting" || matchPhase === "end") return;

        const now = clockPhase();
        setPhase((prev) => (prev === now ? prev : now), true);
    }, [ready, matchPhase, setPhase, clockPhase]);
}

/** Start a meeting when the clock crosses 18:00 (Host only). */
export function useMeetingFromClock({
    ready,
    matchPhase, setPhase,
    timer, setTimer,
    meetingLength,
    setEvents,
}) {
    const nowGameSec = useGameClock.getState().nowGameSec;
    const prevSecRef = useRef(nowGameSec());

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === "lobby" || matchPhase === "end") return;

        let raf;
        const sixPM = 18 * 3600;

        const crossed = (from, to, target) => {
            if (to === from) return false;
            return (to > from) ? (target > from && target <= to)
                : (target > from || target <= to); // wrap at midnight
        };

        const tick = () => {
            const prev = prevSecRef.current;
            const cur = nowGameSec();

            if (matchPhase !== "meeting" && crossed(prev, cur, sixPM)) {
                setPhase("meeting", true);
                setTimer(meetingLength, true);
                hostAppendEvent(setEvents, "Meeting started.");
            }

            prevSecRef.current = cur;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ready, matchPhase, setPhase, setTimer, meetingLength, setEvents]);
}

/** During meeting, tick the timer; when it hits 0, exit back to the clock label (Host only). */
export function useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents }) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'

    useEffect(() => {
        if (!ready || !isHost() || matchPhase !== "meeting") return;
        const id = setInterval(() => setTimer((t) => Math.max(0, Number(t) - 1), true), 1000);
        return () => clearInterval(id);
    }, [ready, matchPhase, setTimer]);

    useEffect(() => {
        if (!ready || !isHost() || matchPhase !== "meeting") return;
        if (Number(timer) > 0) return;

        const now = clockPhase();
        setPhase(now, true);
        hostAppendEvent(setEvents, "Meeting ended.");
    }, [ready, matchPhase, timer, setPhase, setEvents, clockPhase]);
}
