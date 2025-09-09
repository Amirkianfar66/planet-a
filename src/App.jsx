// src/App.jsx  — TEMP DEBUG (no dayNightClock)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import GameCanvas from "./components/GameCanvas.jsx";
import {
    usePhase, useTimer, useLengths,
    useDead, useEvents, useMeters, useRolesAssigned,
    hostAppendEvent, requestAction,
} from "./network/playroom";
import { isHost, myPlayer, usePlayersList } from "playroomkit";

import TimeDebugPanel from "./ui/TimeDebugPanel.jsx";
// ⛔ removed: import { useGameClock } from "./systems/dayNightClock";
import Lobby from "./components/Lobby.jsx";

// effects
import {
    useLobbyReady,
    // useDayTicker,                // ⛔ disable (depends on clock/dayNumber)
    useAssignCrewRoles,
    useProcessActions,
    useMeetingVoteResolution,
    // useMetersInitAndDailyDecay,  // ⛔ disable (depends on dayNumber)
} from "./game/effects";
import {
    // useSyncPhaseToClock,         // ⛔ disable (depends on clockPhase)
    // useMeetingFromClock,         // ⛔ disable (clock-initialized meeting timer)
    // useMeetingCountdown,         // ⛔ disable (ties to clock-driven meeting)
} from "./game/timePhaseEffects";

// UI
import { TopBar, VotePanel, Centered } from "./ui";
import HUD from "./ui/HUD.jsx";

// items state (source of truth for floor + held items)
import useItemsSync from "./systems/useItemsSync.js";

export default function App() {
    console.count("App render (no clock)");

    const [ready, setReady] = useState(false);
    const players = usePlayersList(true);

    const [phase, setPhase] = usePhase();
    const matchPhase = phase || "lobby";
    const isInLobby = matchPhase === "lobby";

    const [timer] = useTimer();              // we still read timer, but we won't drive it from clock
    const { meetingLength } = useLengths();  // unused now, fine to keep

    const [dead, setDead] = useDead();
    const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
    const [events, setEvents] = useEvents();
    const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

    // ⛔ removed useGameClock; just use the multiplayer phase directly for label
    const phaseLabel = matchPhase; // "day" | "meeting" | "lobby" | "end"
    const inGame = matchPhase !== "lobby" && matchPhase !== "end";

    // --- minimal effects only ---
    useLobbyReady(setReady);

    // Keep safe/benign effects that don't depend on the clock
    useAssignCrewRoles({ ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents });
    useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });
    useMeetingVoteResolution({ ready, matchPhase, timer, players, dead, setDead, setEvents });

    // ensure local player has a name/team once ready
    useEffect(() => {
        if (!ready) return;
        const me = myPlayer();
        if (!me) return;

        if (!me.getState?.("name")) {
            const fallback = me?.profile?.name || me?.name || (me.id?.slice(0, 6) ?? "Player");
            me.setState?.("name", fallback, true);
        }
        const currentTeam = me.getState?.("team") || me.getState?.("teamName");
        if (!currentTeam) {
            me.setState?.("team", "Team Alpha", true);
        }
    }, [ready]);

    const launchGame = useCallback(() => {
        if (!isHost()) return;
        setPhase("day", true);
        hostAppendEvent(setEvents, "Mission launch — Day 1");
    }, [setPhase, setEvents]);

    // items → backpack for HUD
    const { items } = useItemsSync();
    const meP = myPlayer();
    const myId = meP?.id;

    const labelFromType = (t) =>
        t === "food" ? "Food Ration"
            : t === "battery" ? "Battery Pack"
                : t === "o2can" ? "O₂ Canister"
                    : t === "fuel" ? "Fuel Rod"
                        : (t || "Item");

    const iconForType = (t) =>
        t === "food" ? "🍎"
            : t === "battery" ? "🔋"
                : t === "o2can" ? "🫧"
                    : t === "fuel" ? "🟣"
                        : "📦";

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

    const aliveCount = useMemo(
        () => players.filter((p) => !dead.includes(p.id)).length,
        [players, dead]
    );

    if (!ready) return <Centered><h2>Opening lobby…</h2></Centered>;
    if (isInLobby) return <Lobby onLaunch={launchGame} />;

    const game = useMemo(() => ({
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
        },
        requestAction,
    }), [power, oxygen, myId, myBackpack, typeById]);

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

                {/* HUD overlay */}
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
