import React, { useEffect, useState } from 'react';
import { useGameClock } from '../systems/dayNightClock';

export default function DayNightHUD({ phaseLabel, meetingTimer }) {
    // from game clock (day/night cycle)
    const format = useGameClock(s => s.format);
    const phase = useGameClock(s => s.phase);
    const pct = useGameClock(s => s.phaseProgress);

    const dayNumber = useGameClock(s => s.dayNumber);
    const maxDays = useGameClock(s => s.maxDays);

    const [clock, setClock] = useState(format());
    const [ph, setPh] = useState(phase());

    useEffect(() => {
        let raf;
        const loop = () => {
            setClock(format());
            setPh(phase());
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [format, phase]);

    const progress = Math.floor(pct() * 100);

    const isMeeting = phaseLabel === 'meeting';
    const mt = Number(meetingTimer ?? 0);
    const mm = String(Math.floor(mt / 60)).padStart(2, '0');
    const ss = String(mt % 60).padStart(2, '0');

    return (
        <div style={styles.wrap}>
            <div style={styles.card}>
                <div style={styles.rowTop}>
                    <div style={styles.dayTag}>DAY {dayNumber} / {maxDays}</div>

                    {/* chips on the right: day/night + (optional) meeting timer */}
                    <div style={styles.chips}>
                        <div style={{ ...styles.phase, ...(ph === 'day' ? styles.day : styles.night) }}>
                            {ph === 'day' ? 'DAY' : 'NIGHT'}
                        </div>
                        {isMeeting && (
                            <div style={{ ...styles.phase, ...styles.meeting }}>
                                MEETING <span style={styles.meetTime}>{mm}:{ss}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* big day/night clock */}
                <div style={styles.row}>
                    <div style={styles.clock}>{clock}</div>
                </div>

                {/* phase progress */}
                <div style={styles.progressTrack}>
                    <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                </div>
                <div style={styles.progressLabel}>{progress}% of {ph}</div>
            </div>
        </div>
    );
}

const styles = {
    wrap: { position: 'fixed', top: 16, right: 16, zIndex: 9999, pointerEvents: 'none' },
    card: {
        background: 'rgba(15, 17, 23, 0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: 12, width: 280, color: '#fff',
        backdropFilter: 'blur(6px)',
    },
    rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    chips: { display: 'flex', alignItems: 'center', gap: 6 },
    row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    clock: { fontSize: 28, fontWeight: 700, letterSpacing: 1 },
    dayTag: { fontSize: 12, fontWeight: 700, opacity: 0.9 },
    phase: {
        fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.2)',
    },
    day: { background: 'rgba(255, 225, 120, 0.18)' },
    night: { background: 'rgba(120, 160, 255, 0.18)' },
    meeting: { background: 'rgba(255, 120, 120, 0.18)', borderColor: 'rgba(255, 120, 120, 0.35)' },
    meetTime: { marginLeft: 6, fontVariantNumeric: 'tabular-nums' },
    progressTrack: {
        width: '100%', height: 8, borderRadius: 999,
        background: 'rgba(255,255,255,0.12)', overflow: 'hidden',
    },
    progressFill: { height: '100%', background: 'rgba(255,255,255,0.85)' },
    progressLabel: { marginTop: 6, fontSize: 11, opacity: 0.9, textAlign: 'right' },
};
