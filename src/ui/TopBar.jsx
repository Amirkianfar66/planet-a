import React, { useEffect, useState } from "react";
import { myPlayer } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";

export function TopBar({ phase, timer, players }) {
    // Game-clock state (day/night cycle)
    const format = useGameClock(s => s.format);
    const phaseFn = useGameClock(s => s.phase);
    const pct = useGameClock(s => s.phaseProgress);
    const dayNumber = useGameClock(s => s.dayNumber);
    const maxDays = useGameClock(s => s.maxDays);

    // Live UI clock + phase chip
    const [clock, setClock] = useState(format());
    const [ph, setPh] = useState(phaseFn());

    useEffect(() => {
        let raf;
        const loop = () => {
            setClock(format());
            setPh(phaseFn());
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [format, phaseFn]);

    const progress = Math.floor(pct() * 100);

    // Meeting countdown (only when phase prop says "meeting")
    const isMeeting = phase === "meeting";
    const mt = Number(timer ?? 0);
    const mm = String(Math.floor(mt / 60)).padStart(2, "0");
    const ss = String(mt % 60).padStart(2, "0");

    return (
        <div
            style={{
                position: "relative",
                display: "flex",
                gap: 16,
                alignItems: "center",
                padding: "8px 12px 11px", // a touch more bottom space for the progress bar
                background: "#0e1116",
                color: "white",
                fontFamily: "ui-sans-serif",
                fontSize: 14,
            }}
        >
            <strong>Planet A — Prototype</strong>

            <span>| Day: <b>{dayNumber}/{maxDays}</b></span>
            <span>| Phase: <b>{String(phase)}</b></span>

            {/* Day/Night chip from game-clock */}
            <span
                style={{
                    marginLeft: 8,
                    padding: "2px 8px",
                    border: "1px solid #334155",
                    borderRadius: 999,
                    background: ph === "day" ? "rgba(255,225,120,0.18)" : "rgba(120,160,255,0.18)",
                    fontWeight: 700,
                    fontSize: 12,
                }}
            >
                {ph.toUpperCase()}
            </span>

            {/* Pretty in-world clock */}
            <span>| Clock: <b style={{ letterSpacing: 1 }}>{clock}</b></span>

            {/* Meeting countdown chip (when in meeting) */}
            {isMeeting && (
                <span
                    style={{
                        marginLeft: 8,
                        padding: "2px 8px",
                        border: "1px solid rgba(255,120,120,.35)",
                        borderRadius: 999,
                        background: "rgba(255,120,120,.18)",
                        fontWeight: 700,
                        fontSize: 12,
                    }}
                >
                    MEETING <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</span>
                </span>
            )}

            <span style={{ marginLeft: "auto" }}>Alive: <b>{players}</b></span>
            <span style={{ marginLeft: 12, opacity: 0.7 }}>
                you are: {myPlayer().getProfile().name || "Anon"}
            </span>

            {/* Phase progress (thin bar at the bottom) */}
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 3,
                    background: "rgba(255,255,255,0.12)",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${progress}%`,
                        background: "rgba(255,255,255,0.85)",
                    }}
                />
            </div>
        </div>
    );
}
