// src/network/playroom.js
import { insertCoin, useMultiplayerState, myPlayer, isHost } from 'playroomkit';

/**
 * Join/create a room WITHOUT Playroom's built-in lobby UI.
 * - If URL has ?r=ROOMCODE, attempt to join that room.
 * - You can share the page URL as-is; adding ?r=... keeps everyone in the same room.
 */
export async function openLobby() {
    try {
        const url = new URL(window.location.href);
        const roomCode = url.searchParams.get('r') || undefined;

        await insertCoin({
            skipLobby: true,
            roomCode,
            // maxPlayers: 12,
            // maxPlayersPerRoom: 12,
        });

        // Write room code back to URL for easy sharing (best-effort).
        if (isHost() && !roomCode) {
            const prk = (typeof window !== 'undefined' && window.playroomkit) || null;
            const getRoomCode = prk && typeof prk.getRoomCode === 'function' ? prk.getRoomCode : null;
            try {
                const code = getRoomCode ? getRoomCode() : null;
                if (code) {
                    url.searchParams.set('r', code);
                    window.history.replaceState({}, '', url.toString());
                }
            } catch { /* noop */ }
        }
    } catch (e) {
        console.error('insertCoin failed:', e);
        throw e;
    }
}

/* -------------------------------------------------------
   Global multiplayer state hooks
------------------------------------------------------- */

// Start in "lobby" so your custom <Lobby /> renders until host launches Day 1
export function usePhase() {
    return useMultiplayerState('phase', 'lobby'); // [value, setValue]
}

export function useTimer() {
    return useMultiplayerState('timer', 60); // [value, setValue]
}

/** Consolidated: 3 → 1 listener for lengths */
const LENGTHS_DEFAULTS = { dayLength: 60, meetingLength: 30, nightLength: 45 };
export function useLengths() {
    const [lengths, setLengths] = useMultiplayerState('lengths', LENGTHS_DEFAULTS);

    const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
    const dayLength = num(lengths?.dayLength, LENGTHS_DEFAULTS.dayLength);
    const meetingLength = num(lengths?.meetingLength, LENGTHS_DEFAULTS.meetingLength);
    const nightLength = num(lengths?.nightLength, LENGTHS_DEFAULTS.nightLength);

    const upd = (key) => (val, broadcast) =>
        setLengths(prev => {
            const cur = (prev && typeof prev === 'object') ? prev : LENGTHS_DEFAULTS;
            const nextVal = typeof val === 'function' ? val(num(cur[key], LENGTHS_DEFAULTS[key])) : val;
            return { ...cur, [key]: nextVal };
        }, broadcast);

    return {
        dayLength, meetingLength, nightLength,
        setDayLen: upd('dayLength'),
        setMeetLen: upd('meetingLength'),
        setNightLen: upd('nightLength'),
    };
}

/** Consolidated: 3 → 1 listener for meters */
const METERS_DEFAULTS = { oxygen: 100, power: 100, cctv: 100 };
export function useMeters() {
    const [meters, setMeters] = useMultiplayerState('meters', METERS_DEFAULTS);

    const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
    const oxygen = num(meters?.oxygen, METERS_DEFAULTS.oxygen);
    const power = num(meters?.power, METERS_DEFAULTS.power);
    const cctv = num(meters?.cctv, METERS_DEFAULTS.cctv);

    const upd = (key) => (val, broadcast) =>
        setMeters(prev => {
            const cur = (prev && typeof prev === 'object') ? prev : METERS_DEFAULTS;
            const base = num(cur[key], METERS_DEFAULTS[key]);
            const nextVal = typeof val === 'function' ? val(base) : val;
            return { ...cur, [key]: nextVal };
        }, broadcast);

    return { oxygen, power, cctv, setOxygen: upd('oxygen'), setPower: upd('power'), setCCTV: upd('cctv') };
}

export function useDead() { return useMultiplayerState('dead', []); }
export function useEvents() { return useMultiplayerState('events', []); }
export function useRolesAssigned() { return useMultiplayerState('rolesAssigned', false); }

/* -------------------------------------------------------
   Player helpers
------------------------------------------------------- */
export function setMyPos(x, y, z) {
    const p = myPlayer();
    p.setState('x', x, false);
    p.setState('y', y, false);
    p.setState('z', z, false);
}

export function getMyPos() {
    const p = myPlayer();
    return {
        x: Number(p.getState('x') ?? 0),
        y: Number(p.getState('y') ?? 0),
        z: Number(p.getState('z') ?? 0),
    };
}

/* -------------------------------------------------------
   Client → host action request
------------------------------------------------------- */
export function requestAction(type, target, value) {
    const p = myPlayer();
    const nextId = (Number(p.getState('reqId') || 0) + 1) | 0;
    p.setState('reqType', String(type), true);
    p.setState('reqTarget', String(target), true);
    p.setState('reqValue', Number(value) | 0, true);
    p.setState('reqId', nextId, true);
}

/* -------------------------------------------------------
   Host-only: append an event to the shared feed (keeps last 25)
------------------------------------------------------- */
export function hostAppendEvent(setEvents, msg) {
    if (!isHost()) return;
    setEvents(arr => {
        const next = Array.isArray(arr) ? [...arr, msg] : [msg];
        if (next.length > 25) next.splice(0, next.length - 25);
        return next;
    }, true);
}
