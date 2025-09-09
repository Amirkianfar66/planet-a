// src/game/effects.js
import * as React from "react";

/**
 * Mark app/lobby ready. (Assumes external init already done.)
 */
export function useLobbyReady(setReady) {
    React.useEffect(() => {
        // Only set once
        console.count("setReady@useLobbyReady");
        setReady(true);
        // no deps change expected
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/**
 * Day ticker: announce day changes once.
 */
export function useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents }) {
    const lastDayRef = React.useRef(null);

    React.useEffect(() => {
        if (!ready || !inGame) return;
        if (dayNumber == null) return;

        if (lastDayRef.current !== dayNumber) {
            lastDayRef.current = dayNumber;

            if (setEvents) {
                console.count("setEvents@useDayTicker");
                setEvents(prev => [...prev, `Day ${dayNumber} begins`]);
            }
        }
    }, [ready, inGame, dayNumber, setEvents]);

    // You can add maxDays logic here if you end the game on the last day.
}

/**
 * Assign roles exactly once per round/session.
 */
export function useAssignCrewRoles({
    ready, phaseLabel, rolesAssigned, players, dead,
    setRolesAssigned, setEvents,
}) {
    React.useEffect(() => {
        if (!ready) return;
        if (rolesAssigned) return;
        // Optional: gate on a stable phase (avoid during meeting)
        if (phaseLabel === "meeting") return;

        console.count("setRolesAssigned@useAssignCrewRoles");
        setRolesAssigned(true);

        if (setEvents) {
            console.count("setEvents@useAssignCrewRoles");
            setEvents(prev => [...prev, "Crew roles assigned"]);
        }
    }, [ready, rolesAssigned, phaseLabel, setRolesAssigned, setEvents, players, dead]);
}

/**
 * Process in-world actions / meters — idempotent writes only.
 */
export function useProcessActions({
    ready, inGame, players, dead,
    setOxygen, setPower, setCCTV,
    setEvents,
}) {
    React.useEffect(() => {
        if (!ready || !inGame) return;

        // 👇 Example: if you actually compute next values, only write when changed.
        // Replace these with your own deltas; here we do nothing unless you add logic.
        // const nextO2 = ...
        // setOxygen(o => {
        //   if (o === nextO2) return o;
        //   console.count("setOxygen@useProcessActions");
        //   return nextO2;
        // });

        // const nextP = ...
        // setPower(p => {
        //   if (p === nextP) return p;
        //   console.count("setPower@useProcessActions");
        //   return nextP;
        // });

        // If you mutate CCTV, also guard:
        // setCCTV(v => {
        //   if (v === next) return v;
        //   console.count("setCCTV@useProcessActions");
        //   return next;
        // });

    }, [ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents]);
}

/**
 * Resolve votes at meeting end once.
 */
export function useMeetingVoteResolution({
    ready, matchPhase, timer, players, dead,
    setDead, setEvents,
}) {
    const resolvedRef = React.useRef(false);

    React.useEffect(() => {
        if (!ready) return;
        if (matchPhase !== "meeting") {
            resolvedRef.current = false;
            return;
        }
        if (timer > 0) return;
        if (resolvedRef.current) return;

        resolvedRef.current = true;

        // Example only: you likely compute who to eject here.
        // setDead(prev => {
        //   const next = [...prev, kickedId];
        //   if (next.length === prev.length) return prev;
        //   console.count("setDead@useMeetingVoteResolution");
        //   return next;
        // });

        if (setEvents) {
            console.count("setEvents@useMeetingVoteResolution");
            setEvents(prev => [...prev, "Vote resolved"]);
        }
    }, [ready, matchPhase, timer, players, dead, setDead, setEvents]);
}

/**
 * Initialize meters and apply daily decay — only when values actually change.
 */
export function useMetersInitAndDailyDecay({
    ready, inGame, dayNumber,
    power, oxygen,
    setPower, setOxygen,
    setEvents,
}) {
    const lastAppliedDayRef = React.useRef(null);

    React.useEffect(() => {
        if (!ready || !inGame) return;
        if (dayNumber == null) return;

        // Apply decay at most once per "tick" (here: per dayNumber change)
        if (lastAppliedDayRef.current === dayNumber) return;
        lastAppliedDayRef.current = dayNumber;

        // Example decay; replace with your own values
        const nextPower = Math.max(0, Math.min(100, Number(power ?? 0) - 0.5));
        const nextO2 = Math.max(0, Math.min(100, Number(oxygen ?? 0) - 0.25));

        if (nextPower !== power) {
            console.count("setPower@useMetersInitAndDailyDecay");
            setPower(nextPower);
        }
        if (nextO2 !== oxygen) {
            console.count("setOxygen@useMetersInitAndDailyDecay");
            setOxygen(nextO2);
        }

        if (setEvents) {
            console.count("setEvents@useMetersInitAndDailyDecay");
            setEvents(prev => [...prev, `Daily decay applied (Day ${dayNumber})`]);
        }
    }, [ready, inGame, dayNumber, power, oxygen, setPower, setOxygen, setEvents]);
}
