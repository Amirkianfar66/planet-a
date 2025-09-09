// src/App.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import GameCanvas from "./components/GameCanvas.jsx";
import {
    usePhase, useTimer, useLengths,
    useDead, useEvents, useMeters, useRolesAssigned,
    hostAppendEvent, requestAction,
} from "./network/playroom";
import { isHost, myPlayer, usePlayersList } from "playroomkit";

import TimeDebugPanel from "./ui/TimeDebugPanel.jsx";
// ⛔ removed: useGameClock
import Lobby from "./components/Lobby.jsx";

// effects that don't depend on a separate clock
import {
    useLobbyReady,
    useAssignCrewRoles,
    useProcessActions,
    useMeetingVoteResolution,
    // If you had decay tied to dayNumber/clock, keep it disabled or refactor to timer-based
    // useMetersInitAndDailyDecay
} from "./game/effects";

// (No timePhaseEffects — we’re driving phase/timer directly here)

import { TopBar, VotePanel, Centered } from "./ui";
import HUD from "./ui/HUD.jsx";

// items state (source of truth for floor + held items)
import useItemsSync from "./systems/useItemsSync.js";

export default function App() {
    console.count("App render (Option A)");
    const [ready, setReady] = useState(false);
    const players = usePlayersList(true);

    const [phase, setPhase] = usePhase();
    const matchPhase = phase || "lobby";
    const isInLobby = matchPhase === "lobby";

    const [timer, setTimer] = useTimer();
    const { meetingLength } = useLengths(); // seconds for meeting, fallback used below

    const [dead, setDead] = useDead();
    const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
    const [events, setEvents] = useEvents();
    const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

    // Phase label is simply the network phase now
    const phaseLabel = matchPhase;
    const inGame = matchPhase !== "lobby" && matchPhase !== "end";

    // ─────────────────────────────────────────────────────────────────────────────
    // HOST-ONLY PHASE/TIMER LOOP (single source of truth)
    // ─────────────────────────────────────────────────────────────────────────────

    // Refs to always read the latest values inside setInterval without recreating it
    const phaseRef = useRef(matchPhase);
    const timerRef = useRef(timer);
    useEffect(() => { phaseRef.current = matchPhase; }, [matchPhase]);
    useEffect(() => { timerRef.current = timer; }, [timer]);

    // Idempotent setters (write only if changed)
    const setPhaseIfDiff = useCallback((next) => {
        if (phaseRef.current !== next) setPhase(next, true);
    }, [setPhase]);
    const setTimerIfDiff = useCallback((next) => {
        const curr = Number(timerRef.current ?? 0);
        if (curr !== next) setTimer(next, true);
    }, [setTimer]);

    // Start a simple host loop that decrements the timer every 1s and toggles phases
    useEffect(() => {
        if (!ready) return;
        if (!isHost()) return;

        const DAY_SEC = 60; // ⏱️ adjust to your needs
        const MEETING_SEC = Number(meetingLength ?? 30);

        const id = setInterval(() => {
            const nowPhase = phaseRef.current;
            const nowTimer = Number(timerRef.current ?? 0);

            if (nowPhase === "lobby" || nowPhase === "end") return;

            if (nowPhase === "meeting") {
                if (nowTimer > 0) {
                    setTimerIfDiff(nowTimer - 1);
                } else {
                    // Meeting ended → return to day
                    setPhaseIfDiff("day");
                    setTimerIfDiff(DAY_SEC);
                    // Optional: announce transition
                    // hostAppendEvent(setEvents, "Meeting ended → Day");
                }
                return;
            }

            // DAY (or any non-meeting, non-lobby/end phase)
            if (nowTimer > 0) {
                setTimerIfDiff(nowTimer - 1);
            } else {
                // Day ended → start meeting
                setPhaseIfDiff("meeting");
                setTimerIfDiff(MEETING_SEC);
                // Optional: announce transition
                // hostAppendEvent(setEvents, "Day ended → Meeting");
            }
        }, 1000);

        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, meetingLength]);
    // (We don’t put phase/timer in deps; refs keep them fresh.)

    // ─────────────────────────────────────────────────────────────────────────────
    // Gameplay effects that don’t depend on a separate clock
    // ─────────────────────────────────────────────────────────────────────────────
    useLobbyReady(setReady);
    useAssignCrewRoles({ ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents });
    useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });
    useMeetingVoteResolution({ ready, matchPhase, timer, players, dead, setDead, setEvents });
    // If you had meters decay tied to dayNumber, either disable or refactor to run on phase/timer.

    // Ensure local player has a name/team once ready
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

    const launchGame = useCallback(() => {
        if (!isHost()) return;
        // Start the game at Day with an initial timer so the host loop can tick
        const DAY_SEC = 60; // keep in sync with the loop above
        setPhase("day", true);
        setTimer(DAY_SEC, true);
        hostAppendEvent(setEvents, "Mission launch — Day 1");
    }, [setPhase, setTimer, setEvents]);

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

    // HUD payload
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
            // other types used at devices via world interaction
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

                {/* HUD overlay – internal elements enable pointer events as needed */}
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
