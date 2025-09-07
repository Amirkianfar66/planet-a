import React, { useEffect, useMemo, useRef, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import {
  openLobby,
  usePhase, useTimer, useLengths,
  useDead, useEvents, useMeters, useRolesAssigned,
  hostAppendEvent, requestAction
} from './network/playroom';
import { isHost, myPlayer, usePlayersList } from 'playroomkit';

export default function App() {
  const [ready, setReady] = useState(false);
  const players = usePlayersList(true);

  const [phase, setPhase] = usePhase();
  const [timer, setTimer] = useTimer();
  const { dayLength, meetingLength, nightLength } = useLengths();
  const [dead, setDead] = useDead();
  const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
  const [events, setEvents] = useEvents();
  const [rolesAssigned, setRolesAssigned] = useRolesAssigned();

  // Boot lobby
  useEffect(() => { (async () => { await openLobby(); setReady(true); })(); }, []);

  // Host: tick timer every second
  useEffect(() => {
    if (!ready || !isHost()) return;
    const id = setInterval(() => {
      setTimer(t => Math.max(0, Number(t) - 1), true);
    }, 1000);
    return () => clearInterval(id);
  }, [ready, setTimer]);

  // Host: assign roles once at first Day
  useEffect(() => {
    if (!ready || !isHost()) return;
    if (rolesAssigned) return;
    if (phase !== 'day') return;
    const alive = players.filter(p => !dead.includes(p.id));
    if (alive.length < 3) return;

    // Pick infected: 2 if >=6 players, else 1
    const infectCount = alive.length >= 6 ? 2 : 1;
    const shuffled = [...alive].sort(() => Math.random() - 0.5);
    const infectedIds = new Set(shuffled.slice(0, infectCount).map(p => p.id));

    for (const p of players) {
      p.setState('role', infectedIds.has(p.id) ? 'infected' : 'crew', true);
    }
    setRolesAssigned(true, true);
    hostAppendEvent(setEvents, `Roles assigned: ${infectCount} infected (secret).`);
  }, [ready, phase, rolesAssigned, players, dead, setRolesAssigned, setEvents]);

  // Host: process action requests (repair/sabotage)
  const processedRef = useRef(new Map()); // playerId -> last reqId processed
  useEffect(() => {
    if (!ready || !isHost()) return;

    const applyDelta = (key, delta) => {
      if (key === 'oxygen') setOxygen(v => clamp01(v + delta), true);
      if (key === 'power')  setPower(v => clamp01(v + delta), true);
      if (key === 'cctv')   setCCTV(v => clamp01(v + delta), true);
    };

    const id = setInterval(() => {
      for (const p of players) {
        if (dead.includes(p.id)) continue;

        const reqId = Number(p.getState('reqId') || 0);
        const last = processedRef.current.get(p.id) || 0;
        if (reqId <= last) continue; // nothing new

        const type   = String(p.getState('reqType') || '');
        const target = String(p.getState('reqTarget') || '');
        const value  = Number(p.getState('reqValue') || 0);
        const role   = String(p.getState('role') || 'crew');

        let ok = false, reason = '';
        // Simple rules:
        // - Day: repair only
        // - Night: repair (allowed) or sabotage (infected only)
        if (phase === 'day') {
          if (type === 'repair' && isMeter(target) && value > 0) ok = true;
          else reason = 'Only repair allowed during Day';
        } else if (phase === 'night') {
          if (type === 'repair' && isMeter(target) && value > 0) ok = true;
          else if (type === 'sabotage' && isMeter(target) && value < 0 && role === 'infected') ok = true;
          else reason = 'Invalid night action';
        } else {
          reason = 'No actions during Meeting';
        }

        const name = p.getProfile().name || ('Player ' + p.id.slice(0, 4));
        if (ok) {
          applyDelta(target, value);
          const verb = value > 0 ? 'repaired' : 'sabotaged';
          hostAppendEvent(setEvents, `${name} ${verb} ${target.toUpperCase()} ${value > 0 ? '+' : ''}${value}.`);
        } else {
          // Optional: log rejected actions (comment out if noisy)
          // hostAppendEvent(setEvents, `${name} attempted invalid action: ${type} ${target} ${value} (${reason})`);
        }

        processedRef.current.set(p.id, reqId);
      }
    }, 150);
    return () => clearInterval(id);
  }, [ready, players, phase, dead, setOxygen, setPower, setCCTV, setEvents]);

  // Host: phase transitions + vote tally (from your earlier version)
  useEffect(() => {
    if (!ready || !isHost()) return;
    if (Number(timer) > 0) return;

    if (phase === 'day') {
      setPhase('meeting', true);
      setTimer(meetingLength, true);
      hostAppendEvent(setEvents, 'Meeting started.');
      return;
    }
    if (phase === 'meeting') {
      // Tally votes from alive players
      const aliveIds = new Set(players.filter(p => !dead.includes(p.id)).map(p => p.id));
      const counts = new Map(); // targetId -> count
      for (const p of players) {
        if (!aliveIds.has(p.id)) continue;
        const v = String(p.getState('vote') || '');
        if (!v || v === 'skip') continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      let target = '';
      let top = 0;
      for (const [id, c] of counts.entries()) {
        if (c > top) { top = c; target = id; }
        else if (c === top) { target = ''; } // tie
      }
      if (target && aliveIds.has(target)) {
        const ejected = players.find(p => p.id === target);
        const name = ejected ? (ejected.getProfile().name || ('Player ' + ejected.id.slice(0, 4))) : 'Unknown';
        const role = ejected ? String(ejected.getState('role') || 'crew') : 'crew';
        const next = Array.from(new Set([ ...dead, target ]));
        setDead(next, true);
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
  }, [ready, timer, phase, meetingLength, nightLength, dayLength, players, dead, setDead, setPhase, setTimer, setEvents]);

  if (!ready) {
    return <Centered><h2>Opening lobby… (host clicks Launch)</h2></Centered>;
  }

  return (
    <div style={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <TopBar phase={phase} timer={timer} players={players.filter(p => !dead.includes(p.id)).length} />
      <div style={{ position: 'relative' }}>
        <GameCanvas dead={dead} />
        <MetersPanel
          phase={phase}
          oxygen={oxygen} power={power} cctv={cctv}
          onRepair={(m) => requestAction('repair', m, +10)}
          onSabotage={(m) => requestAction('sabotage', m, -10)}
        />
        <EventsFeed events={events} />
      </div>
      {phase === 'meeting' && !dead.includes(myPlayer().id) && <VotePanel dead={dead} />}
    </div>
  );
}

function TopBar({ phase, timer, players }) {
  const mm = String(Math.floor(Number(timer) / 60)).padStart(2, '0');
  const ss = String(Number(timer) % 60).padStart(2, '0');
  return (
    <div style={{
      display: 'flex', gap: 16, alignItems: 'center', padding: '8px 12px',
      background: '#0e1116', color: 'white', fontFamily: 'ui-sans-serif', fontSize: 14
    }}>
      <strong>Planet A — Prototype</strong>
      <span>| Phase: <b>{String(phase)}</b></span>
      <span>| Time: <b>{mm}:{ss}</b></span>
      <span>| Alive: <b>{players}</b></span>
      <span style={{ marginLeft: 'auto', opacity: 0.7 }}>you are: {myPlayer().getProfile().name || 'Anon'}</span>
    </div>
  );
}

function MetersPanel({ phase, oxygen, power, cctv, onRepair, onSabotage }) {
  const me = myPlayer();
  const role = String(me.getState('role') || 'crew');
  const canRepair = phase === 'day' || phase === 'night';
  const canSabotage = phase === 'night' && role === 'infected';

  const Bar = ({ label, value }) => (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label} — {value}%</div>
      <div style={{ width: 200, height: 10, background: '#2a3242', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: label === 'CCTV' ? '#7dd3fc' : (label === 'Power' ? '#a7f3d0' : '#fca5a5')
        }} />
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10,
      background: 'rgba(14,17,22,0.9)', border: '1px solid #2a3242',
      padding: 10, borderRadius: 10, display: 'grid', gap: 10, color: 'white'
    }}>
      <Bar label="Oxygen" value={Number(oxygen)} />
      <Bar label="Power"  value={Number(power)} />
      <Bar label="CCTV"   value={Number(cctv)} />

      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button disabled={!canRepair} onClick={() => onRepair('oxygen')}>Repair O2 +10</button>
        <button disabled={!canRepair} onClick={() => onRepair('power')}>Repair Power +10</button>
        <button disabled={!canRepair} onClick={() => onRepair('cctv')}>Repair CCTV +10</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={!canSabotage} onClick={() => onSabotage('oxygen')}>Sabotage O2 −10</button>
        <button disabled={!canSabotage} onClick={() => onSabotage('power')}>Sabotage Power −10</button>
        <button disabled={!canSabotage} onClick={() => onSabotage('cctv')}>Sabotage CCTV −10</button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
        Your role: <b>{role}</b> {role === 'infected' ? '🤫' : ''}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>
        {phase === 'day' ? 'Day: Repair only' : phase === 'night' ? 'Night: Repair or (Infected) Sabotage' : 'Meeting: Vote'}
      </div>
    </div>
  );
}

function EventsFeed({ events }) {
  return (
    <div style={{
      position: 'absolute', left: 10, bottom: 10, width: 420,
      background: 'rgba(14,17,22,0.85)', border: '1px solid #2a3242', color: 'white',
      padding: 10, borderRadius: 10, fontFamily: 'ui-sans-serif', fontSize: 12, lineHeight: 1.3
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
  const alive = useMemo(() => players.filter(p => !dead.includes(p.id)), [players, dead]);
  const me = myPlayer();
  const myVote = String(me.getState('vote') || '');
  const choose = (id) => me.setState('vote', id || 'skip', true);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'rgba(0,0,0,0.5)', color: 'white', fontFamily: 'ui-sans-serif'
    }}>
      <div style={{ background: '#141922', padding: 16, borderRadius: 10, width: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Meeting — Vote</h3>
          <small style={{ opacity: 0.7 }}>select a suspect</small>
        </div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
          {alive.map(p => {
            const name = p.getProfile().name || ('Player ' + p.id.slice(0, 4));
            const selected = myVote === p.id;
            return (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: selected ? '2px solid #6ee7ff' : '1px solid #2a3242',
                  background: selected ? '#0e2a33' : '#1a2230',
                  color: 'white'
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
              background: myVote === 'skip' ? '#2a1a1a' : '#1f1a1a', color: '#ffb4b4'
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
  return <div style={{ display: 'grid', placeItems: 'center', height: '100dvh', fontFamily: 'sans-serif' }}>{children}</div>;
}

// helpers
function isMeter(key) { return key === 'oxygen' || key === 'power' || key === 'cctv'; }
function clamp01(v) { v = Number(v) || 0; return Math.max(0, Math.min(100, v)); }
