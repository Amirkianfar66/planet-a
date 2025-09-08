// src/App.jsx
import React, { useState } from "react";
import GameCanvas from "./components/GameCanvas";
import {
    usePhase, useTimer, useLengths,
    useDead, useEvents, useMeters, useRolesAssigned,
    hostAppendEvent, requestAction,
} from "./network/playroom";
import { isHost, myPlayer, usePlayersList } from "playroomkit";

import TimeDebugPanel from "./ui/TimeDebugPanel";
import { useGameClock } from "./systems/dayNightClock";
import Lobby from "./components/Lobby";

// game effects
import {
    useLobbyReady,
    useDayTicker,
    useAssignCrewRoles,
    useProcessActions,
    useMeetingVoteResolution,
} from "./game/effects";
import {
    useSyncPhaseToClock,
    useMeetingFromClock,
    useMeetingCountdown,
} from "./game/timePhaseEffects";

// extracted UI (NO MetersPanel / TeamChatPanel here)
import { TopBar, EventsFeed, VotePanel, Centered } from "./ui";

// HUD = single source overlay (status, role, chat, backpack)
import HUD from "./ui/HUD";

export default function App() {
    const [ready, setReady] = useState(false);
    const players = usePlayersList(true);

    const [phase, setPhase] = usePhase();
    const matchPhase = phase || "lobby";
    const isInLobby = matchPhase === "lobby";

    const [timer, setTimer] = useTimer();
    const { meetingLength } = useLengths();

    const [dead, setDead] = useDead();
    const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
    const [events, setEvents] = useEvents();
    const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

    const clockPhaseFn = useGameClock((s) => s.phase);
    const dayNumber = useGameClock((s) => s.dayNumber);
    const maxDays = useGameClock((s) => s.maxDays);

    const phaseLabel = matchPhase === "meeting" ? "meeting" : clockPhaseFn();
    const inGame = matchPhase !== "lobby" && matchPhase !== "end";

    // effects
    useLobbyReady(setReady);
    useSyncPhaseToClock({ ready, matchPhase, setPhase });
    useMeetingFromClock({ ready, matchPhase, setPhase, timer, setTimer, meetingLength, setEvents });
    useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents });
    useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents });
    useAssignCrewRoles({ ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents });
    useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });
    useMeetingVoteResolution({ ready, matchPhase, timer, players, dead, setDead, setEvents });

    function launchGame() {
        if (!isHost()) return;
        setPhase("day", true);
        hostAppendEvent(setEvents, "Mission launch — Day 1");
    }

    if (!ready) return <Centered><h2>Opening lobby…</h2></Centered>;
    if (isInLobby) return <Lobby onLaunch={launchGame} />;

    const meP = myPlayer();
    const myId = meP?.id;
    const aliveCount = players.filter((p) => !dead.includes(p.id)).length;

    // Build the minimal game object HUD needs
    const game = {
        meters: {
            energy: Number(power ?? 0),
            oxygen: Number(oxygen ?? 0),
        },
        me: {
            id: myId || "me",
            backpack: [], // plug your inventory if you have it
            capacity: 8,
            // NOTE: Role & team are read LIVE inside RolePanel/TeamChatPanel from Playroom
        },
        requestAction, // for HUD buttons: pingObjective, useItem, dropItem, chat
    };

    return (
        <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr" }}>
            {/* Top bar with day/night, phase, and meeting timer */}
            <TopBar phase={phaseLabel} timer={timer} players={aliveCount} />

            <div style={{ position: "relative" }}>
                <GameCanvas dead={dead} />

                {isHost() && <TimeDebugPanel />}

                {/* You can keep EventsFeed separate from HUD */}
                <EventsFeed events={events} />

                {/* HUD is the ONLY overlay now (status, role, chat, backpack) */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <HUD game={game} />
                </div>
            </div>

            {matchPhase === "meeting" && !dead.includes(myPlayer().id) && (
                <VotePanel dead={dead} />
            )}
        </div>
    );
}
