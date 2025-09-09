// src/game/timePhaseEffects.js
import * as React from "react";

/**
 * Keep app phase in sync with the clock, without ping-pong.
 */
export function useSyncPhaseToClock({ ready, matchPhase, setPhase, clockPhase }) {
    React.useEffect(() => {
        if (!ready) return;
        if (!clockPhase) return;
        if (matchPhase === "end") return;

        // Don't override the special meeting phase from clock ticks
        if (matchPhase !== "meeting" && matchPhase !== clockPhase) {
            // DEBUG
            console.count("setPhase@useSyncPhaseToClock");
            setPhase(clockPhase, true);
        }
    }, [ready, matchPhase, clockPhase, setPhase]);
}

/**
 * When entering a meeting, make sure the timer is initialized once.
 */
export function useMeetingFromClock({
    ready, matchPhase,
    setPhase, // kept in signature in case you use it internally
    timer, setTimer,
    meetingLength,
    setEvents,
}) {
    // initialize meeting timer exactly once per meeting
    const metInitRef = React.useRef(0);

    React.useEffect(() => {
        if (!ready) return;
        if (matchPhase !== "meeting") {
            metInitRef.current = 0;
            return;
        }

        const intended = Number(meetingLength ?? 0);
        if (!Number.isFinite(intended) || intended <= 0) return;

        if (metInitRef.current === 0 || Number(timer) !== intended) {
            console.count("setTimer@useMeetingFromClock");
            setTimer(intended, true);
            metInitRef.current = Date.now();

            // optional: announce once
            if (setEvents) {
                console.count("setEvents@useMeetingFromClock");
                setEvents(prev => [...prev, "Meeting started"]);
            }
        }
    }, [ready, matchPhase, meetingLength, timer, setTimer, setEvents, setPhase]);
}

/**
 * Resolve meeting end when the countdown hits 0, once.
 */
export function useMeetingCountdown({
    ready, matchPhase,
    timer, setTimer,
    setPhase, setEvents,
}) {
    const finishedRef = React.useRef(false);

    React.useEffect(() => {
        if (!ready) return;
        if (matchPhase !== "meeting") {
            finishedRef.current = false;
            return;
        }

        if (timer <= 0 && !finishedRef.current) {
            finishedRef.current = true;

            // DEBUG
            console.count("setPhase@useMeetingCountdown");
            setPhase("day", true);

            if (setEvents) {
                console.count("setEvents@useMeetingCountdown");
                setEvents(prev => [...prev, "Meeting ended"]);
            }
        }
    }, [ready, matchPhase, timer, setPhase, setEvents]);

    // (Optional) if you drive the countdown locally, throttle it — but many games tick server-side.
}
