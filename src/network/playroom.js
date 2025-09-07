import { insertCoin, useMultiplayerState, myPlayer, isHost } from 'playroomkit';

export async function openLobby() {
  await insertCoin({
    maxPlayersPerRoom: 12,
    defaultStates: {
      phase: 'day',
      timer: 60,
      dayLength: 60,
      meetingLength: 30,
      nightLength: 45,
      oxygen: 100,
      power: 100,
      cctv: 100,
      dead: [],
      events: [],
      rolesAssigned: false
    },
    defaultPlayerStates: {
      x: 0, y: 0, z: 0,
      name: '',
      role: 'crew',
      vote: '',
      reqId: 0,
      reqType: '',
      reqTarget: '',
      reqValue: 0
    },
  });
}

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
  const [power, setPower]   = useMultiplayerState('power', 100);
  const [cctv, setCCTV]     = useMultiplayerState('cctv', 100);
  return { oxygen, power, cctv, setOxygen, setPower, setCCTV };
}
export function useDead()   { return useMultiplayerState('dead', []); }
export function useEvents() { return useMultiplayerState('events', []); }
export function useRolesAssigned() { return useMultiplayerState('rolesAssigned', false); }

export function setMyPos(x, y, z) {
  myPlayer().setState('x', x, false);
  myPlayer().setState('y', y, false);
  myPlayer().setState('z', z, false);
}
export function getMyPos() {
  const p = myPlayer();
  return { x: Number(p.getState('x') ?? 0), y: Number(p.getState('y') ?? 0), z: Number(p.getState('z') ?? 0) };
}

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
