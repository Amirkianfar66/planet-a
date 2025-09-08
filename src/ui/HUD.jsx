// src/ui/HUD.jsx
import React from "react";
import { StatusBarsPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import "./ui.css";

/* ------- Tiny UI helpers ------- */
function Key({ children }) {
    return (
        <span
            style={{
                display: "inline-block",
                minWidth: 18,
                padding: "2px 6px",
                marginRight: 6,
                borderRadius: 6,
                border: "1px solid #334155",
                background: "rgba(15, 23, 42, 0.85)",
                boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.06)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 11,
                lineHeight: "16px",
                color: "#e2e8f0",
                textAlign: "center",
            }}
        >
            {children}
        </span>
    );
}

function KeyGuidePanel() {
    return (
        <div
            style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #2a3242",
                background: "rgba(14,17,22,0.9)",
                color: "#cfe3ff",
                fontFamily: "ui-sans-serif, system-ui",
                fontSize: 12,
                lineHeight: 1.45,
                pointerEvents: "none",
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                backdropFilter: "blur(2px)",
                maxWidth: 520,
                textAlign: "center",
            }}
        >
            <div style={{ opacity: 0.85, marginBottom: 4 }}>Controls</div>
            <div><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> Move &nbsp;·&nbsp; <Key>Q</Key>/<Key>E</Key> Rotate &nbsp;·&nbsp; Right-mouse drag: Look</div>
            <div><Key>Space</Key> Jump</div>
            <div><Key>E</Key> Interact — Pick Up / Use (at device) / Eat (food)</div>
            <div><Key>R</Key> Throw held &nbsp;·&nbsp; <Key>G</Key> Drop held</div>
        </div>
    );
}

/**
 * HUD – single source overlay
 * - Left: Status (O2/Energy), Role
 * - Right: Backpack
 * - Chat: pinned bottom-left
 * - Top-center: Keyboard guide
 */
export default function HUD({ game = {} }) {
    const me = game?.me || {};
    const meters = game?.meters || {};

    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* Keyboard guide (top-center) */}
            <KeyGuidePanel />

            {/* Columns for status/role/backpack */}
            <div
                style={{
                    position: "absolute",
                    inset: 16,
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "320px 1fr 360px",
                    height: "calc(100% - 32px)",
                    pointerEvents: "auto",
                }}
            >
                {/* LEFT: Status + Role */}
                <div style={{ display: "grid", gap: 16, gridTemplateRows: "auto 1fr", minHeight: 0 }}>
                    <StatusBarsPanel
                        energy={Number(meters.energy ?? 100)}
                        oxygen={Number(meters.oxygen ?? 100)}
                    />
                    <div style={{ minHeight: 0 }}>
                        {/* Role reads live from Playroom; no role prop */}
                        <RolePanel onPingObjective={() => game.requestAction?.("pingObjective")} />
                    </div>
                </div>

                {/* CENTER column (free) */}
                <div />

                {/* RIGHT: Backpack */}
                <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
                    <BackpackPanel
                        items={me.backpack || []}
                        capacity={me.capacity ?? 8}
                        onUse={(id) => game.requestAction?.("useItem", { id })}
                        onDrop={(id) => game.requestAction?.("dropItem", { id })}
                    />
                </div>
            </div>

            {/* BOTTOM-LEFT: Team chat (pinned) */}
            <div
                style={{
                    position: "absolute",
                    left: 16,
                    bottom: 16,
                    width: 360,
                    pointerEvents: "auto",
                }}
            >
                <TeamChatPanel
                    // onSend={(text) => game.requestAction?.("chat", { text })}
                    style={{ position: "static" }}
                />
            </div>
        </div>
    );
}
