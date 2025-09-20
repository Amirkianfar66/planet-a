// src/game/effects.js
import { useEffect, useRef } from "react";
import { openLobby, hostAppendEvent } from "../network/playroom";
import { isHost } from "playroomkit";
import { spawnPointForTeam } from "../data/teamSpawns";

// ------------------- Constants & small helpers -------------------
const ROLES = ["Engineer", "Research", "StationDirector", "Officer", "Guard", "FoodSupplier"];
const clamp01 = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const isMeter = (k) => k === "oxygen" || k === "power" || k === "cctv";

// ------------------- Team Spawns -------------------
/**
 * Host-only: spawn each player at their team room once they enter the game.
 * Works for late joiners (no run-once guard); uses spawnPointForTeam(team).
 * Team can live in p.getState("team") / p.state.team / p.team; defaults to "alpha".
 */
export function useTeamSpawns({ ready, inGame, players, setEvents }) {
    useEffect(() => {
        if (!ready || !inGame || !isHost()) return;

        players.forEach((p) => {
            if (p.getState?.("spawned")) return;

            const team =
                p.getState?.("team") ??
                p.state?.team ??
                p.team ??
                "alpha";

            const spawn = spawnPointForTeam(team); // { x, y, z }
            const prev = p.state || {};
            p.setState?.({ ...prev, x: spawn.x, y: spawn.y, z: spawn.z, spawned: true }, true);

            const displayName = p.getProfile?.()?.name || "Player";
            hostAppendEvent(setEvents, `Spawned ${displayName} at team ${team}.`);
        });
    }, [ready, inGame, players, setEvents]);
}

/** When back in the lobby, clear the 'spawned' flag so next match respawns cleanly. */
export function useResetSpawnOnLobby({ matchPhase, players }) {
    useEffect(() => {
        if (matchPhase === "lobby" && isHost()) {
            players.forEach((p) => p.setState?.("spawned", false, true));
        }
    }, [matchPhase, players]);
}

// ------------------- 1) Lobby → ready -------------------
export function useLobbyReady(setReady) {
    const onceRef = useRef(false);
    useEffect(() => {
        if (onceRef.current) return;   // prevent dev double-mount duplicate
        onceRef.current = true;
        (async () => {
            await openLobby();
            setReady(true);
        })();
    }, [setReady]);
}

// ------------------- 2) Day ticker (optional) -------------------
export function useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents }) {
    const prevDayRef = useRef(dayNumber);
    useEffect(() => {
        if (!ready || !isHost() || !inGame) return;
        if (dayNumber !== prevDayRef.current) {
            hostAppendEvent(setEvents, `DAY ${dayNumber} begins.`);
            prevDayRef.current = dayNumber;
            if (dayNumber > maxDays) hostAppendEvent(setEvents, `Reached final day (${maxDays}).`);
        }
    }, [ready, inGame, dayNumber, maxDays, setEvents]);
}

// ------------------- 3) Assign crew roles (once during Day) -------------------
export function useAssignCrewRoles({
    ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents,
}) {
    useEffect(() => {
        if (!ready || !isHost() || rolesAssigned || phaseLabel !== "day") return;

        const alive = players.filter((p) => !dead.includes(p.id));
        if (alive.length < 1) return;

        let idx = 0, changed = false;
        for (const p of alive) {
            const current = p.getState?.("role");
            if (!current) {
                const role = ROLES[idx % ROLES.length];
                p.setState?.("role", role, true);
                idx++; changed = true;
            }
        }
        setRolesAssigned(true, true);
        if (changed) hostAppendEvent(setEvents, `Crew roles filled for unassigned players.`);
    }, [ready, phaseLabel, rolesAssigned, players, dead, setRolesAssigned, setEvents]);
}

