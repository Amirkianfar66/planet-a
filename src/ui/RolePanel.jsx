import React from "react";
import { myPlayer } from "playroomkit";
import "./ui.css";

/**
 * RolePanel — compact card matching MetersPanel style
 * Props:
 *  - role?: string                 // optional override; if omitted, reads from Playroom
 *  - objective?: string            // optional override; else uses ROLE_OBJECTIVES[role]
 *  - onPingObjective?: () => void
 *  - style?: React.CSSProperties   // optional container style overrides
 */
export default function RolePanel({ role, objective, onPingObjective, style }) {
    const liveRole = useMyRoleFromPlayroom(); // live value from Playroom
    const resolvedRole = role ?? (liveRole || "Unassigned");
    const resolvedObjective =
        objective ?? ROLE_OBJECTIVES[resolvedRole] ?? "No objective set.";

    const Container = ({ children }) => (
        <div
            style={{
                position: "absolute",
                top: 10,
                left: 10, // MetersPanel is top-right; RolePanel sits top-left
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
            {children}
        </div>
    );

    const Label = ({ title, value }) => (
        <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
                {title} — {value}
            </div>
        </div>
    );

    return (
        <Container>
            <Label title="Role" value={resolvedRole} />

            {/* Objective block styled to echo the bar container */}
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
                {resolvedObjective}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button onClick={onPingObjective} disabled={!onPingObjective}>
                    Ping Objective
                </button>
            </div>
        </Container>
    );
}

/* ---------------- live role hook ---------------- */
function useMyRoleFromPlayroom(intervalMs = 400) {
    const [role, setRole] = React.useState(() => {
        const me = safeMyPlayer();
        return me ? safeString(me.getState?.("role")) : "";
    });

    React.useEffect(() => {
        const me = safeMyPlayer();
        let mounted = true;

        const read = () => {
            if (!mounted || !me) return;
            setRole(safeString(me.getState?.("role")));
        };

        read();
        const id = setInterval(read, intervalMs);
        return () => {
            mounted = false;
            clearInterval(id);
        };
    }, [intervalMs]);

    return role;
}

function safeMyPlayer() {
    try { return myPlayer?.(); } catch { return null; }
}
function safeString(v) {
    if (v == null) return "";
    try { return String(v).trim(); } catch { return ""; }
}

/* -------- exact objectives (match your characters index) -------- */
const ROLE_OBJECTIVES = {
    Research: "Search for cures and run blood tests.",
    Guard: "Defend the station by securing critical areas.",
    Engineer: "Maintain station systems and fix spaceship modules.",
    "Station Director": "Oversee blood tests and call meetings when needed.",
    "Food Supplier": "Collect ingredients and prepare food capsules.",
    Officer: "Analyze CCTV, question players, and request blood tests.",
};
