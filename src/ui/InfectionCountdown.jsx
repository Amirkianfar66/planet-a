// src/ui/InfectionCountdown.jsx
import React, { useEffect, useState } from "react";
import { myPlayer } from "playroomkit";

function fmt(ms) {
    if (ms <= 0) return "now";
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
}

export default function InfectionCountdown() {
    const me = myPlayer?.();
    const [now, setNow] = useState(Date.now());
    const [until, setUntil] = useState(0);
    const [pending, setPending] = useState(false);
    const [infected, setInfected] = useState(false);

    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
            setUntil(Number(me?.getState?.("infectionRevealUntil") || 0));
            setPending(!!me?.getState?.("infectionPending"));
            setInfected(!!me?.getState?.("infected"));
        }, 250);
        return () => clearInterval(id);
    }, [me]);

    // Show if: not infected, and either pending OR we have a future deadline.
    const show = !infected && (pending || (until && until > now));
    if (!show) return null;

    const left = Math.max(0, until - now);

    return (
        <div
            style={{
                position: "fixed",
                left: 16,
                bottom: 16,
                zIndex: 10000,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(220, 38, 38, 0.16)",
                border: "1px solid rgba(248,113,113,0.45)",
                color: "#fecaca",
                font: "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                pointerEvents: "none",
                boxShadow: "0 6px 16px rgba(0,0,0,0.28)",
                backdropFilter: "blur(6px)",
            }}
        >
            <span style={{ opacity: 0.9 }}>🦠 Infection in</span>{" "}
            <span style={{ color: "#fff", fontWeight: 800 }}>{fmt(left)}</span>
        </div>
    );
}
