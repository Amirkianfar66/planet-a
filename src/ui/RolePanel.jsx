import React from "react";
import { myPlayer } from "playroomkit";
import "./ui.css";

/**
 * RolePanel — compact card matching MetersPanel style
 * - Reads role exactly like your working ref: myPlayer().getState("role")
 * - No "Crew" fallback. Shows "Unassigned" if empty.
 * - Live-sync via a tiny 400ms poll so UI updates when role changes.
 */
export default function RolePanel({ onPingObjective, style }) {
    // force a re-render on an interval so role changes are reflected
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => {
        const id = setInterval(force, 400);
        return () => clearInterval(id);
    }, []);

    // READ ROLE EXACTLY LIKE YOUR REF
    const me = myPlayer();
    const rawRole = String(me?.getState?.("role") || "");
    const role = rawRole || "Unassigned";

    const objective = ROLE_OBJECTIVES[rawRole] || "No objective set.";

    return (
        <div
            style={{
                position: "absolute",
                top: 10,
                left: 10, // MetersPanel is top-right; this sits top-left
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                padding: 10,
                borderRadius: 10,
                display: "grid",
                gap: 10,
                color: "white",
                ...style,
            }}
        >
            {/* Title line in the same compact style as your bars */}
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Role — {role}
                </div>
            </div>

            {/* Objective block styled like a bar container */}
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

/* -------- exact objectives (match your characters index) -------- */
const ROLE_OBJECTIVES = {
    Research: "Search for cures and run blood tests.",
    Guard: "Defend the station by securing critical areas.",
    Engineer: "Maintain station systems and fix spaceship modules.",
    "StationDirector": "Oversee blood tests and call meetings when needed.",
    "FoodSupplier": "Collect ingredients and prepare food capsules.",
    Officer: "Analyze CCTV, question players, and request blood tests.",
};
