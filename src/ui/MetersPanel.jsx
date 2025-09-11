import React from "react";

function MetersPanel({
    oxygen,
    energy,
    power,
    meters,
    life,                 // ⬅️ new optional prop
    title = "Life Support",
    onRepair,
}) {
    const clamp100 = (v) => Math.max(0, Math.min(100, Number(v) || 0));

    // prefer meters[] records if provided
    const lifeRec = Array.isArray(meters) ? meters.find((m) => m.id === "life") : null;
    const oxyRec = Array.isArray(meters) ? meters.find((m) => m.id === "oxygen") : null;
    const engRec = Array.isArray(meters)
        ? (meters.find((m) => m.id === "energy") || meters.find((m) => m.id === "power"))
        : null;

    const lifeVal = clamp100(lifeRec?.value ?? life ?? 100);
    const oxygenVal = clamp100(oxyRec?.value ?? oxygen ?? 0);
    const energyVal = clamp100(engRec?.value ?? energy ?? power ?? 0);

    const lifeLabel = lifeRec?.label ?? "Life";
    const oxygenLabel = oxyRec?.label ?? "Oxygen";
    const energyLabel = engRec?.label ?? "Energy";

    const energyKey = engRec?.id ?? (energy !== undefined ? "energy" : "power");

    const Bar = ({ label, value, color }) => (
        <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{label} — {Math.round(value)}%</div>
            <div style={{ width: 200, height: 10, background: "#2a3242", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width .25s ease" }} />
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
            {title && <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>{title}</div>}

            {/* NEW: Life first, in red */}
            <Bar label={lifeLabel} value={lifeVal} color={lifeRec?.color ?? "#f87171"} />

            <Bar label={oxygenLabel} value={oxygenVal} color={oxyRec?.color ?? "#fca5a5"} />
            <Bar label={energyLabel} value={energyVal} color={engRec?.color ?? "#a7f3d0"} />

            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => onRepair?.("life")}>Heal +10</button>
                <button onClick={() => onRepair?.("oxygen")}>Repair O₂ +10</button>
                <button onClick={() => onRepair?.(energyKey)}>Repair Energy +10</button>
            </div>
        </div>
    );
}

export default MetersPanel;
export { MetersPanel };
