// src/ui/HUD.jsx
import React from "react";
import { StatusBarsPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import "./ui.css";

/**
 * HUD – single source overlay:
 *  - Left: Status (O2/Energy), Role (live from Playroom), Chat (bottom)
 *  - Right: Backpack
 *  - Center column: left empty (your GameCanvas sits behind; EventsFeed can stay separate if you want)
 *
 * Expects:
 *  game = {
 *    meters: { energy:number, oxygen:number },
 *    me: { id, capacity?, backpack?[] },
 *    requestAction: (type, payload?) => void
 *  }
 */
export default function HUD({ game }) {
    const me = game.me || {};

    return (
        <div
            style={{
                position: "absolute",
                inset: 16,
                display: "grid",
                gap: 16,
                gridTemplateColumns: "320px 1fr 360px",
                height: "calc(100% - 32px)",
                pointerEvents: "none", // parent pointer events off…
            }}
        >
            {/* LEFT COLUMN — top: status, middle: role, bottom: chat */}
            <div
                style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateRows: "auto 1fr auto",
                    minHeight: 0,
                    pointerEvents: "auto", // …but panels clickable
                }}
            >
                <StatusBarsPanel
                    energy={Number(game.meters?.energy ?? 0)}
                    oxygen={Number(game.meters?.oxygen ?? 0)}
                />

                {/* Let RolePanel read the role live from Playroom (don’t pass role here) */}
                <div style={{ minHeight: 0 }}>
                    <RolePanel
                        onPingObjective={() => game.requestAction?.("pingObjective")}
                    />
                </div>

                {/* Team chat at bottom-left; let it sync live from Playroom.
            Override its default absolute positioning so it fits the grid cell. */}
                <TeamChatPanel
                    onSend={(text) => game.requestAction?.("chat", { text })}
                    style={{
                        position: "static",  // override absolute
                        left: "auto",
                        bottom: "auto",
                        width: "100%",
                        maxHeight: "28vh",
                    }}
                />
            </div>

            {/* CENTER column free for viewport overlays if you ever need them */}

            {/* RIGHT COLUMN — Backpack */}
            <div style={{ display: "grid", gap: 16, alignContent: "start", pointerEvents: "auto" }}>
                <BackpackPanel
                    items={me.backpack || []}
                    capacity={me.capacity ?? 8}
                    onUse={(id) => game.requestAction?.("useItem", { id })}
                    onDrop={(id) => game.requestAction?.("dropItem", { id })}
                />
            </div>
        </div>
    );
}
