import React from "react";

/**
 * MetersPanel — Oxygen + Energy only
 * Props:
 *  - oxygen: number (0-100)
 *  - power?: number (0-100)  // used as Energy label
 *  - energy?: number         // optional alias; if provided, overrides power
 *  - onRepair?: (key: "oxygen" | "power" | "energy") => void
 */
export function MetersPanel({ oxygen, power, energy, onRepair }) {
    const energyVal = Number(energy ?? power ?? 0);
    const oxygenVal = Number(oxygen ?? 0);

    const Bar = ({ label, value, color }) => (
        <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
                {label} — {Math.max(0, Math.min(100, Math.round(value)))}%
            </div>
            <div
                style={{
                    width: 200,
                    height: 10,
                    background: "#2a3242",
                    borderRadius: 6,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        width: `${Math.max(0, Math.min(100, value))}%`,
                        height: "100%",
                        background: color,
                        transition: "width .25s ease",
                    }}
                />
            </div>
        </div>
    );

    return (
        <div
            style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                padding: 10,
                borderRadius: 10,
                display: "grid",
                gap: 10,
                color: "white",
            }}
        >
            <Bar label="Oxygen" value={oxygenVal} color="#fca5a5" />
            <Bar label="Energy" value={energyVal} color="#a7f3d0" />

            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => onRepair?.("oxygen")}>Repair O₂ +10</button>
                {/* If your backend key is still "power", keep it; if you renamed it, change to "energy" */}
                <button onClick={() => onRepair?.(energy !== undefined ? "energy" : "power")}>
                    Repair Energy +10
                </button>
            </div>
        </div>
    );
}
