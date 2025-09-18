// src/ui/CCTVControlPanel.jsx
import React, { useEffect, useState } from "react";
import { myPlayer } from "playroomkit";
import useItemsSync from "../systems/useItemsSync.js";
import { DEVICES } from "../data/gameObjects.js";
import { DEVICE_RADIUS } from "../data/constants.js";

const CONSOLE_IDS = ["cctv_console", "cctv"]; // supports both

export default function CCTVControlPanel() {
    const { items } = useItemsSync(); // re-renders list of cams
    const [open, setOpen] = useState(false);
    const [nearConsole, setNearConsole] = useState(false);

    // Recompute proximity ~5x/sec (robust against stale deps)
    useEffect(() => {
        const tick = () => {
            const me = myPlayer();
            const con = DEVICES.find(d => CONSOLE_IDS.includes(d.id));
            if (!me || !con) { setNearConsole(false); return; }
            const px = Number(me.getState("x") || 0);
            const pz = Number(me.getState("z") || 0);
            const r = Number(con.radius || DEVICE_RADIUS || 2);
            const dx = px - con.x, dz = pz - con.z;
            setNearConsole((dx * dx + dz * dz) <= r * r);
        };
        const id = setInterval(tick, 200);
        tick();
        return () => clearInterval(id);
    }, []);

    // Keybinds: C toggles (only opens if nearConsole), Esc closes
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "c" || e.key === "C") {
                if (!open && nearConsole) setOpen(true);
                else if (open) {
                    setOpen(false);
                    myPlayer()?.setState("cctvViewId", "", false);
                }
            }
            if (e.key === "Escape" && open) {
                setOpen(false);
                myPlayer()?.setState("cctvViewId", "", false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, nearConsole]);

    if (!open) return null;

    const cams = (items || []).filter(i => i.type === "cctv" && !i.holder);

    return (
        <div style={{
            position: "absolute", left: 16, top: 16, width: 340, zIndex: 9999,
            background: "rgba(12,16,24,0.95)", color: "#fff", border: "1px solid #2a3242",
            borderRadius: 10, padding: 10, fontFamily: "ui-sans-serif", fontSize: 13,
            pointerEvents: "auto" // ensure clicks work
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong>CCTV Console</strong>
                <span style={{ opacity: .7 }}>C/Esc to close</span>
            </div>

            <div style={{ display: "grid", gap: 8, maxHeight: 320, overflow: "auto" }}>
                {cams.length === 0 && <div style={{ opacity: .7 }}>No cameras placed yet.</div>}
                {cams.map((c, idx) => (
                    <div key={c.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 10px", border: "1px solid #2a3242", borderRadius: 8, background: "#1b2433"
                    }}>
                        <div>
                            <div style={{ fontWeight: 700 }}>Camera {idx + 1}</div>
                            <div style={{ opacity: .75, fontSize: 12 }}>x:{c.x.toFixed(1)} z:{c.z.toFixed(1)}</div>
                        </div>
                        <button
                            onClick={() => myPlayer()?.setState("cctvViewId", c.id, false)}
                            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff" }}
                        >
                            View
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
