import React from "react";
import { myPlayer } from "playroomkit";
import "./ui.css";

/**
 * RolePanel
 * - If `role` is not provided, it reads from myPlayer().getState("role") or profile.role.
 * - If `objective` is not provided, it uses ROLE_OBJECTIVES[role] with a neutral fallback.
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

    // choose the first non-empty string
    const resolvedRole =
        firstNonEmpty(
            role,
            me?.getState?.("role"),
            me?.profile?.role,
            "Unassigned"
        ) || "Unassigned";

    const resolvedObjective = objective ?? defaultObjectiveFor(resolvedRole);

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

// ---------- helpers ----------
function safeMyPlayer() {
    try { return myPlayer?.(); } catch { return null; }
}
function safeString(v) {
    if (v == null) return "";
    try { return String(v).trim(); } catch { return ""; }
}
// Return the first non-empty string from a list of candidates
function firstNonEmpty(...vals) {
    for (const v of vals) {
        const s = safeString(v);
        if (s) return s;
    }
    return "";
}

// ----- Exact-match objectives (must match your characters index) -----
const ROLE_OBJECTIVES = {
    Research: "Search for cures and run blood tests.",
    Guard: "Defend the station by securing critical areas.",
    Engineer: "Maintain station systems and fix spaceship modules.",
    "Station Director": "Oversee blood tests and call meetings when needed.",
    "Food Supplier": "Collect ingredients and prepare food capsules.",
    Officer: "Analyze CCTV, question players, and request blood tests.",
};

function defaultObjectiveFor(role) {
    const key = safeString(role);
    return ROLE_OBJECTIVES[key] ?? "No objective set.";
}
