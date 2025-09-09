// src/ui/RolePanel.jsx
import React from "react";
import { useGameState } from "../game/GameStateProvider";
import "./ui.css";

export default function RolePanel({ onPingObjective, style, floating = false }) {
    const { myRole } = useGameState();
    const role = myRole || "Unassigned";
    const objective = ROLE_OBJECTIVES[myRole] || "No objective set.";

    const containerStyle = {
        ...(floating ? { position: "absolute", top: 10, left: 10 } : {}),
        background: "rgba(14,17,22,0.9)",
        border: "1px solid #2a3242",
        padding: 10,
        borderRadius: 10,
        display: "grid",
        gap: 10,
        color: "white",
        ...style,
    };

    return (
        <div style={containerStyle}>
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Role — {role}</div>
            </div>

            <div
                style={{
                    width: 220,
                    background: "#1b2433",
                    border: "1px solid #2a3242",
                    borderRadius: 6,
                    padding: "8px 10px",
                    lineHeight: 1.35,
                    fontSize: 12,
                    opacity: 0.95,
                }}
            >
                {objective}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button onClick={onPingObjective} disabled={!onPingObjective}>
                    Ping Objective
                </button>
            </div>
        </div>
    );
}

const ROLE_OBJECTIVES = {
    Research: "Search for cures and run blood tests.",
    Guard: "Defend the station by securing critical areas.",
    Engineer: "Maintain station systems and fix spaceship modules.",
    StationDirector: "Oversee blood tests and call meetings when needed.",
    FoodSupplier: "Collect ingredients and prepare food capsules.",
    Officer: "Analyze CCTV, question players, and request blood tests.",
};
