// src/ui/TimeDebugPanel.jsx
import React, { useEffect, useState } from 'react';
import { useGameClock, GameClockUtils } from '../systems/dayNightClock';

// Replace with your real gate: e.g., import { isHost } from 'playroomkit'
const isHost = () => true; // TODO: wire your host check

export default function TimeDebugPanel() {
  if (!isHost()) return null;

  const setPaused      = useGameClock(s => s.setPaused);
  const setPhaseDay    = useGameClock(s => s.setPhaseDay);
  const setPhaseNight  = useGameClock(s => s.setPhaseNight);
  const addMinutes     = useGameClock(s => s.addMinutes);
  const configure      = useGameClock(s => s.configure);
  const nowGameSec     = useGameClock(s => s.nowGameSec);
  const format         = useGameClock(s => s.format);

  const [clock, setClock] = useState(format());
  const [pausedLocal, setPausedLocal] = useState(false);
  const [daySec, setDaySec]     = useState(180);
  const [nightSec, setNightSec] = useState(180);

  useEffect(() => {
    let raf;
    const loop = () => {
      setClock(format());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [format]);

  const jumpTo = (hh, mm = 0) => {
    const sec = GameClockUtils.clampDay(hh * 3600 + mm * 60);
    useGameClock.getState().setClockTo(sec);
  };

  return (
    <div style={panelStyles.wrap}>
      <div style={panelStyles.row}>
        <strong>Clock</strong>
        <span>{clock}</span>
      </div>
      <div style={panelStyles.row}>
        <button onClick={() => setPhaseDay()}>Set Day</button>
        <button onClick={() => setPhaseNight()}>Set Night</button>
        <button onClick={() => addMinutes(10)}>+10m</button>
        <button onClick={() => addMinutes(-10)}>-10m</button>
      </div>
      <div style={panelStyles.row}>
        <label><input type="checkbox"
          checked={pausedLocal}
          onChange={(e) => { setPausedLocal(e.target.checked); setPaused(e.target.checked); }}
        /> Pause</label>
        <button onClick={() => jumpTo(6,0)}>Jump 06:00</button>
        <button onClick={() => jumpTo(18,0)}>Jump 18:00</button>
      </div>
      <div style={panelStyles.row}>
        <span>Day sec</span>
        <input type="number" value={daySec} onChange={(e)=>setDaySec(+e.target.value||0)} style={panelStyles.input}/>
        <span>Night sec</span>
        <input type="number" value={nightSec} onChange={(e)=>setNightSec(+e.target.value||0)} style={panelStyles.input}/>
        <button onClick={()=>{
          // Keep total 24h mapping consistent if you ever change one side
          configure({
            realDayDurationSec: daySec,
            realNightDurationSec: nightSec,
          });
          // Reset anchor to avoid time jumps
          useGameClock.setState(s => ({ ...s, anchorGameSec: s.nowGameSec(), anchorRealMs: performance.now() }));
        }}>Apply</button>
      </div>
    </div>
  );
}

const panelStyles = {
  wrap: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 9999,
    background: 'rgba(20,20,24,0.85)', color: '#fff',
    padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
    display: 'grid', gap: 8, width: 420, fontSize: 13,
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  input: { width: 80, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 6px', borderRadius: 6 },
};
