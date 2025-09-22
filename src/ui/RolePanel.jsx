// src/ui/RolePanel.jsx
import React from "react";
import { myPlayer } from "playroomkit";
import { useGameState } from "../game/GameStateProvider";
import { requestAction } from "../network/playroom";
import "./ui.css";

/* ---- helpers for cooldown & ETA labels ---- */
const msLeft = (t) => Math.max(0, Number(t || 0) - Date.now());
const fmtCountdown = (ms) => {
    const s = Math.ceil(ms / 1000);
    if (s <= 0) return "ready";
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
};

/* ---- Officer-only panel (button → 3s pending → result) ---- */
function OfficerScanPanel() {
    const me = myPlayer();
    const role = String(me?.getState?.("role") || "");
    if (role !== "Officer") return null;

    // tick every 0.5s so countdown updates live
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 500);
        return () => clearInterval(id);
    }, []);

    const cdUntil = Number(me.getState?.("cd:scanUntil") || 0);
    const onCd = Date.now() < cdUntil;

    // Pending (3s) fields written by host on scan
    const pendingName = me.getState?.("scanPendingName") || "";
    const pendingUntil = Number(me.getState?.("scanPendingUntil") || 0);
    const waiting = !!pendingName && pendingUntil > Date.now();

    // Last revealed result (host writes after 3s)
    const lastName = me.getState?.("lastScanName") || "";
    const lastInf = Number(me.getState?.("lastScanInfected") || 0);
    const lastAt = Number(me.getState?.("lastScanAt") || 0);

    // UI title preference: show current pending name first, else last known
    const headerName = waiting ? pendingName : (lastName || "");

    return (
        <div className="rp__abilities" style={{ marginTop: 10 }}>
            {/* Scan button */}
            <button
                onClick={() => requestAction("ability", "scan")}
                disabled={onCd || waiting} // ability locked during 6m CD or 3s pending
                className="rp-btn"
                style={{
                    width: "100%", padding: "8px 10px", borderRadius: 10,
                    background: (onCd || waiting) ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.10)", color: "white",
                    cursor: (onCd || waiting) ? "not-allowed" : "pointer"
                }}
            >
                Blood Test {(onCd && !waiting) ? `• ${fmtCountdown(msLeft(cdUntil))}` : (waiting ? "• testing…" : "")}
            </button>

            {/* Result / Pending panel */}
            <div
                className="rp__panel"
                style={{
                    marginTop: 8, padding: 10, borderRadius: 10,
                    background: "rgba(10,14,20,0.75)", border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 13, lineHeight: 1.25
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, opacity: 0.9 }}>
                        Blood Test{headerName ? ` — ${headerName}` : ""}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {waiting
                            ? `Result in ${fmtCountdown(msLeft(pendingUntil))}`
                            : (onCd ? `CD: ${fmtCountdown(msLeft(cdUntil))}` : "Ready")}
                    </div>
                </div>

                {waiting ? (
                    <div style={{ opacity: 0.9 }}>
                        Collecting / analyzing sample…
                    </div>
                ) : lastAt ? (
                    <div
                        style={{
                            padding: "6px 8px", borderRadius: 8,
                            background: lastInf ? "rgba(190,30,50,0.25)" : "rgba(24,140,60,0.25)",
                            border: lastInf ? "1px solid rgba(190,30,50,0.35)" : "1px solid rgba(24,140,60,0.35)"
                        }}
                    >
                        <div style={{ fontWeight: 700 }}>
                            {lastInf ? "INFECTED" : "CLEAR"} {lastName ? `— ${lastName}` : ""}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                            Result ready at {new Date(lastAt).toLocaleTimeString()}
                        </div>
                    </div>
                ) : (
                    <div style={{ opacity: 0.85 }}>No scans yet.</div>
                )}
            </div>
        </div>
    );
}

export default function RolePanel({ style, floating = false }) {
    const { myRole } = useGameState();
    const baseRole = myRole || "Unassigned";

    // subtle border tint only
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

                {/* Officer-only abilities UI */}
                {baseRole === "Officer" && <OfficerScanPanel />}
            </div>
        </section>
    );
}

export { RolePanel };
