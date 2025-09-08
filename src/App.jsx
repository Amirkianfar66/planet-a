// src/App.jsx
import React, { useMemo, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import {
  openLobby, usePhase, useTimer, useLengths,
  useDead, useEvents, useMeters, useRolesAssigned,
  requestAction,
} from './network/playroom';
import { isHost, myPlayer, usePlayersList } from 'playroomkit';

// HUD + Debug
import DayNightHUD from './ui/DayNightHUD';
import TimeDebugPanel from './ui/TimeDebugPanel';
import { useGameClock } from './systems/dayNightClock';
import Lobby from './components/Lobby';

// ✅ NEW: import game effects
import {
  useLobbyReady,
  usePhaseCountdown,
  useDayTicker,
  useAssignCrewRoles,
  useProcessActions,
  usePhaseTransitions,
} from './game/effects';

export default function App() {
  const [ready, setReady] = useState(false);
  const players = usePlayersList(true);

  // Core state from your playroom hooks
  const [phase, setPhase] = usePhase();                      // 'day' | 'meeting' | 'night'
  const inGame = phase === 'day' || phase === 'meeting' || phase === 'night';

  const [timer, setTimer] = useTimer();
  const { dayLength, meetingLength, nightLength } = useLengths();

  const [dead, setDead] = useDead();
  const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
  const [events, setEvents] = useEvents();
  const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

  // Day counter (from the 24h clock system)
  const dayNumber = useGameClock((s) => s.dayNumber);
  const maxDays   = useGameClock((s) => s.maxDays);

  /* ------------------------------
     Wire up “effects” in one-liners
  ------------------------------ */
  useLobbyReady(setReady);
  usePhaseCountdown({ ready, inGame, setTimer });
  useDayTicker({ ready, inGame, dayNumber, maxDays, setEvents });
  useAssignCrewRoles({ ready, phase, rolesAssigned, players, dead, setRolesAssigned, setEvents });
  useProcessActions({ ready, inGame, players, dead, setOxygen, setPower, setCCTV, setEvents });
  usePhaseTransitions({
    ready, timer, phase,
    meetingLength, nightLength, dayLength,
    players, dead, setDead, setPhase, setTimer, setEvents,
  });

  /* ------------------------------
     UI
  ------------------------------ */
  if (!ready)   return <Centered><h2>Opening lobby…</h2></Centered>;
  if (!inGame)  return <Lobby />;

  return (
    <div style={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <TopBar phase={phase} timer={timer} players={players.filter(p => !dead.includes(p.id)).length} />
      <div style={{ position: 'relative' }}>
        <GameCanvas dead={dead} />

        {/* 24h HUD */}
        <DayNightHUD />

        {/* Host-only time debug */}
        {isHost() && <TimeDebugPanel />}

        <MetersPanel
          phase={phase}
          oxygen={oxygen}
          power={power}
          cctv={cctv}
          onRepair={(m) => requestAction('repair', m, +10)}
        />

        <EventsFeed events={events} />
      </div>

      {phase === 'meeting' && !dead.includes(myPlayer().id) && <VotePanel dead={dead} />}
    </div>
  );
}

/* ------------------------------
   UI bits (unchanged)
------------------------------ */
function TopBar({ phase, timer, players }) {
  const dayNumber = useGameClock((s) => s.dayNumber);
  const maxDays   = useGameClock((s) => s.maxDays);
  const mm = String(Math.floor(Number(timer) / 60)).padStart(2, '0');
  const ss = String(Number(timer) % 60).padStart(2, '0');
  return (
    <div style={{
      display: 'flex', gap: 16, alignItems: 'center', padding: '8px 12px',
      background: '#0e1116', color: 'white', fontFamily: 'ui-sans-serif', fontSize: 14,
    }}>
      <strong>Planet A — Prototype</strong>
      <span>| Day: <b>DAY {dayNumber}/{maxDays}</b></span>
      <span>| Phase: <b>{String(phase)}</b></span>
      <span>| Time: <b>{mm}:{ss}</b></span>
      <span>| Alive: <b>{players}</b></span>
      <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
        you are: {myPlayer().getProfile().name || 'Anon'}
      </span>
    </div>
  );
}

function MetersPanel({ phase, oxygen, power, cctv, onRepair }) {
  const me = myPlayer();
  const role = String(me.getState('role') || 'Crew');

  const Bar = ({ label, value }) => (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label} — {value}%</div>
      <div style={{ width: 200, height: 10, background: '#2a3242', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: label === 'CCTV' ? '#7dd3fc' : (label === 'Power' ? '#a7f3d0' : '#fca5a5'),
        }} />
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, background: 'rgba(14,17,22,0.9)',
      border: '1px solid #2a3242', padding: 10, borderRadius: 10,
      display: 'grid', gap: 10, color: 'white',
    }}>
      <Bar label="Oxygen" value={Number(oxygen)} />
      <Bar label="Power"  value={Number(power)} />
      <Bar label="CCTV"   value={Number(cctv)} />

      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={() => onRepair('oxygen')}>Repair O₂ +10</button>
        <button onClick={() => onRepair('power')}>Repair Power +10</button>
        <button onClick={() => onRepair('cctv')}>Repair CCTV +10</button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>Your role: <b>{role}</b></div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>
        {phase === 'day'
          ? 'Day: Repair systems'
          : phase === 'night'
            ? 'Night: Repair (no sabotage in this build)'
            : 'Meeting: Vote'}
      </div>
    </div>
  );
}

function EventsFeed({ events }) {
  return (
    <div style={{
      position: 'absolute', left: 10, bottom: 10, width: 420,
      background: 'rgba(14,17,22,0.85)', border: '1px solid #2a3242',
      color: 'white', padding: 10, borderRadius: 10, fontFamily: 'ui-sans-serif',
      fontSize: 12, lineHeight: 1.3,
    }}>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>Events</div>
      <div style={{ display: 'grid', gap: 4, maxHeight: 160, overflow: 'auto' }}>
        {(Array.isArray(events) ? events : []).map((e, i) => <div key={i}>• {String(e)}</div>)}
      </div>
    </div>
  );
}

function VotePanel({ dead }) {
  const players = usePlayersList(true);
  const alive = useMemo(() => players.filter((p) => !dead.includes(p.id)), [players, dead]);
  const me = myPlayer();
  const myVote = String(me.getState('vote') || '');
  const choose = (id) => me.setState('vote', id || 'skip', true);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'rgba(0,0,0,0.5)', color: 'white', fontFamily: 'ui-sans-serif',
    }}>
      <div style={{ background: '#141922', padding: 16, borderRadius: 10, width: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Meeting — Vote</h3>
          <small style={{ opacity: 0.7 }}>select a suspect</small>
        </div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
          {alive.map((p) => {
            const name = p.getProfile().name || 'Player ' + p.id.slice(0, 4);
            const selected = myVote === p.id;
            return (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                  border: selected ? '2px solid #6ee7ff' : '1px solid #2a3242',
                  background: selected ? '#0e2a33' : '#1a2230', color: 'white',
                }}
              >
                {name}
              </button>
            );
          })}
          <button
            onClick={() => choose('skip')}
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid #2a3242',
              background: myVote === 'skip' ? '#2a1a1a' : '#1f1a1a', color: '#ffb4b4',
            }}
          >
            Skip vote
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100dvh', fontFamily: 'sans-serif' }}>
      {children}
    </div>
  );
}
