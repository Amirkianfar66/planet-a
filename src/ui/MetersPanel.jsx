import React, { useMemo } from "react";
import "./ui.css";

function clamp100(v) {
    return Math.max(0, Math.min(100, Number(v) || 0));
}

export default function MetersPanel({
    oxygen,
    energy,
    power,
    meters,
    life,                 // optional
    // title is intentionally ignored to keep it simple
}) {
    // Prefer meters[] entries if provided
    const lifeRec = Array.isArray(meters) ? meters.find((m) => m.id === "life") : null;
    const oxyRec = Array.isArray(meters) ? meters.find((m) => m.id === "oxygen") : null;
    const engRec = Array.isArray(meters)
        ? (meters.find((m) => m.id === "energy") || meters.find((m) => m.id === "power"))
        : null;

    const rows = useMemo(() => {
        const lifeVal = clamp100(life ?? lifeRec?.value ?? 100);
        const oxygenVal = clamp100(oxygen ?? oxyRec?.value ?? 0);
        const energyVal = clamp100(energy ?? engRec?.value ?? power ?? 0);

        const energyId = engRec?.id ?? (energy !== undefined ? "energy" : power !== undefined ? "power" : "energy");
        const energyLabel = (engRec?.label ?? (power !== undefined ? "POWER" : "ENERGY")).toUpperCase();

        return [
            { id: "life", label: (lifeRec?.label ?? "LIFE").toUpperCase(), value: lifeVal },
            { id: "oxygen", label: (oxyRec?.label ?? "OXYGEN").toUpperCase(), value: oxygenVal },
            { id: energyId, label: energyLabel, value: energyVal },
        ];
    }, [life, lifeRec, oxygen, oxyRec, energy, power, engRec]);

    return (
        <section className="mp mp--illustrated mp--half" data-component="meters">
            <div className="mp-card">
                {/* Only the three bars; no header/title/actions */}
                <div className="mp__rows">
                    {rows.map((r) => (
                        <div key={r.id} className="mp-row">
                            <div className="mp-label">{r.label}</div>
                            <div
                                className="mp-bar"
                                data-type={r.id}
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(r.value)}
                                aria-label={r.label}
                                title={`${r.label}: ${Math.round(r.value)}%`}
                            >
                                <div className="mp-bar__fill" style={{ width: `${r.value}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export { MetersPanel };
