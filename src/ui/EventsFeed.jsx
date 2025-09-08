import React from "react";

export function EventsFeed({ events }) {
    return (
        <div
            style={{
                position: "absolute",
                left: 10,
                bottom: 10,
                width: 420,
                background: "rgba(14,17,22,0.85)",
                border: "1px solid #2a3242",
                color: "white",
                padding: 10,
                borderRadius: 10,
                fontFamily: "ui-sans-serif",
                fontSize: 12,
                lineHeight: 1.3,
            }}
        >
            <div style={{ opacity: 0.7, marginBottom: 6 }}>Events</div>
            <div style={{ display: "grid", gap: 4, maxHeight: 160, overflow: "auto" }}>
                {(Array.isArray(events) ? events : []).map((e, i) => (
                    <div key={i}>• {String(e)}</div>
                ))}
            </div>
        </div>
    );
}
