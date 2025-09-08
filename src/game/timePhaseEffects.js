// src/game/timePhaseEffects.js
import { useEffect, useRef } from "react";
import { isHost } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";

export function useSyncPhaseToClock({ ready, matchPhase, setPhase }) {
    const clockPhase = useGameClock((s) => s.phase); // () => 'day' | 'night'
    const lastSentRef = useRef(null);

    useEffect(() => {
        if (!ready || !isHost()) return;
        // Never override lobby/meeting/end
        if (matchPhase === "lobby" || matchPhase === "meeting" || matchPhase === "end") return;

        const label = clockPhase(); // 'day' | 'night'

        // If we're already showing this label, or we already sent it, do nothing.
        if (matchPhase === label || lastSentRef.current === label) return;

        lastSentRef.current = label;
        setPhase(label, true);
        // console.log("[phase-sync] ->", label); // enable once if you want to verify
    }, [ready, matchPhase, setPhase, clockPhase]);
}
