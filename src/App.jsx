// src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
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

// effects
import {
    useLobbyReady,
    useDayTicker,
    useAssignCrewRoles,
    useProcessActions,
    // ❌ useMeetingVoteResolution — keep disabled to avoid double-resolve
    useMetersInitAndDailyDecay
} from "./game/effects";
import {
    useSyncPhaseToClock,
    useMeetingFromClock,
    useMeetingCountdown,
} from "./game/timePhaseEffects";

// UI
import { TopBar, VotePanel, Centered, VoteResultsPanel } from "./ui";
import HUD from "./ui/HUD.jsx";

// items state (source of truth for floor + held items)
import useItemsSync from "./systems/useItemsSync.js";

// 🔹 NEW: meeting room bounds + my position getter
import { MEETING_ROOM_AABB } from "./map/deckA";
import { getMyPos } from "./network/playroom";

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

    // gameplay effects
    useLobbyReady(setReady);
    useSyncPhaseToClock({ ready, matchPhase, setPhase });
    useMeetingFromClock({ ready, matchPhase, setPhase, timer, setTimer, meetingLength, setEvents });
    useMeetingCountdown({ ready, matchPhase, timer, setTimer, setPhase, setEvents });
    useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents });
    useAssignCrewRoles({ ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents });
    useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });
    // useMeetingVoteResolution — intentionally not used here
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

    // Give the player a name only (do NOT auto-assign team here)
    useEffect(() => {
        if (!ready) return;
        const me = myPlayer();
        if (!me) return;
        if (!me.getState?.("name")) {
            const fallback = me?.profile?.name || me?.name || (me.id?.slice(0, 6) ?? "Player");
            me.setState?.("name", fallback, true);
        }
    }, [ready]);

    // (Optional) host-only quick launch
    function launchGame() {
        if (!isHost()) return;
        setPhase("day", true);
        hostAppendEvent(setEvents, "Mission launch — Day 1");
    }

    // === Item presentation for HUD (updated types) ===
    const TYPE_COLORS = {
        food: "#22c55e",
        fuel: "#a855f7",
        protection: "#f59e0b",
        cure_red: "#ef4444",
        cure_blue: "#3b82f6",
        battery: "#2dd4bf",
        o2can: "#9bd1ff",
        fuel_legacy: "#a78bfa",
    };

    const labelFromType = (t) => {
        switch (t) {
            case "food": return "Food Ration";
            case "fuel": return "Fuel Rod";
            case "protection": return "Protection Badge";
            case "cure_red": return "Cure — Red";
            case "cure_blue": return "Cure — Blue";
            case "battery": return "Battery Pack";
            case "o2can": return "O₂ Canister";
            default: return t || "Item";
        }
    };

    const iconForType = (t) => {
        switch (t) {
            case "food": return "🍏";
            case "fuel": return "🟣";
            case "protection": return "🛡️";
            case "cure_red": return "🟥";
            case "cure_blue": return "🟦";
            case "battery": return "🔋";
            case "o2can": return "🫧";
            default: return "📦";
        }
    };

    const { items } = useItemsSync();
    const meP = myPlayer();
    const myId = meP?.id;

    const myBackpack = useMemo(() => {
        if (!myId) return [];
        return (items || [])
            .filter((it) => it.holder === myId)
            .map((it) => ({
                id: it.id,
                name: labelFromType(it.type),
                qty: 1,
                icon: iconForType(it.type),
                type: it.type,
                color: TYPE_COLORS[it.type] || "#9ca3af",
            }));
    }, [items, myId]);

    const typeById = useMemo(() => {
        const m = {};
        for (const it of myBackpack) m[it.id] = it.type;
        return m;
    }, [myBackpack]);

    const aliveCount = players.filter((p) => !dead.includes(p.id)).length;

    // Hide VotePanel when player has already voted
    const hasVoted = Boolean(meP?.getState?.("vote"));
    // Also treat locally-flagged dead as dead (extra safety)
    const amDead = dead.includes(myId) || Boolean(meP?.getState?.("dead"));

    // 🔹 NEW: detect whether THIS player is inside the meeting room
    const [inMeetingRoom, setInMeetingRoom] = useState(false);
    useEffect(() => {
        let raf;
        const a = MEETING_ROOM_AABB;
        const loop = () => {
            try {
                const pos = (typeof getMyPos === "function") ? getMyPos() : null;
                const inside = !!(a && pos &&
                    pos.x >= a.minX && pos.x <= a.maxX &&
                    pos.z >= a.minZ && pos.z <= a.maxZ);
                setInMeetingRoom(prev => (prev === inside ? prev : inside));
            } catch {
                // swallow
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    if (!ready) return <Centered><h2>Opening lobby…</h2></Centered>;
    if (isInLobby) return <Lobby />;

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
            if (t === "food") {
                requestAction("use", `eat|${id}`);
            }
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

            {/* 🔒 Only show voting UI if: meeting phase, alive, not yet voted, and INSIDE meeting room */}
            {matchPhase === "meeting" && !amDead && !hasVoted && inMeetingRoom && (
                <VotePanel dead={dead} />
            )}
        </div>
    );
}
