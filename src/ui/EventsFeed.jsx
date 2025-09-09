// src/ui/EventsFeed.jsx
import React from "react";
import { useGameState } from "../game/GameStateProvider";

export function EventsFeed({ style }) {
    const { events } = useGameState();
    const list = Array.isArray(events) ? events : [];
    return (
        <div style={{ /* your styles here */, ...style }}>
            {list.slice().reverse().map((e, i) => (
                <div key={i}>• {String(e)}</div>
            ))}
        </div>
    );
}
