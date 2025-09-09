// src/game/GameStateProvider.jsx
import React, {
    createContext,
    useContext,
    useMemo,
    useRef,
    useState,
    useEffect,
} from "react";
import {
    usePhase, useTimer, useLengths, useMeters,
    useDead, useEvents, useRolesAssigned
} from "../network/playroom";
import { myPlayer } from "playroomkit";

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

    // Expose myRole via provider (no extra listeners; just polls my player)
    const [myRole, setMyRole] = useState("");
    const myRoleOnceRef = useRef(false);
    useEffect(() => {
        if (myRoleOnceRef.current) return; // guard StrictMode double-mount in dev
        myRoleOnceRef.current = true;

        let alive = true;
        const id = setInterval(() => {
            if (!alive) return;
            const p = myPlayer();
            setMyRole(String(p?.getState?.("role") || ""));
        }, 400);

        return () => { alive = false; clearInterval(id); };
    }, []);

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
        // local player
        myRole,
    }), [
        phase, setPhase, timer, setTimer,
        dayLength, meetingLength, nightLength,
        setDayLen, setMeetLen, setNightLen,
        oxygen, power, cctv, setOxygen, setPower, setCCTV,
        meters, getMeter, setMeter,
        dead, setDead, events, setEvents, rolesAssigned, setRolesAssigned,
        myRole,
    ]);

    return <GameStateCtx.Provider value={value}>{children}</GameStateCtx.Provider>;
}

export function useGameState() {
    const ctx = useContext(GameStateCtx);
    if (!ctx) throw new Error("useGameState must be used inside <GameStateProvider>");
    return ctx;
}
