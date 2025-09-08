// src/ui/StatusBarsPanel.jsx
import React from "react";
import * as MeterMod from "./MetersPanel";
const MetersPanel = MeterMod.default ?? MeterMod.MetersPanel;

/** Two fixed meters: Energy + Oxygen */
export default function StatusBarsPanel({ energy = 50, oxygen = 50, title = "Life Support" }) {
    return (
        <MetersPanel
            title={title}
            meters={[
                { id: "energy", label: "Energy", value: energy },
                { id: "oxygen", label: "Oxygen", value: oxygen },
            ]}
        />
    );
}
