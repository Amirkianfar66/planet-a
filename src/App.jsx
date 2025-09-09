import React, { useState, useEffect, useMemo, useCallback } from "react";
import GameCanvas from "./components/GameCanvas.jsx";
import {
    usePhase, useTimer, useLengths,
    useDead, useEvents, useMeters, useRolesAssigned,
    hostAppendEvent, requestAction,
} from "./network/playroom";
import { isHost, myPlayer, usePlayersList } from "playroomkit";

import TimeDebugPanel from "./ui/TimeDebugPanel.jsx";
import { useGameClock } from "./systems/dayNightClock";
import Lobby from "./components/Lobby.jsx";

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

import { TopBar, VotePanel, Centered } from "./ui";
import HUD from "./ui/HUD.jsx";
import useItemsSync from "./systems/useItemsSync.js";

/* ===========================
   DEBUG TOGGLES (flip these)
   =========================== */
const ENABLE = {
    effects: {
        syncPhaseToClock: true,
        meetingFromClock: true,
        meetingCountdown: true,
        dayTicker: true,
        assignRoles: true,
        processActions: true,
        voteResolution: true,
        metersDecay: true,
    },
    components: {
        topBar: true,
        canvas: true,
        hud: true,
        votePanel: true,
    }
};

/* Instrument any setter to log & avoid same-value writes */
function wrapSetter(name, setter, getCurrent) {
    return (next, ...rest) => {
        console.count(name);
        if (typeof next === "function") {
            return setter((prev) => {
                const val = next(prev);
                return Object.is(val, prev) ? prev : val;
            }, ...rest);
        } else {
            const current = getCurrent?.();
            if (getCurrent && Object.is(next, current)) return; // idempotent
            return setter(next, ...rest);
        }
    };
}

export default function App() {
    console.count("App render");

    const [ready, setReady] = useState(false);
    const players = usePlayersList(true);

    const [phase, _setPhase] = usePhase();
    const matchPhase = phase || "lobby";
    const isInLobby = matchPhase === "lobby";

    const [timer, _setTimer] = useTimer();
    const { meetingLength } = useLengths();

    const [dead, setDead] = useDead();
    const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
    const [events, _setEvents] = useEvents();
    const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

    // Wrap core setters (logs + same-value guard)
    const setPhase = useCallback(wrapSetter("setPhase@App", _setPhase, () => phase), [_setPhase, phase]);
    const setTimer = useCallback(wrapSetter("setTimer@App", _setTimer, () => timer), [_setTimer, timer]);
    const setEvents = useCallback((updater) => {
        console.count("setEvents@App");
        _setEvents(updater);
    }, [_setEvents]);

    // ONE clock subscription (values, not functions)
    const { phase: clockPhase, dayNumber, maxDays } = useGameClock((s) => ({
        phase: s.phase,
        dayNumber: s.dayNumber,
        maxDays: s.maxDays,
    }));

    const phaseLabel = matchPhase === "meeting" ? "meeting" : clockPhase;
    const inGame = matchPhase !== "lobby" && matchPhase !== "end";

    // ====== EFFECTS (toggle individually) ======
    useLobbyReady(setReady);

    if (ENABLE.effects.syncPhaseToClock)
        useSyncPhaseToClock({ ready, matchPhase, setPhase, clockPhase });

    if (ENABLE.effects.meetingFromClock)
        useMeetingFromClock({ ready, matchPhase, setPhase, timer, setTimer, meetingLength, setEvents });

    if (ENABLE.effects.meetingCountdown)
        useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents });

    if (ENABLE.effects.dayTicker)
        useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents });

    if (ENABLE.effects.assignRoles)
        useAssignCrewRoles({ ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents });

    if (ENABLE.effects.processActions)
        useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });

    if (ENABLE.effects.voteResolution)
        useMeetingVoteResolution({ ready, matchPhase, timer, players, dead, setDead, setEvents });

    if (ENABLE.effects.metersDecay)
        useMetersInitAndDailyDecay({ ready, inGame, dayNumber, power, oxygen, setPower, setOxygen, setEvents });

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
        if (!currentTeam) me.setState?.("team", "Team Alpha", true);
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
        t === "food" ? "Food Ration" :
            t === "battery" ? "Battery Pack" :
                t === "o2can" ? "O₂ Canister" :
                    t === "fuel" ? "Fuel Rod" : (t || "Item");

    const iconForType = (t) =>
        t === "food" ? "🍎" :
            t === "battery" ? "🔋" :
                t === "o2can" ? "🫧" :
                    t === "fuel" ? "🟣" : "📦";

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

    // Components toggles
    const topBar = ENABLE.components.topBar ? (
        <TopBar phase={phaseLabel} timer={timer} players={aliveCount} events={events} />
    ) : null;

    const canvas = ENABLE.components.canvas ? <GameCanvas dead={dead} /> : null;

    const hud = ENABLE.components.hud ? (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <HUD game={{
                meters: { energy: Number(power ?? 0), oxygen: Number(oxygen ?? 0) },
                me: { id: myId || "me", backpack: myBackpack, capacity: 8 },
                onDropItem: (id) => requestAction("drop", id),
                onUseItem: (id) => {
                    const t = typeById[id];
                    if (!t) return;
                    if (t === "food") requestAction("use", `eat|${id}`);
                },
                requestAction,
            }} />
        </div>
    ) : null;

    const votePanel = ENABLE.components.votePanel && matchPhase === "meeting" && !dead.includes(myId)
        ? <VotePanel dead={dead} /> : null;

    return (
        <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr" }}>
            {topBar}

            <div style={{ position: "relative" }}>
                {canvas}

                {isHost() && (
                    <div style={{ position: "absolute", top: 10, right: 10, pointerEvents: "auto", zIndex: 10 }}>
                        <TimeDebugPanel />
                    </div>
                )}

                {hud}
            </div>

            {votePanel}
        </div>
    );
}
