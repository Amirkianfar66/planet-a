// src/game/timePhaseEffects.js
import { useEffect, useRef } from 'react';
import { hostAppendEvent } from '../network/playroom';
import { isHost } from 'playroomkit';
import { useGameClock } from '../systems/dayNightClock';

/**
 * Host-only: mirror the clock's day/night into the shared `phase` when NOT in meeting.
 * This keeps one source of truth (the clock), and a convenient shared label (phase).
 */
export function useSyncPhaseToClock({ ready, matchPhase, setPhase }) {
    const clockPhase = useGameClock((s) => s.phase); // function -> 'day' | 'night'

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase === 'meeting') return; // don't override meeting

        const now = clockPhase(); // 'day' or 'night'
        // Only set if different (avoid network noise)
        setPhase((prev) => {
            if (prev === now) return prev;
            return now;
        }, true);
    }, [ready, matchPhase, setPhase, clockPhase]);
}

/**
 * Host-only: start a meeting at dusk (18:00) when we cross that time.
 * When meeting ends (timer <= 0), go back to whatever the clock says.
 */
export function useMeetingFromClock({
    ready,
    matchPhase, setPhase,
    timer, setTimer,
    meetingLength,
    setEvents,
}) {
    const nowGameSec = useGameClock.getState().nowGameSec; // fast accessor
    const prevSecRef = useRef(nowGameSec());

    useEffect(() => {
        if (!ready || !isHost()) return;

        let raf;
        const sixPM = 18 * 3600;

        const crossed = (from, to, target) => {
            if (to === from) return false;
            return (to > from) ? (target > from && target <= to)
                : (target > from || target <= to); // wrap across midnight
        };

        const tick = () => {
            const prev = prevSecRef.current;
            const cur = nowGameSec();

            // Enter meeting right when we hit 18:00
            if (matchPhase !== 'meeting' && crossed(prev, cur, sixPM)) {
                setPhase('meeting', true);
                setTimer(meetingLength, true);
                hostAppendEvent(setEvents, 'Meeting started.');
            }

            prevSecRef.current = cur;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ready, matchPhase, setPhase, setTimer, meetingLength, setEvents]);
}

/**
 * Host-only: count down the meeting timer; when it reaches 0, exit back to clock-driven phase.
 */
export function useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents }) {
    const clockPhase = useGameClock((s) => s.phase); // function -> 'day' | 'night'

    useEffect(() => {
        if (!ready || !isHost() || matchPhase !== 'meeting') return;

        const id = setInterval(() => {
            setTimer((t) => Math.max(0, Number(t) - 1), true);
        }, 1000);
        return () => clearInterval(id);
    }, [ready, matchPhase, setTimer]);

    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase !== 'meeting') return;
        if (Number(timer) > 0) return;

        // Meeting ended → hand control back to the clock label
        const now = clockPhase(); // 'day' | 'night'
        setPhase(now, true);
        hostAppendEvent(setEvents, 'Meeting ended.');
    }, [ready, matchPhase, timer, setPhase, setEvents, clockPhase]);
}
