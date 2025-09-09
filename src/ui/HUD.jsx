// src/ui/HUD.jsx
import React from "react";
import { myPlayer } from "playroomkit";
import { MetersPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import { useGameState } from "../game/GameStateProvider";
import { requestAction as prRequestAction } from "../network/playroom";
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
                maxWidth: 560,
                textAlign: "center",
            }}
        >
            <div style={{ opacity: 0.85, marginBottom: 4 }}>Controls</div>
            <div>
                <Key>W</Key>
                <Key>A</Key>
                <Key>S</Key>
                <Key>D</Key>{" "}
                Move &nbsp;·&nbsp; <Key>Q</Key>/<Key>E</Key> Rotate &nbsp;·&nbsp; Right-mouse drag: Look
            </div>
            <div>
                <Key>Space</Key> Jump
            </div>
            <div>
                <Key>P</Key> Interact — Pick Up / Use (at device) / Eat (food)
            </div>
            <div>
                <Key>I</Key> Use selected from Backpack &nbsp;·&nbsp; <Key>O</Key> Drop held &nbsp;·&nbsp; <Key>R</Key> Throw held
            </div>
        </div>
    );
}

/**
 * HUD – overlay
 * - Left: Status (O2/Energy), Role
 * - Right: Backpack
 * - Chat: pinned bottom-left
 * - Top-center: Keyboard guide
 */
export default function HUD({ game = {} }) {
    const { oxygen = 100, power = 100 } = useGameState();

    // Prefer data passed in via `game`; fall back to myPlayer() state
    const meProp = game?.me || {};
    const me = myPlayer();
    const bpFromPlayer = me?.getState?.("backpack") || [];
    const capFromPlayer = Number(me?.getState?.("capacity")) || 8;

    const items = Array.isArray(meProp.backpack) ? meProp.backpack : bpFromPlayer;
    const capacity = Number(meProp.capacity ?? capFromPlayer);

    const requestAction =
        typeof game.requestAction === "function"
            ? game.requestAction
            : (type, target, value) => prRequestAction(type, target, value);

    const handleUse = (id) => {
        if (typeof game.onUseItem === "function") return game.onUseItem(id);
        requestAction("useItem", String(id));
    };

    const handleDrop = (id) => {
        if (typeof game.onDropItem === "function") return game.onDropItem(id);
        requestAction("dropItem", String(id));
    };

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
                <div
                    style={{
                        display: "grid",
                        gap: 16,
                        gridTemplateRows: "auto 1fr",
                        minHeight: 0,
                    }}
                >
                    <MetersPanel energy={Number(power)} oxygen={Number(oxygen)} />
                    <div style={{ minHeight: 0 }}>
                        <RolePanel onPingObjective={() => requestAction("pingObjective", "")} />
                    </div>
                </div>

                {/* CENTER column (free) */}
                <div />

                {/* RIGHT: Backpack */}
                <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
                    <BackpackPanel
                        items={items}
                        capacity={capacity}
                        onUse={handleUse}
                        onDrop={handleDrop}
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
                    // onSend={(text) => requestAction("chat", String(text))}
                    style={{ position: "static" }}
                />
            </div>
        </div>
    );
}
