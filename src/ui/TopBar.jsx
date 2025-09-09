// src/ui/TopBar.jsx
import React, { useEffect, useState, useRef } from "react";
import { myPlayer } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";

export function TopBar({ phase, timer, players, events = [] }) {
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
        const loop = () => { setClock(format()); setPh(phaseFn()); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [format, phaseFn]);

    const progress = Math.floor(pct() * 100);

    // Meeting countdown (only when phase prop says "meeting")
    const isMeeting = phase === "meeting";
    const mt = Number(timer ?? 0);
    const mm = String(Math.floor(mt / 60)).padStart(2, "0");
    const ss = String(mt % 60).padStart(2, "0");

    // Events popover (center)
    const [open, setOpen] = useState(false);
    const popRef = useRef(null);
    useEffect(() => {
        const onDoc = (e) => {
            if (!popRef.current) return;
            if (!popRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const latest = events?.length ? String(events[events.length - 1]) : "No events yet";

    return (
        <div
            style={{
                position: "relative",
                display: "flex",
                gap: 16,
                alignItems: "center",
                padding: "8px 12px 11px",
                background: "#0e1116",
                color: "white",
                fontFamily: "ui-sans-serif",
                fontSize: 14,
            }}
        >
            {/* Left cluster */}
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

            {/* Centered Events tab */}
            <div
                ref={popRef}
                style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <button
                    onClick={() => setOpen((s) => !s)}
                    title="Show recent events"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid #334155",
                        color: "white",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    Events
                    <span
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            borderRadius: 999,
                            padding: "0 8px",
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        {events?.length ?? 0}
                    </span>
                </button>

                {/* Latest (single-line) preview */}
                <div
                    style={{
                        maxWidth: 520,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: 0.8,
                        fontSize: 12,
                    }}
                    title={latest}
                >
                    {latest}
                </div>

                {/* Popover */}
                {open && (
                    <div
                        style={{
                            position: "absolute",
                            top: "calc(100% + 8px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 520,
                            maxHeight: 240,
                            overflow: "auto",
                            background: "rgba(14,17,22,0.95)",
                            border: "1px solid #2a3242",
                            borderRadius: 10,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                            padding: 10,
                            zIndex: 20,
                        }}
                    >
                        <div style={{ opacity: 0.7, marginBottom: 6 }}>Events</div>
                        <div style={{ display: "grid", gap: 4 }}>
                            {(Array.isArray(events) ? events : []).slice().reverse().map((e, i) => (
                                <div key={i} style={{ fontSize: 12, lineHeight: 1.3 }}>• {String(e)}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

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

            {/* Right cluster */}
            <span style={{ marginLeft: "auto" }}>Alive: <b>{players}</b></span>
            <span style={{ marginLeft: 12, opacity: 0.7 }}>
                you are: {myPlayer()?.getProfile?.().name || "Anon"}
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
