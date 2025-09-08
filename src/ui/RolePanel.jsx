import React from "react";
import "./ui.css";

/**
 * RolePanel
 * Props:
 *  - role: string
 *  - objective: string
 *  - badgeColor?: string (CSS color)
 *  - tips?: string[] (optional bullet points)
 *  - onPingObjective?: () => void (optional action)
 */
export default function RolePanel({
    role = "Crewmate",
    objective = "Complete daily maintenance in the Control Room.",
    badgeColor,
    tips = [],
    onPingObjective,
    title = "Your Role",
}) {
    return (
        <section className="ui-panel">
            <header className="ui-panel__header">
                <span>{title}</span>
                <span className="ui-chip" style={{ borderColor: "transparent", background: badgeColor || "var(--ui-chip-bg)" }}>
                    {role}
                </span>
            </header>

            <div className="ui-panel__body" style={{ display: "grid", gap: 10 }}>
                <div className="role-objective">
                    <div className="role-objective__label">Daily Objective</div>
                    <div className="role-objective__text">{objective}</div>
                </div>

                {tips.length > 0 && (
                    <ul className="ui-list">
                        {tips.map((t, i) => (
                            <li key={i}>{t}</li>
                        ))}
                    </ul>
                )}

                {onPingObjective && (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button className="ui-btn ui-btn--primary ui-btn--small" onClick={onPingObjective}>
                            Ping on Map
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
