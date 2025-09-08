// src/game/effects.js
import { useEffect, useRef } from "react";
import { openLobby, hostAppendEvent } from "../network/playroom";
import { isHost } from "playroomkit";

const ROLES = ["Engineer", "Research", "StationDirector", "Officer", "Guard", "FoodSupplier"];
const clamp01 = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const isMeter = (k) => k === "oxygen" || k === "power" || k === "cctv";

/* 1) Lobby → ready */
export function useLobbyReady(setReady) {
    useEffect(() => { (async () => { await openLobby(); setReady(true); })(); }, [setReady]);
}

/* 2) Day ticker (optional) */
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

/* 3) Assign thematic crew roles (once, during Day) */
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

/* 4) Process player actions (REPAIR only for now) */
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

/* 5) Resolve voting when meeting timer hits 0
   (meeting start/stop is handled in timePhaseEffects.js) */
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
