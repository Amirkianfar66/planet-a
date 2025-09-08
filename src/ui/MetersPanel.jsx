import React from "react";
import { myPlayer } from "playroomkit";

export function MetersPanel({ phase, oxygen, power, cctv, onRepair }) {
    const me = myPlayer();
    const role = String(me.getState("role") || "Crew");

    const Bar = ({ label, value }) => (
        <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
                {label} — {value}%
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
                        background:
                            label === "CCTV"
                                ? "#7dd3fc"
                                : label === "Power"
                                    ? "#a7f3d0"
                                    : "#fca5a5",
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
            <Bar label="Oxygen" value={Number(oxygen)} />
            <Bar label="Power" value={Number(power)} />
            <Bar label="CCTV" value={Number(cctv)} />

            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => onRepair("oxygen")}>Repair O₂ +10</button>
                <button onClick={() => onRepair("power")}>Repair Power +10</button>
                <button onClick={() => onRepair("cctv")}>Repair CCTV +10</button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                Your role: <b>{role}</b>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
                {phase === "meeting"
                    ? "Meeting: Vote"
                    : phase === "day"
                        ? "Day: Repair systems"
                        : "Night: Repair (no sabotage in this build)"}
            </div>
        </div>
    );
}