// ------------------- 4) Process player actions (REPAIR only) -------------------
export function useProcessActions({
    ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents,
}) {
    const processedRef = useRef(new Map());

    useEffect(() => {
        if (!ready || !isHost() || !inGame) return;

        const applyDelta = (key, delta) => {
            if (key === "oxygen") setOxygen((v) => clamp01(v + delta), true);
            if (key === "power") setPower((v) => clamp01(v + delta), true);
            if (key === "cctv") setCCTV((v) => clamp01(v + delta), true);
        };

        const id = setInterval(() => {
            for (const p of players) {
                if (dead.includes(p.id)) continue;

                const reqId = Number(p.getState("reqId") || 0);
                const last = processedRef.current.get(p.id) || 0;
                if (reqId <= last) continue;

                const type = String(p.getState("reqType") || "");
                const target = String(p.getState("reqTarget") || "");
                const value = Number(p.getState("reqValue") || 0);

                const ok = type === "repair" && isMeter(target) && value > 0;
                const name = p.getProfile().name || "Player " + p.id.slice(0, 4);

                if (ok) {
                    applyDelta(target, value);
                    hostAppendEvent(setEvents, `${name} repaired ${target.toUpperCase()} +${value}.`);
                }
                processedRef.current.set(p.id, reqId);
            }
        }, 150);

        return () => clearInterval(id);
    }, [ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents]);
}

// ------------------- 5) Resolve meeting vote on timer end -------------------
export function useMeetingVoteResolution({
    ready, matchPhase, timer, players, dead, setDead, setEvents,
}) {
    useEffect(() => {
        if (!ready || !isHost()) return;
        if (matchPhase !== "meeting") return;
        if (Number(timer) > 0) return;

        const aliveIds = new Set(players.filter((p) => !dead.includes(p.id)).map((p) => p.id));
        const counts = new Map();
        for (const p of players) {
            if (!aliveIds.has(p.id)) continue;
            const v = String(p.getState("vote") || "");
            if (!v || v === "skip") continue;
            counts.set(v, (counts.get(v) || 0) + 1);
        }

        let target = "", top = 0;
        for (const [id, c] of counts.entries()) {
            if (c > top) { top = c; target = id; }
            else if (c === top) { target = ""; }
        }

        if (target && aliveIds.has(target)) {
            const ejected = players.find((p) => p.id === target);
            const name = ejected ? (ejected.getProfile().name || "Player " + ejected.id.slice(0, 4)) : "Unknown";
            const role = ejected ? String(ejected.getState("role") || "Crew") : "Crew";
            setDead(Array.from(new Set([...dead, target])), true);
            hostAppendEvent(setEvents, `Ejected ${name} (${role}).`);
        } else {
            hostAppendEvent(setEvents, "Vote ended: no ejection.");
        }
    }, [ready, matchPhase, timer, players, dead, setDead, setEvents]);
}

// ------------------- 6) Meters init & daily decay -------------------
/** Initialize meters to 100% on Day 1, then halve Energy at the start of each new day (host-only). */
export function useMetersInitAndDailyDecay({
    ready,
    inGame,
    dayNumber,
    power,
    oxygen,
    setPower,
    setOxygen,
    setEvents,
}) {
    const lastProcessedDayRef = useRef(0);

    useEffect(() => {
        if (!ready || !inGame || !isHost()) return;

        // avoid multiple runs for the same day
        if (dayNumber === lastProcessedDayRef.current) return;

        if (dayNumber === 1) {
            // boot-up defaults
            if (oxygen !== 100) setOxygen(100, true);
            if (power !== 100) setPower(100, true);
            hostAppendEvent(setEvents, "Systems online — Oxygen 100%, Energy 100%");
        } else if (dayNumber > 1) {
            // halve energy once at the start of each new day
            const base = typeof power === "number" ? power : 100;
            const next = Math.max(0, Math.round(base * 0.5));
            if (next !== base) {
                setPower(next, true);
                hostAppendEvent(setEvents, `Day ${dayNumber}: Energy reduced by 50% → ${next}%`);
            }
        }

        lastProcessedDayRef.current = dayNumber;
    }, [ready, inGame, dayNumber, power, oxygen, setPower, setOxygen, setEvents]);
}
