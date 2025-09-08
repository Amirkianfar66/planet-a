import React from "react";
import { myPlayer } from "playroomkit";
import "./ui.css";

/**
 * RolePanel
 * - If `role` prop is omitted, it reads from myPlayer().getState("role")
 * - If `objective` prop is omitted, it uses a default per-role objective
 *
 * Props:
 *  - role?: string
 *  - objective?: string
 *  - badgeColor?: string
 *  - tips?: string[]
 *  - onPingObjective?: () => void
 *  - title?: string
 */
export default function RolePanel({
    role,
    objective,
    badgeColor,
    tips = [],
    onPingObjective,
    title = "Your Role",
}) {
    const me = safeMyPlayer();
    const resolvedRole =
        role ??
        safeString(me?.getState?.("role")) ||
        safeString(me?.profile?.role) ||
        "Crew";

    const resolvedObjective =
        objective ?? defaultObjectiveFor(resolvedRole) ?? "Complete daily tasks.";

    return (
        <section className="ui-panel">
            <header className="ui-panel__header">
                <span>{title}</span>
                <span
                    className="ui-chip"
                    style={{ borderColor: "transparent", background: badgeColor || "var(--ui-chip-bg)" }}
                >
                    {resolvedRole}
                </span>
            </header>

            <div className="ui-panel__body" style={{ display: "grid", gap: 10 }}>
                <div className="role-objective">
                    <div className="role-objective__label">Daily Objective</div>
                    <div className="role-objective__text">{resolvedObjective}</div>
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

function safeMyPlayer() {
    try { return myPlayer?.(); } catch { return null; }
}
function safeString(v) {
    if (v == null) return "";
    try { return String(v).trim(); } catch { return ""; }
}

// ----- Exact-match objectives (no alias mapping) -----
const ROLE_OBJECTIVES = {
    Researcher: "Search for cures and run blood tests.",
    Guard: "Defend the station by securing critical areas.",
    Engineer: "Maintain station systems and fix spaceship modules.",
    Lab Director: "Oversee blood tests and call meetings when needed.",
    Food Supplier: "Collect ingredients and prepare food capsules.",
    Officer: "Analyze CCTV, question players, and request blood tests.",
};

// No canonicalRole/ALIAS — exact match only
function defaultObjectiveFor(role) {
    const key = String(role || "");
    return ROLE_OBJECTIVES[key] ?? ROLE_OBJECTIVES.Crewmate;
}
