// src/App.jsx (TEMP DEBUG)
import React, { useState, useEffect } from "react";
import {
    usePhase, useTimer, useLengths,
    useDead, useEvents, useMeters, useRolesAssigned,
} from "./network/playroom";
import { myPlayer } from "playroomkit";
import { useGameClock } from "./systems/dayNightClock";
import Lobby from "./components/Lobby.jsx";
import { Centered } from "./ui";

// 🔒 ALL OFF to start
const ENABLE = {
    effects: {
        syncPhaseToClock: false,
        meetingFromClock: false,
        meetingCountdown: false,
        dayTicker: false,
        assignRoles: false,
        processActions: false,
        voteResolution: false,
        metersDecay: false,
    },
    components: {
        topBar: false,
        canvas: false,
        hud: false,
        votePanel: false,
    }
};

export default function App() {
    console.count("App render");

    const [ready, setReady] = useState(false);
    useEffect(() => { console.count("setReady@useLobbyReady"); setReady(true); }, []);

    // Keep core subscriptions minimal
    const [phase] = usePhase();
    const matchPhase = phase || "lobby";
    const isInLobby = matchPhase === "lobby";

    // One clock subscription (values, not functions)
    useGameClock((s) => ({ phase: s.phase, dayNumber: s.dayNumber, maxDays: s.maxDays }));

    // Ensure player gets a name once
    useEffect(() => {
        if (!ready) return;
        const me = myPlayer();
        if (!me) return;
        if (!me.getState?.("name")) {
            const fallback = me?.profile?.name || me?.name || (me.id?.slice(0, 6) ?? "Player");
            me.setState?.("name", fallback, true);
        }
        if (!me.getState?.("team") && !me.getState?.("teamName")) {
            me.setState?.("team", "Team Alpha", true);
        }
    }, [ready]);

    if (!ready) return <Centered><h2>Opening lobby…</h2></Centered>;
    if (isInLobby) return <Lobby onLaunch={() => { }} />;

    // Minimal non-lobby render so we can see if the loop persists
    return <Centered><h2>Debug minimal view</h2></Centered>;
}
