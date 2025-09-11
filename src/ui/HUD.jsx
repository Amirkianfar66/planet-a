// src/ui/HUD.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { myPlayer } from "playroomkit";
import { MetersPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import { useGameState } from "../game/GameStateProvider";
import { requestAction as prRequestAction } from "../network/playroom";
import { getAbilitiesForRole } from "../game/roleAbilities";
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
                maxWidth: 680,
                textAlign: "center",
            }}
        >
            <div style={{ opacity: 0.85, marginBottom: 4 }}>Controls</div>
            <div>
                <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> Move &nbsp;·&nbsp; <Key>Q</Key>/<Key>E</Key> Rotate &nbsp;·&nbsp; Right-mouse: Look
            </div>
            <div><Key>Space</Key> Jump</div>
            <div><Key>P</Key> Interact — Pick Up / Use (at device) / Eat (food)</div>
            <div><Key>I</Key> Use selected from Backpack &nbsp;·&nbsp; <Key>O</Key> Drop held &nbsp;·&nbsp; <Key>R</Key> Throw held</div>
            <div><Key>F</Key> Role Ability (e.g. <b>Shoot</b> for Guard)</div>
        </div>
    );
}

/* ---------- Ability bar (bottom-right above backpack) --------- */
function AbilityBar({ role, onUse }) {
    const abilities = useMemo(() => getAbilitiesForRole(role), [role]);
    const [cooldowns, setCooldowns] = useState({}); // id -> readyAt ms

    // simple local cooldown guard (host re-checks too)
    const canFire = (id) => {
        const t = cooldowns[id] || 0;
        return performance.now() >= t;
    };

    const trigger = (a) => {
        if (!a) return;
        if (!canFire(a.id)) return;
        onUse?.(a);
        setCooldowns((c) => ({ ...c, [a.id]: performance.now() + (a.cooldownMs || 0) }));
    };

    // Key binding: use first ability's key; if conflict later, extend to many
    useEffect(() => {
        if (!abilities.length) return;
        const a = abilities[0];
        const onKey = (e) => {
            if (e.code === (a.key || "KeyF")) {
                e.preventDefault();
                trigger(a);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [abilities]);

    if (!abilities.length) return null;

    return (
        <div
            style={{
                position: "absolute",
                right: 16,
                bottom: 16 + 360 + 12, // stack just above backpack (backpack ~360px tall)
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                padding: 8,
                borderRadius: 10,
                color: "white",
                width: 220,
                pointerEvents: "auto",
            }}
        >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Role Ability</div>
            {abilities.map((a) => {
                const readyIn = Math.max(0, (cooldowns[a.id] || 0) - performance.now());
                const disabled = readyIn > 0;
                const sec = Math.ceil(readyIn / 1000);
                return (
                    <button
                        key={a.id}
                        onClick={() => trigger(a)}
                        disabled={disabled}
                        className="item-btn"
                        style={{ width: "100%" }}
                        title={a.label}
                    >
                        {a.icon || "★"} {a.label} {disabled ? `(${sec}s)` : ""}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * HUD – overlay
 * - Left: Status (O2/Energy), Role
 * - Chat: pinned bottom-left
 * - Top-center: Keyboard guide
 * - Backpack: pinned bottom-right
 * - Ability bar: pinned above backpack
 */
export default function HUD({ game = {} }) {
    const { oxygen = 100, power = 100, myRole = "Unassigned" } = useGameState();

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

    const handleUseItem = (id) => {
        if (typeof game.onUseItem === "function") return game.onUseItem(id);
        requestAction("useItem", String(id));
    };
    const handleDrop = (id) => {
        if (typeof game.onDropItem === "function") return game.onDropItem(id);
        requestAction("dropItem", String(id));
    };

    // Ability trigger → compute origin/dir and send to host
    const useAbility = (ability) => {
        // Basic origin from my player state (x,z). y ~ 1.2 shoulder height.
        const px = Number(me?.getState?.("x") || 0);
        const pz = Number(me?.getState?.("z") || 0);
        const ry = Number(me?.getState?.("ry") || me?.getState?.("yaw") || 0); // radians
        const dx = Math.sin(ry), dz = Math.cos(ry), dy = 0;

        const payload = {
            origin: [px, 1.2, pz],
            dir: [dx, dy, dz],
            abilityId: ability.id,
        };

        // type='ability', target=abilityId, value=payload
        requestAction("ability", ability.id, payload);
    };

    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* Keyboard guide (top-center) */}
            <KeyGuidePanel />

            {/* Columns for status/role (unchanged layout) */}
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
                    <MetersPanel energy={Number(power)} oxygen={Number(oxygen)} />
                    <div style={{ minHeight: 0 }}>
                        <RolePanel onPingObjective={() => requestAction("pingObjective", "")} />
                    </div>
                </div>

                {/* CENTER column (free) */}
                <div />

                {/* RIGHT column left empty to keep center width stable */}
                <div />
            </div>

            {/* Ability bar (pinned above backpack) */}
            <AbilityBar role={myRole} onUse={useAbility} />

            {/* BOTTOM-RIGHT: Backpack (pinned) */}
            <div
                style={{
                    position: "absolute",
                    right: 16,
                    bottom: 16,
                    width: 360,
                    maxHeight: "60vh",
                    overflow: "hidden auto",
                    pointerEvents: "auto",
                }}
            >
                <BackpackPanel items={items} capacity={capacity} onUse={handleUseItem} onDrop={handleDrop} />
            </div>

            {/* BOTTOM-LEFT: Team chat (pinned) */}
            <div style={{ position: "absolute", left: 16, bottom: 16, width: 360, pointerEvents: "auto" }}>
                <TeamChatPanel style={{ position: "static" }} />
            </div>
        </div>
    );
}
