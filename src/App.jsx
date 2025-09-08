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

// extracted UI
import { TopBar, MetersPanel, EventsFeed, VotePanel, Centered } from "./ui";


// NEW: HUD overlay composed of Status/Role/Backpack/TeamChat
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

    // ---------- NEW: Build a `game` object for HUD ----------
    const game = {
        meters: {
            energy: typeof power === "number" ? power : 0,   // map Power -> Energy for HUD
            oxygen: typeof oxygen === "number" ? oxygen : 0,
        },
        me: {
            id: myId || "me",
            role: (rolesAssigned && myId && rolesAssigned[myId]) || "Crewmate",
            objective: "Complete daily maintenance tasks.",  // replace with your role-based objective if you wish
            roleTips: [],
            backpack: [],          // plug your inventory array here
            capacity: 8,
            teamName: "Team Alpha", // plug your real team name here if you have it
        },
        teamMembers: players.map((p) => ({
            id: p.id,
            name: p?.profile?.name || p?.name || "Crew",
            color: p?.profile?.color,
            isOnline: !dead.includes(p.id),
        })),
        teamMessages: [], // plug your chat messages array here
        requestAction,    // pass through to HUD buttons (useItem, dropItem, chat, pingObjective)
    };

    return (
        <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr" }}>
            {/* TopBar with day/night, phase chip, progress, and meeting timer */}
            <TopBar phase={phaseLabel} timer={timer} players={aliveCount} />

            <div style={{ position: "relative" }}>
                <GameCanvas dead={dead} />

                {isHost() && <TimeDebugPanel />}

                <MetersPanel
                    phase={phaseLabel}
                    oxygen={oxygen}
                    power={power}
                    cctv={cctv}
                    onRepair={(m) => requestAction("repair", m, +10)}
                />

                <EventsFeed events={events} />

                {/* -------- NEW: HUD overlay (clickable) -------- */}
                <div style={{ position: "absolute", inset: 16, pointerEvents: "none" }}>
                    <div style={{ pointerEvents: "auto" }}>
                        <HUD game={game} />
                    </div>
                </div>
                {/* --------------------------------------------- */}
            </div>

            {matchPhase === "meeting" && !dead.includes(myPlayer().id) && (
                <VotePanel dead={dead} />
            )}
        </div>
    );
}
