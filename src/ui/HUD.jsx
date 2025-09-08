// src/ui/HUD.jsx
import React from "react";
import { StatusBarsPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import "./ui.css";

/**
 * HUD – single source overlay
 * - Left: Status (O2/Energy), Role
 * - Right: Backpack
 * - Chat: pinned bottom-left
 */
export default function HUD({ game = {} }) {
    const me = game?.me || {};
    const meters = game?.meters || {};

    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
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
                    // Re-enable once local echo works for you:
                    // onSend={(text) => game.requestAction?.("chat", { text })}
                    style={{ position: "static" }}
                />
            </div>
        </div>
    );
}
