import React, { useEffect, useRef, useState } from 'react';
import { useGameClock } from '../systems/dayNightClock';
// Replace with your actual host gate (e.g. from playroomkit)
const isHost = () => true;

export default function TimeDebugPanel() {
    if (!isHost()) return null;

    const setPaused = useGameClock(s => s.setPaused);
    const setPhaseDay = useGameClock(s => s.setPhaseDay);
    const setPhaseNight = useGameClock(s => s.setPhaseNight);
    const addMinutes = useGameClock(s => s.addMinutes);
    const configure = useGameClock(s => s.configure);
    const nowGameSec = useGameClock(s => s.nowGameSec);
    const format = useGameClock(s => s.format);

    // 👇 NEW: day state
    const dayNumber = useGameClock(s => s.dayNumber);
    const maxDays = useGameClock(s => s.maxDays);
    const incrementDay = useGameClock(s => s.incrementDay);
    const setDayNumber = useGameClock(s => s.setDayNumber);
    const dayStartHour = useGameClock(s => s.dayStartHour);

    const [clock, setClock] = useState(format());
    const [pausedLocal, setPausedLocal] = useState(false);
    const [daySec, setDaySec] = useState(180);
    const [nightSec, setNightSec] = useState(180);

    // Keep the displayed clock fresh
    useEffect(() => {
        let raf;
        const loop = () => {
            setClock(format());
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [format]);

    // 👇 NEW: auto-increment Day when we cross start-of-day (dayStartHour:00)
    const prevSecRef = useRef(nowGameSec());
    useEffect(() => {
        let raf;
        const dayStartSec = dayStartHour * 3600;

        const crossed = (from, to, target) => {
            if (to === from) return false;
            return (to > from)
                ? (target > from && target <= to)
                : (target > from || target <= to); // wrapped around 24h
        };

        const tick = () => {
            const prev = prevSecRef.current;
            const cur = nowGameSec();

            if (crossed(prev, cur, dayStartSec)) {
                incrementDay(); // respects maxDays
            }

            prevSecRef.current = cur;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [nowGameSec, dayStartHour, incrementDay]);

    const jumpTo = (hh, mm = 0) => {
        const sec = ((hh * 3600) + (mm * 60)) % (24 * 3600);
        useGameClock.getState().setClockTo(sec);
    };

    return (
        <div style={panelStyles.wrap}>
            <div style={panelStyles.row}>
                <strong>Clock</strong>
                <span>{clock}</span>
            </div>

            {/* 👇 NEW: Day controls */}
            <div style={panelStyles.row}>
                <strong>Day</strong>
                <span>DAY {dayNumber} / {maxDays}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => incrementDay()}>+1 day</button>
                    <button onClick={() => setDayNumber(Math.max(1, dayNumber - 1))}>-1 day</button>
                    <button onClick={() => setDayNumber(1)}>Reset</button>
                </div>
            </div>

            <div style={panelStyles.row}>
                <button onClick={() => setPhaseDay()}>Set Day</button>
                <button onClick={() => setPhaseNight()}>Set Night</button>
                <button onClick={() => addMinutes(60)}>+1h</button>
                <button onClick={() => addMinutes(-60)}>-1h</button>
            </div>

            <div style={panelStyles.row}>
                <label><input type="checkbox"
                    checked={pausedLocal}
                    onChange={(e) => { setPausedLocal(e.target.checked); setPaused(e.target.checked); }}
                /> Pause</label>
                <button onClick={() => jumpTo(6, 0)}>Jump 06:00</button>
                <button onClick={() => jumpTo(18, 0)}>Jump 18:00</button>
            </div>

            <div style={panelStyles.row}>
                <span>Day sec</span>
                <input type="number" value={daySec} onChange={(e) => setDaySec(+e.target.value || 0)} style={panelStyles.input} />
                <span>Night sec</span>
                <input type="number" value={nightSec} onChange={(e) => setNightSec(+e.target.value || 0)} style={panelStyles.input} />
                <button onClick={() => {
                    configure({ realDayDurationSec: daySec, realNightDurationSec: nightSec });
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
        display: 'grid', gap: 8, width: 520, fontSize: 13,
    },
    row: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
    input: { width: 80, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 6px', borderRadius: 6 },
};
