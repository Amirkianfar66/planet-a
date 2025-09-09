// src/ui/EventsFeed.jsx
import React from "react";
import { useGameState } from "../game/GameStateProvider";

export function EventsFeed({ style }) {
    const { events } = useGameState();
    const list = Array.isArray(events) ? events : [];

    return (
        <div
            style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #2a3242",
                background: "rgba(14,17,22,0.9)",
                color: "white",
                maxHeight: 240,
                overflow: "auto",
                ...style,
            }}
        >
            {list.length === 0 ? (
                <div style={{ opacity: 0.7, fontSize: 12 }}>No events yet.</div>
            ) : (
                list
                    .slice()
                    .reverse()
                    .map((e, i) => (
                        <div key={i} style={{ fontSize: 12, lineHeight: 1.35 }}>
                            • {String(e)}
                        </div>
                    ))
            )}
        </div>
    );
}

export default EventsFeed;
