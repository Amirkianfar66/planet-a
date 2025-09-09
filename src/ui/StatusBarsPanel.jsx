// src/ui/StatusBarsPanel.jsx
import React from "react";

/**
 * Flexible MetersPanel
 * Supports:
 *  - Simple API:   oxygen, energy (or power), onRepair
 *  - Generic API:  meters=[{ id, label, value, color }], onRepair
 *
 * onRepair is called with the meter id: "oxygen", "energy", or "power".
 */
export function MetersPanel({ oxygen, power, energy, meters, title, onRepair }) {
    const clamp100 = (v) => Math.max(0, Math.min(100, Number(v) || 0));

    // Prefer values coming from `meters` if provided; fall back to props.
    const oxyFromMeters = Array.isArray(meters)
        ? meters.find((m) => m.id === "oxygen")
        : null;
    const energyFromMeters = Array.isArray(meters)
        ? (meters.find((m) => m.id === "energy") ||
            meters.find((m) => m.id === "power"))
        : null;

    const oxygenVal = clamp100(oxyFromMeters?.value ?? oxygen ?? 0);
    const energyVal = clamp100(energyFromMeters?.value ?? energy ?? power ?? 0);

    const oxygenLabel = oxyFromMeters?.label ?? "Oxygen";
    const energyLabel = energyFromMeters?.label ?? "Energy";

    // Which key should we send to onRepair for the energy bar?
    const energyKey =
        (energyFromMeters?.id) || (energy !== undefined ? "energy" : "power");

    const Bar = ({ label, value, color }) => (
        <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
                {label} — {Math.round(value)}%
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
                        width: `${value}%`,
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
            {title ? (
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>{title}</div>
            ) : null}

            <Bar
                label={oxygenLabel}
                value={oxygenVal}
                color={oxyFromMeters?.color ?? "#fca5a5"}
            />
            <Bar
                label={energyLabel}
                value={energyVal}
                color={energyFromMeters?.color ?? "#a7f3d0"}
            />

            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => onRepair?.("oxygen")}>Repair O₂ +10</button>
                <button onClick={() => onRepair?.(energyKey)}>Repair Energy +10</button>
            </div>
        </div>
    );
}

/** Default wrapper that feeds MetersPanel with both APIs for maximum compatibility */
export default function StatusBarsPanel({
    energy = 100,
    oxygen = 100,
    title = "Life Support",
    onRepair,
}) {
    return (
        <MetersPanel
            title={title}
            // Generic API (v1-style)
            meters={[
                { id: "energy", label: "Energy", value: energy },
                { id: "oxygen", label: "Oxygen", value: oxygen },
            ]}
            // Simple API (v2-style)
            oxygen={oxygen}
            energy={energy}
            power={energy} // legacy alias some versions expect
            onRepair={onRepair}
        />
    );
}
