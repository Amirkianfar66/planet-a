import React from "react";

export default function TopBar({ phase, timer, players, events }) {
    // ✅ hooks first (always called)
    const timerLabel = React.useMemo(() => {
        if (typeof timer !== "number") return "--";
        const m = Math.floor(timer / 60);
        const s = `${timer % 60}`.padStart(2, "0");
        return `${m}:${s}`;
    }, [timer]);

    // You can return based on props AFTER hooks
    // if (!events) return null; // <- safe here if you want

    return (
        <header style={{ padding: 8, display: "flex", gap: 16 }}>
            <div>Phase: {phase}</div>
            <div>Timer: {timerLabel}</div>
            <div>Players: {players}</div>
            <div>Events: {Array.isArray(events) ? events.length : 0}</div>
        </header>
    );
}
