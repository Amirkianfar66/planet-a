import React, { createContext, useContext, useMemo } from "react";
import {
    usePhase, useTimer, useLengths, useMeters,
    useDead, useEvents, useRolesAssigned
} from "../network/playroom";

const GameStateCtx = createContext(null);

export function GameStateProvider({ children }) {
    const [phase, setPhase] = usePhase();
    const [timer, setTimer] = useTimer();

    const {
        dayLength, meetingLength, nightLength,
        setDayLen, setMeetLen, setNightLen
    } = useLengths();

    const {
        oxygen, power, cctv,
        setOxygen, setPower, setCCTV,
        meters, getMeter, setMeter
    } = useMeters();

    const [dead, setDead] = useDead();
    const [events, setEvents] = useEvents();
    const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

    const value = useMemo(() => ({
        // timers/phase
        phase, setPhase, timer, setTimer,
        dayLength, meetingLength, nightLength,
        setDayLen, setMeetLen, setNightLen,
        // meters (both fixed + generic)
        oxygen, power, cctv, setOxygen, setPower, setCCTV,
        meters, getMeter, setMeter,
        // other shared states
        dead, setDead, events, setEvents, rolesAssigned, setRolesAssigned,
    }), [
        phase, setPhase, timer, setTimer,
        dayLength, meetingLength, nightLength,
        setDayLen, setMeetLen, setNightLen,
        oxygen, power, cctv, setOxygen, setPower, setCCTV,
        meters, getMeter, setMeter,
        dead, setDead, events, setEvents, rolesAssigned, setRolesAssigned
    ]);

    return <GameStateCtx.Provider value={value}>{children}</GameStateCtx.Provider>;
}

export function useGameState() {
    const ctx = useContext(GameStateCtx);
    if (!ctx) throw new Error("useGameState must be used inside <GameStateProvider>");
    return ctx;
}
