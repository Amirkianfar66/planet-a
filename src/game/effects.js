// src/game/effects.js
import { useEffect, useRef } from 'react';
import { openLobby, hostAppendEvent } from '../network/playroom';
import { isHost } from 'playroomkit';

/* ------------------------------
   Shared helpers / constants
------------------------------ */
const ROLES = [
  'Engineer',
  'Research',
  'Station Director',
  'Officer',
  'Guard',
  'Food Supplier',
];

const isMeter = (k) => k === 'oxygen' || k === 'power' || k === 'cctv';
const clamp01 = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/* ------------------------------
   1) Lobby bootstrap → ready
------------------------------ */
export function useLobbyReady(setReady) {
  useEffect(() => {
    (async () => {
      await openLobby();
      setReady(true);
    })();
  }, [setReady]);
}

/* ------------------------------
   2) Host: 1s phase countdown
------------------------------ */
export function usePhaseCountdown({ ready, inGame, setTimer }) {
  useEffect(() => {
    if (!ready || !isHost() || !inGame) return;
    const id = setInterval(() => {
      setTimer((t) => Math.max(0, Number(t) - 1), true);
    }, 1000);
    return () => clearInterval(id);
  }, [ready, inGame, setTimer]);
}

/* ----------------------------------------------------------
   3) Host: Day ticker (“DAY X begins.”) + optional end check
---------------------------------------------------------- */
export function useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents }) {
  const prevDayRef = useRef(dayNumber);

  useEffect(() => {
    if (!ready || !isHost() || !inGame) return;

    if (dayNumber !== prevDayRef.current) {
      hostAppendEvent(setEvents, `DAY ${dayNumber} begins.`);
      prevDayRef.current = dayNumber;

      if (dayNumber > maxDays) {
        hostAppendEvent(setEvents, `Reached final day (${maxDays}).`);
        // Optional: end game here if you want
        // setPhase('end', true); setTimer(0, true);
      }
    }
  }, [ready, inGame, dayNumber, maxDays, setEvents]);
}

/* ----------------------------------------------------------
   4) Host: Assign NON-infected roles (once, on first Day)
---------------------------------------------------------- */
export function useAssignCrewRoles({
  ready, phase, rolesAssigned, players, dead,
  setRolesAssigned, setEvents,
}) {
  useEffect(() => {
    if (!ready || !isHost() || rolesAssigned || phase !== 'day') return;

    const alive = players.filter((p) => !dead.includes(p.id));
    if (alive.length < 1) return;

    let idx = 0;
    let changed = false;

    alive.forEach((p) => {
      const current = p.getState?.('role');
      if (!current) {
        const role = ROLES[idx % ROLES.length];
        p.setState?.('role', role, true);
        idx++;
        changed = true;
      }
    });

    setRolesAssigned(true, true); // mark done regardless
    if (changed) hostAppendEvent(setEvents, `Crew roles filled for unassigned players.`);
  }, [ready, phase, rolesAssigned, players, dead, setRolesAssigned, setEvents]);
}

/* ----------------------------------------------------------
   5) Host: Process player actions (REPAIR only for now)
---------------------------------------------------------- */
export function useProcessActions({
  ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents,
}) {
  const processedRef = useRef(new Map());

  useEffect(() => {
    if (!ready || !isHost() || !inGame) return;

    const applyDelta = (key, delta) => {
      if (key === 'oxygen') setOxygen((v) => clamp01(v + delta), true);
      if (key === 'power')  setPower((v)  => clamp01(v + delta), true);
      if (key === 'cctv')   setCCTV((v)   => clamp01(v + delta), true);
    };

    const id = setInterval(() => {
      for (const p of players) {
        if (dead.includes(p.id)) continue;

        const reqId = Number(p.getState('reqId') || 0);
        const last  = processedRef.current.get(p.id) || 0;
        if (reqId <= last) continue;

        const type   = String(p.getState('reqType')   || '');
        const target = String(p.getState('reqTarget') || '');
        const value  = Number(p.getState('reqValue')  || 0);

        // For now: allow REPAIR only (no sabotage)
        const ok = type === 'repair' && isMeter(target) && value > 0;

        const name = p.getProfile().name || 'Player ' + p.id.slice(0, 4);
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

/* ----------------------------------------------------------
   6) Host: Phase transitions (day ⇄ meeting ⇄ night)
---------------------------------------------------------- */
export function usePhaseTransitions({
  ready, timer, phase,
  meetingLength, nightLength, dayLength,
  players, dead,
  setDead, setPhase, setTimer, setEvents,
}) {
  useEffect(() => {
    if (!ready || !isHost() || Number(timer) > 0) return;

    if (phase === 'day') {
      setPhase('meeting', true);
      setTimer(meetingLength, true);
      hostAppendEvent(setEvents, 'Meeting started.');
      return;
    }

    if (phase === 'meeting') {
      // Simple vote resolution
      const aliveIds = new Set(players.filter((p) => !dead.includes(p.id)).map((p) => p.id));
      const counts = new Map();
      for (const p of players) {
        if (!aliveIds.has(p.id)) continue;
        const v = String(p.getState('vote') || '');
        if (!v || v === 'skip') continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      let target = '', top = 0;
      for (const [id, c] of counts.entries()) {
        if (c > top) { top = c; target = id; }
        else if (c === top) { target = ''; }
      }

      if (target && aliveIds.has(target)) {
        const ejected = players.find((p) => p.id === target);
        const name = ejected ? (ejected.getProfile().name || 'Player ' + ejected.id.slice(0, 4)) : 'Unknown';
        const role = ejected ? String(ejected.getState('role') || 'Crew') : 'Crew';
        setDead(Array.from(new Set([...dead, target])), true);
        hostAppendEvent(setEvents, `Ejected ${name} (${role}).`);
      } else {
        hostAppendEvent(setEvents, 'Vote ended: no ejection.');
      }

      setPhase('night', true);
      setTimer(nightLength, true);
      hostAppendEvent(setEvents, 'Night falls…');
      return;
    }

    if (phase === 'night') {
      setPhase('day', true);
      setTimer(dayLength, true);
      hostAppendEvent(setEvents, 'Morning: new day begins.');
      return;
    }
  }, [
    ready, timer, phase,
    meetingLength, nightLength, dayLength,
    players, dead,
    setDead, setPhase, setTimer, setEvents,
  ]);
}
