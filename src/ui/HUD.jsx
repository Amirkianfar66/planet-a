// src/ui/HUD.jsx
import React from "react";
import { StatusBarsPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import "./ui.css";

/**
 * HUD – single source overlay
 * - Left column: Status (O2/Energy), Role
 * - Right column: Backpack
 * - TeamChat is pinned bottom-left (absolute), independent of the grid
 */
export default function HUD({ game }) {
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
                        energy={Number(meters.energy ?? 0)}
                        oxygen={Number(meters.oxygen ?? 0)}
                    />
                    <div style={{ minHeight: 0 }}>
                        {/* Role reads live from Playroom; we don't pass a role prop */}
                        <RolePanel onPingObjective={() => game.requestAction?.("pingObjective")} />
                    </div>
                </div>

                {/* CENTER column (free for future overlays) */}
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
            <TeamChatPanel
                onSend={(text) => game.requestAction?.("chat", { text })}
                style={{
                    position: "absolute",
                    left: 16,
                    bottom: 16,
                    width: 360,
                    pointerEvents: "auto",
                }}
            />
        </div>
    );
}
