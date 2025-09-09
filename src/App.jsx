// src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
import { usePlayersList, isHost, myPlayer } from "playroomkit";

import GameCanvas from "./GameCanvas.jsx";              // <- adjust if your path differs
import Lobby from "./components/Lobby.jsx";
import HUD from "./ui/HUD.jsx";
import TimeDebugPanel from "./ui/TimeDebugPanel.jsx";
import { TopBar, VotePanel, Centered } from "./ui";

import { GameStateProvider, useGameState } from "./game/GameStateProvider";
import { useGameClock } from "./systems/dayNightClock";

// Effects
import {
    useLobbyReady,
    useDayTicker,
    useAssignCrewRoles,
    useProcessActions,
    useMeetingVoteResolution,
    useMetersInitAndDailyDecay,
} from "./game/effects";
import {
    useSyncPhaseToClock,
    useMeetingFromClock,
    useMeetingCountdown,
} from "./game/timePhaseEffects";

// Items state (floor + held items)
import useItemsSync from "./systems/useItemsSync.js";

// Helpers (non-hook) from playroom layer
import { hostAppendEvent, requestAction } from "./network/playroom";

function InnerApp() {
    const [ready, setReady] = useState(false);
    useLobbyReady(setReady);               // join room, then mark ready

    // presence-only list (includes self). No per-player state listeners.
    const players = usePlayersList();

    // Single source of truth via provider
    const {
        phase, setPhase,
        timer, setTimer,
        dayLength, meetingLength, /* nightLength */,
        oxygen, power, cctv, setOxygen, setPower, setCCTV,
        dead, setDead,
        events, setEvents,
        rolesAssigned, setRolesAssigned,
    } = useGameState();

    const matchPhase = phase || "lobby";
    const isInLobby = matchPhase === "lobby";

    // Clock-driven values
    const clockPhaseFn = useGameClock((s) => s.phase);
    const dayNumber = useGameClock((s) => s.dayNumber);
    const maxDays = useGameClock((s) => s.maxDays);

    const phaseLabel = matchPhase === "meeting" ? "meeting" : clockPhaseFn();
    const inGame = matchPhase !== "lobby" && matchPhase !== "end";

    // Gameplay effects (host/client logic)
    useSyncPhaseToClock({ ready, matchPhase, setPhase });
    useMeetingFromClock({ ready, matchPhase, setPhase, timer, setTimer, meetingLength, setEvents });
    useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents });
    useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents });
    useAssignCrewRoles({ ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents });
    useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });
    useMeetingVoteResolution({ ready, matchPhase, timer, players, dead, setDead, setEvents });
    useMetersInitAndDailyDecay({ ready, inGame, dayNumber, power, oxygen, setPower, setOxygen, setEvents });

    // Ensure my name/team once ready
    useEffect(() => {
        if (!ready) return;
        const me = myPlayer();
        if (!me) return;

        if (!me.getState?.("name")) {
            const fallback = me?.profile?.name || me?.name || (me.id?.slice(0, 6) ?? "Player");
            me.setState?.("name", fallback, true);
        }
        const currentTeam = me.getState?.("team") || me.getState?.("teamName");
        if (!currentTeam) me.setState?.("team", "Team Alpha", true);
    }, [ready]);

    // Host-only: launch helper (kept for Lobby handoff or debug)
    function launchGame() {
        if (!isHost()) return;
        setPhase("day", true);
        hostAppendEvent(setEvents, "Mission launch — Day 1");
    }

    // Items → backpack for HUD
    const { items } = useItemsSync();
    const meP = myPlayer();
    const myId = meP?.id;

    const labelFromType = (t) =>
        t === "food" ? "Food Ration" :
            t === "battery" ? "Battery Pack" :
                t === "o2can" ? "O₂ Canister" :
                    t === "fuel" ? "Fuel Rod" :
                        (t || "Item");

    const iconForType = (t) =>
        t === "food" ? "🍎" :
            t === "battery" ? "🔋" :
                t === "o2can" ? "🫧" :
                    t === "fuel" ? "🟣" :
                        "📦";

    const myBackpack = useMemo(() => {
        if (!myId) return [];
        return items
            .filter((it) => it.holder === myId)
            .map((it) => ({
                id: it.id,
                name: labelFromType(it.type),
                qty: 1,
                icon: iconForType(it.type),
                type: it.type,
            }));
    }, [items, myId]);

    const typeById = useMemo(() => {
        const m = {};
        for (const it of myBackpack) m[it.id] = it.type;
        return m;
    }, [myBackpack]);

    const aliveCount = players.filter((p) => !dead.includes(p.id)).length;

    if (!ready) return <Centered><h2>Opening lobby…</h2></Centered>;
    if (isInLobby) return <Lobby onLaunch={launchGame} />;

    // HUD-only data/functions
    const game = {
        meters: {
            energy: Number(power ?? 0),
            oxygen: Number(oxygen ?? 0),
        },
        me: {
            id: myId || "me",
            backpack: myBackpack,
            capacity: 8,
        },
        onDropItem: (id) => requestAction("drop", id),
        onUseItem: (id) => {
            const t = typeById[id];
            if (!t) return;
            if (t === "food") requestAction("use", `eat|${id}`);
            // else: must be used at a device via world interaction
        },
        requestAction,
    };

    return (
        <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <TopBar phase={phaseLabel} timer={timer} players={aliveCount} events={events} />

            <div style={{ position: "relative" }}>
                <GameCanvas dead={dead} />

                {isHost() && (
                    <div style={{ position: "absolute", top: 10, right: 10, pointerEvents: "auto", zIndex: 10 }}>
                        <TimeDebugPanel />
                    </div>
                )}

                {/* HUD overlay – internal elements enable pointer events as needed */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <HUD game={game} />
                </div>
            </div>

            {matchPhase === "meeting" && !dead.includes(myId) && <VotePanel dead={dead} />}
        </div>
    );
}

export default function App() {
    return (
        <GameStateProvider>
            <InnerApp />
        </GameStateProvider>
    );
}
