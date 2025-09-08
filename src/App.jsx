// src/App.jsx
import React, { useState, useEffect } from "react";
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

// effects
import {
    useLobbyReady,
    useDayTicker,
    useAssignCrewRoles,
    useProcessActions,
    useMeetingVoteResolution,
    useMetersInitAndDailyDecay
} from "./game/effects";
import {
    useSyncPhaseToClock,
    useMeetingFromClock,
    useMeetingCountdown,
} from "./game/timePhaseEffects";

// extracted UI (HUD is the only overlay now)
import { TopBar, EventsFeed, VotePanel, Centered } from "./ui";
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
    // Initialize meters to 100 on Day 1; halve Energy each new day
    useMetersInitAndDailyDecay({
        ready,
        inGame,
        dayNumber,
        power,
        oxygen,
        setPower,
        setOxygen,
        setEvents,
    });

    // ✅ ALWAYS call hooks before any early returns
    useEffect(() => {
        if (!ready) return;
        const me = myPlayer();
        if (!me) return;

        // Ensure display name
        if (!me.getState?.("name")) {
            const fallback = me?.profile?.name || me?.name || (me.id?.slice(0, 6) ?? "Player");
            me.setState?.("name", fallback, true);
        }
        // Ensure team
        const currentTeam = me.getState?.("team") || me.getState?.("teamName");
        if (!currentTeam) {
            me.setState?.("team", "Team Alpha", true);
        }
    }, [ready]);

    function launchGame() {
        if (!isHost()) return;
        setPhase("day", true);
        hostAppendEvent(setEvents, "Mission launch — Day 1");
    }

    // You can read myId safely (not a hook)
    const meP = myPlayer();
    const myId = meP?.id;
    const aliveCount = players.filter((p) => !dead.includes(p.id)).length;

    if (!ready) return <Centered><h2>Opening lobby…</h2></Centered>;
    if (isInLobby) return <Lobby onLaunch={launchGame} />;

    const game = {
        meters: {
            energy: Number(power ?? 0),
            oxygen: Number(oxygen ?? 0),
        },
        me: {
            id: myId || "me",
            backpack: [],
            capacity: 8,
            // Role & team read LIVE in RolePanel/TeamChatPanel
        },
        requestAction,
    };

    return (
        <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <TopBar phase={phaseLabel} timer={timer} players={aliveCount} />

            <div style={{ position: "relative" }}>
                <GameCanvas dead={dead} />
                {isHost() && <TimeDebugPanel />}

                <EventsFeed events={events} />

                {/* HUD: status, role, backpack + chat pinned bottom-left */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <HUD game={game} />
                </div>
            </div>

            {matchPhase === "meeting" && !dead.includes(myId) && (
                <VotePanel dead={dead} />
            )}
        </div>
    );
}
