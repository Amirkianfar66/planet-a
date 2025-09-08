// src/ui/HUD.jsx
import React from "react";
import { StatusBarsPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import "./ui.css";

export default function HUD({ game }) {
    const me = game.me;

    return (
        <div
            style={{
                position: "absolute",
                inset: 16,
                display: "grid",
                gap: 16,
                gridTemplateColumns: "320px 1fr 360px",
                height: "calc(100% - 32px)", // ensure full height so bottom pin works
            }}
        >
            {/* LEFT COLUMN — top: status, middle: role, bottom: team chat */}
            <div
                style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateRows: "auto 1fr auto",
                    minHeight: 0,
                }}
            >
                <StatusBarsPanel energy={game.meters.energy} oxygen={game.meters.oxygen} />

                <div style={{ minHeight: 0 }}>
                    <RolePanel
                        role={me.role}
                        objective={me.objective}
                        tips={me.roleTips || []}
                        onPingObjective={() => game.requestAction("pingObjective")}
                    />
                </div>

                {/* bottom-pinned */}
                <TeamChatPanel
                    teamName={me.teamName}
                    members={game.teamMembers}
                    messages={game.teamMessages}
                    myId={me.id}
                    onSend={(text) => game.requestAction("chat", { text })}
                />
            </div>

            {/* CENTER column left free for your viewport/feeds/etc. */}

            {/* RIGHT COLUMN — backpack, or anything else */}
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
                <BackpackPanel
                    items={me.backpack}
                    capacity={me.capacity}
                    onUse={(id) => game.requestAction("useItem", { id })}
                    onDrop={(id) => game.requestAction("dropItem", { id })}
                />
            </div>
        </div>
    );
}
