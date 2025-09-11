// src/ui/RolePanel.jsx
import React from "react";
import { myPlayer } from "playroomkit"; // ← read self-only infected flag
import { useGameState } from "../game/GameStateProvider";
import "./ui.css";

export default function RolePanel({ onPingObjective, style, floating = false }) {
    const { myRole } = useGameState();
    const baseRole = myRole || "Unassigned";

    // Self-only secret: the infected flag lives on your player state
    const infected = Boolean(myPlayer()?.getState?.("infected"));

    // What we show to the player who is infected
    const displayRole =
        infected && baseRole !== "Unassigned" ? `Infected ${baseRole}` : baseRole;

    // Pick objective set depending on infection
    const objective =
        (infected
            ? INFECTED_OBJECTIVES[baseRole]
            : ROLE_OBJECTIVES[baseRole]) || "No objective set.";

    const containerStyle = {
        ...(floating ? { position: "absolute", top: 10, left: 10 } : {}),
        background: "rgba(14,17,22,0.9)",
        border: infected ? "1px solid #7f1d1d" : "1px solid #2a3242", // subtle hint for infected (self-only)
        boxShadow: infected ? "0 0 0 1px rgba(127,29,29,0.2) inset" : undefined,
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
                <div style={{ fontSize: 12, opacity: 0.8 }}>Role — {displayRole}</div>
                {infected && baseRole !== "Unassigned" && (
                    <div
                        style={{
                            fontSize: 10,
                            opacity: 0.85,
                            background: "rgba(127,29,29,0.25)",
                            border: "1px solid rgba(127,29,29,0.4)",
                            borderRadius: 6,
                            padding: "2px 6px",
                            width: "fit-content",
                        }}
                    >
                        You are infected — keep it secret.
                    </div>
                )}
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

const INFECTED_OBJECTIVES = {
    // Keep wording subtle; you don't want to give it away at a glance
    Research: "Secret: Delay tests and misdirect findings without being obvious.",
    Guard: "Secret: Leave gaps in security and steer suspicion elsewhere.",
    Engineer: "Secret: ‘Fix’ slowly and nudge systems back toward failure later.",
    StationDirector: "Secret: Control meetings; push for wrong ejections.",
    FoodSupplier: "Secret: Stall supplies; create minor distractions.",
    Officer: "Secret: Misinterpret CCTV and seed doubt strategically.",
    Unassigned: "Secret: Blend in until you get a cover role.",
};
