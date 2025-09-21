// src/ui/RolePanel.jsx
import React from "react";
import { myPlayer } from "playroomkit";   // only used to flag infected for styling (no extra text)
import { useGameState } from "../game/GameStateProvider";
import "./ui.css";

export default function RolePanel({ style, floating = false }) {
    const { myRole } = useGameState();
    const baseRole = myRole || "Unassigned";

    // self-only secret; we won't show text, just tweak border color subtly
    const infected = Boolean(myPlayer()?.getState?.("infected"));

    return (
        <section
            className={`rp rp--illustrated rp--half ${floating ? "rp-docked-left" : ""}`}
            data-component="role"
            style={style}
        >
            <div className="rp-card" data-infected={infected ? "true" : "false"}>
                <div className="rp__role" aria-label={`Role ${baseRole}`}>
                    {String(baseRole).toUpperCase()}
                </div>
            </div>
        </section>
    );
}

export { RolePanel };
