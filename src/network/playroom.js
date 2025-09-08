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
            skipLobby: true,        // ← key: disable Playroom default lobby
            roomCode,               // join a specific room if provided (unknown fields are ignored safely)
            // You may also set a player/room cap if you want (depends on lib version):
            // maxPlayers: 12,
            // maxPlayersPerRoom: 12,
        });

        // Optional: if we created a room and there's no ?r= in the URL,
        // try to write the room code back into the URL for easy sharing.
        // (Avoid importing getRoomCode directly; not all versions export it.)
        if (isHost() && !roomCode) {
            const prk = (typeof window !== 'undefined' && window.playroomkit) || null;
            const getRoomCode = prk && typeof prk.getRoomCode === 'function' ? prk.getRoomCode : null;
            try {
                const code = getRoomCode ? getRoomCode() : null;
                if (code) {
                    url.searchParams.set('r', code);
                    window.history.replaceState({}, '', url.toString());
                }
            } catch {
                // no-op: not all builds expose getRoomCode on window
            }
        }
    } catch (e) {
        console.error('insertCoin failed:', e);
        throw e;
    }
}

/* -------------------------------------------------------
   Global multiplayer state hooks
   (defaults supplied by hooks; no defaultStates object needed)
------------------------------------------------------- */

// Start in "lobby" so your custom <Lobby /> renders until host launches Day 1
export function usePhase() {
    return useMultiplayerState('phase', 'lobby');
}

export function useTimer() {
    return useMultiplayerState('timer', 60);
}

export function useLengths() {
    const [dayLength, setDayLen] = useMultiplayerState('dayLength', 60);
    const [meetingLength, setMeetLen] = useMultiplayerState('meetingLength', 30);
    const [nightLength, setNightLen] = useMultiplayerState('nightLength', 45);
    return { dayLength, meetingLength, nightLength, setDayLen, setMeetLen, setNightLen };
}

export function useMeters() {
    const [oxygen, setOxygen] = useMultiplayerState('oxygen', 100);
    const [power, setPower] = useMultiplayerState('power', 100);
    const [cctv, setCCTV] = useMultiplayerState('cctv', 100);
    return { oxygen, power, cctv, setOxygen, setPower, setCCTV };
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
