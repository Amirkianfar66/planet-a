// src/network/playroom.js
import { insertCoin, useMultiplayerState, myPlayer, isHost } from 'playroomkit';

// Keep options minimal to avoid version-specific fields
export async function openLobby() {
    try {
        await insertCoin({
            // Some versions expect maxPlayers, others maxPlayersPerRoom —
            // remove both to use Playroom defaults if either causes trouble.
            // If you want to set it explicitly, try ONE of these:
            // maxPlayers: 12,
            // maxPlayersPerRoom: 12,
        });
    } catch (e) {
        console.error('insertCoin failed:', e);
        throw e;
    }
}

// ---- Global state hooks (defaults supplied by hooks, so no defaultStates needed) ----
export function usePhase() { return useMultiplayerState('phase', 'day'); }
export function useTimer() { return useMultiplayerState('timer', 60); }
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

// ---- Player helpers ----
export function setMyPos(x, y, z) {
    myPlayer().setState('x', x, false);
    myPlayer().setState('y', y, false);
    myPlayer().setState('z', z, false);
}
export function getMyPos() {
    const p = myPlayer();
    return {
        x: Number(p.getState('x') ?? 0),
        y: Number(p.getState('y') ?? 0),
        z: Number(p.getState('z') ?? 0),
    };
}

// Client → host action request (unchanged API for the rest of the app)
export function requestAction(type, target, value) {
    const p = myPlayer();
    const nextId = (Number(p.getState('reqId') || 0) + 1) | 0;
    p.setState('reqType', String(type), true);
    p.setState('reqTarget', String(target), true);
    p.setState('reqValue', Number(value) | 0, true);
    p.setState('reqId', nextId, true);
}

export function hostAppendEvent(setEvents, msg) {
    if (!isHost()) return;
    setEvents(arr => {
        const next = Array.isArray(arr) ? [...arr, msg] : [msg];
        if (next.length > 25) next.splice(0, next.length - 25);
        return next;
    }, true);
}
