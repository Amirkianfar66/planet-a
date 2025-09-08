// src/ui/TopBar.jsx
import React from "react";
import { myPlayer } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";

export function TopBar({ phase, timer, players }) {
    const dayNumber = useGameClock((s) => s.dayNumber);
    const maxDays = useGameClock((s) => s.maxDays);

    const isMeeting = phase === "meeting";
    const mm = String(Math.floor(Number(timer) / 60)).padStart(2, "0");
    const ss = String(Number(timer) % 60).padStart(2, "0");

    return (
        <div
            style={{
                display: "flex", gap: 16, alignItems: "center", padding: "8px 12px",
                background: "#0e1116", color: "white", fontFamily: "ui-sans-serif", fontSize: 14,
            }}
        >
            <strong>Planet A — Prototype</strong>
            <span>| Day: <b>DAY {dayNumber}/{maxDays}</b></span>
            <span>| Phase: <b>{String(phase)}</b></span>

            {/* ✅ Only show a clock here during meetings */}
            {isMeeting && <span>| Meeting: <b>{mm}:{ss}</b></span>}

            <span style={{ marginLeft: "auto", opacity: 0.7 }}>
                you are: {myPlayer().getProfile().name || "Anon"}
            </span>
        </div>
    );
}
