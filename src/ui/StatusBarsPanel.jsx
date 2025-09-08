// src/ui/StatusBarsPanel.jsx
import React from "react";
import * as MeterMod from "./MetersPanel"; // tolerant to default or named
const MetersPanel = MeterMod.default ?? MeterMod.MetersPanel;

/** Two fixed meters: Energy + Oxygen (compatible with both MetersPanel APIs) */
export default function StatusBarsPanel({
    energy = 100,
    oxygen = 100,
    title = "Life Support",
    onRepair,
}) {
    return (
        <MetersPanel
            title={title}
            // v1 (generic) API
            meters={[
                { id: "energy", label: "Energy", value: energy },
                { id: "oxygen", label: "Oxygen", value: oxygen },
            ]}
            // v2 (simple) API
            oxygen={oxygen}
            energy={energy}
            power={energy}         // legacy alias some versions expect
            onRepair={onRepair}
        />
    );
}
