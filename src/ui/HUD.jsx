// src/ui/HUD.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { myPlayer } from "playroomkit";
import { MetersPanel, RolePanel, TeamChatPanel } from ".";
import BackpackPanelCartoon from "./BackpackPanelCartoon.jsx"; // NEW
import { useGameState } from "../game/GameStateProvider";
import { requestAction as prRequestAction } from "../network/playroom";
import { getAbilitiesForRole } from "../game/roleAbilities";
import { isOutsideByRoof } from "../map/deckA";
import "./ui.css";

/* ---------- Ability bar (auto-positions above backpack) --------- */
function AbilityBar({ role, onUse, disabled = false, abovePx = 372 }) {
    const me = myPlayer();
    const [infected, setInfected] = useState(!!me?.getState?.("infected"));
    useEffect(() => {
        const t = setInterval(() => {
            const flag = !!me?.getState?.("infected");
            setInfected((prev) => (prev === flag ? prev : flag));
        }, 200);
        return () => clearInterval(t);
    }, [me]);

    const abilities = useMemo(() => getAbilitiesForRole(role), [role, infected]);

    const [cooldowns, setCooldowns] = useState({}); // id -> readyAt ms
    const canFire = (id) => performance.now() >= (cooldowns[id] || 0);

    const trigger = (a) => {
        if (!a || disabled) return;
        if (!canFire(a.id)) return;
        onUse?.(a);
        setCooldowns((c) => ({ ...c, [a.id]: performance.now() + (a.cooldownMs || 0) }));
    };

    useEffect(() => {
        if (disabled) return;
        const onKey = (e) => {
            const hit = abilities.find((ab) => (ab.key || "KeyF") === e.code);
            if (hit) {
                e.preventDefault();
                trigger(hit);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [abilities, disabled]);

    if (!abilities.length) return null;

    return (
        <div
            style={{
                position: "absolute",
                right: 16,
                bottom: 16 + abovePx, // dynamic height of backpack + spacing
                width: 260,
                background: "var(--ctn-screen)",
                border: "var(--ctn-border-w) solid var(--ctn-ink)",
                borderRadius: "var(--ctn-radius-md)",
                padding: 10,
                color: "var(--ctn-cream)",
                pointerEvents: "auto",
                boxShadow: "inset 0 -3px 0 rgba(0,0,0,.25), inset 0 0 0 3px #0f5f7e",
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".4px", opacity: 0.9, marginBottom: 8 }}>
                ROLE ABILITY
            </div>
            <div style={{ display: "grid", gap: 8 }}>
                {abilities.map((a) => {
                    const readyIn = Math.max(0, (cooldowns[a.id] || 0) - performance.now());
                    const isDisabled = disabled || readyIn > 0;
                    const sec = Math.ceil(readyIn / 1000);
                    return (
                        <button
                            key={a.id}
                            onClick={() => trigger(a)}
                            disabled={isDisabled}
                            className="item-btn"
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                            title={a.label}
                        >
                            <span style={{ fontSize: 14 }}>{a.icon || "★"}</span>
                            <span style={{ fontWeight: 900, letterSpacing: ".4px" }}>{a.label}</span>
                            {readyIn > 0 ? <span style={{ opacity: 0.8 }}>(~{sec}s)</span> : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * HUD – overlay
 * - Left: Status (Life/O2/Energy), Role
 * - Chat: bottom-left
 * - Backpack: bottom-right (cartoon)
 * - Ability bar: above backpack (disabled when dead)
 */
export default function HUD({ game = {} }) {
    const { oxygen = 100, power = 100, myRole = "Unassigned" } = useGameState();

    const me = myPlayer();
    const lifeVal = Number(me?.getState?.("life") ?? 100);
    const amDead = Boolean(me?.getState?.("dead"));

    // live energy
    const [energyVal, setEnergyVal] = useState(Number(me?.getState?.("energy") ?? 100));
    useEffect(() => {
        const iv = setInterval(() => {
            const v = Number(myPlayer()?.getState?.("energy") ?? 100);
            setEnergyVal((prev) => (prev === v ? prev : v));
        }, 150);
        return () => clearInterval(iv);
    }, []);

    // live oxygen
    const [oxygenVal, setOxygenVal] = useState(Number(me?.getState?.("oxygen") ?? 100));
    useEffect(() => {
        const iv = setInterval(() => {
            const v = Number(myPlayer()?.getState?.("oxygen") ?? 100);
            setOxygenVal((prev) => (prev === v ? prev : v));
        }, 150);
        return () => clearInterval(iv);
    }, []);

    // track position for outside/inside check
    const [pos, setPos] = useState({
        x: Number(me?.getState?.("x") || 0),
        z: Number(me?.getState?.("z") || 0),
    });
    useEffect(() => {
        const iv = setInterval(() => {
            const p = myPlayer();
            setPos((prev) => {
                const nx = Number(p?.getState?.("x") || 0);
                const nz = Number(p?.getState?.("z") || 0);
                return prev.x === nx && prev.z === nz ? prev : { x: nx, z: nz };
            });
        }, 120);
        return () => clearInterval(iv);
    }, []);
    const outside = isOutsideByRoof(pos.x, pos.z);

    // live backpack snapshot
    const [bpSnapshot, setBpSnapshot] = useState(() => me?.getState?.("backpack") || []);
    useEffect(() => {
        let mounted = true;
        const iv = setInterval(() => {
            const next = myPlayer()?.getState?.("backpack") || [];
            const prev = bpSnapshot;
            if (next.length !== prev.length) {
                if (mounted) setBpSnapshot(next);
                return;
            }
            for (let i = 0; i < next.length; i++) {
                const a = next[i], b = prev[i];
                if (a?.id !== b?.id || a?.type !== b?.type || (a?.qty || 0) !== (b?.qty || 0)) {
                    if (mounted) setBpSnapshot(next);
                    return;
                }
            }
        }, 120);
        return () => { mounted = false; clearInterval(iv); };
    }, [bpSnapshot]);

    // Prefer data passed in via `game`; fall back to myPlayer() state
    const meProp = game?.me || {};
    const items = bpSnapshot;
    const capFromPlayer = Number(me?.getState?.("capacity")) || 8;
    const capacity = Number(meProp.capacity ?? capFromPlayer);

    const requestAction =
        typeof game.requestAction === "function"
            ? game.requestAction
            : (type, target, value) => prRequestAction(type, target, value);

    const handleUseItem = (id) => {
        if (amDead) return;
        const item = (items || []).find((b) => b.id === id);

        if (item?.type === "food_tank") {
            requestAction("container", "food_tank", { containerId: id, op: "toggle" });
            return;
        }
        if (item?.type === "food") {
            requestAction("use", `eat|${id}`, 0);
            return;
        }
        if (typeof game.onUseItem === "function") return game.onUseItem(id);
        requestAction("useItem", String(id));
    };

    const handleDrop = (id) => {
        if (amDead) return;
        if (typeof game.onDropItem === "function") return game.onDropItem(id);
        requestAction("dropItem", String(id));
    };

    // Ability trigger → compute origin/dir and send to host
    const useAbility = (ability) => {
        if (amDead) return;
        const px = Number(me?.getState?.("x") || 0);
        const pz = Number(me?.getState?.("z") || 0);
        const ry = Number(me?.getState?.("ry") || me?.getState?.("yaw") || 0); // radians
        const dx = Math.sin(ry), dz = Math.cos(ry), dy = 0;

        const payload = { origin: [px, 1.2, pz], dir: [dx, dy, dz], abilityId: ability.id };
        requestAction("ability", ability.id, payload);
    };

    // --- measure backpack height to place ability bar above it ---
    const bpWrapRef = useRef(null);
    const [bpHeight, setBpHeight] = useState(360);
    useEffect(() => {
        const el = bpWrapRef.current;
        if (!el) return;
        const measure = () => setBpHeight(el.offsetHeight || 360);
        measure();
        let ro;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(measure);
            ro.observe(el);
        } else {
            const iv = setInterval(measure, 250);
            return () => clearInterval(iv);
        }
        return () => ro && ro.disconnect();
    }, []);

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                filter: amDead ? "grayscale(0.8)" : "none",
            }}
        >
            {/* Columns for status/role */}
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
                    <MetersPanel
                        title={outside ? "Life Support (Outside)" : "Life Support"}
                        life={lifeVal}
                        energy={energyVal}
                        oxygen={oxygenVal}
                    />
                    <div style={{ minHeight: 0 }}>
                        <RolePanel onPingObjective={() => requestAction("pingObjective", "")} />
                    </div>
                </div>

                {/* CENTER column */}
                <div />

                {/* RIGHT column (empty to keep center width stable) */}
                <div />
            </div>

            {/* Ability bar (pinned above backpack; disabled when dead) */}
            <AbilityBar role={myRole} onUse={useAbility} disabled={amDead} abovePx={bpHeight + 12} />

            {/* BOTTOM-RIGHT: Backpack (pinned) */}
            <div
                ref={bpWrapRef}
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
                <BackpackPanelCartoon
                    items={items}
                    capacity={capacity}
                    onUse={handleUseItem}
                    onDrop={handleDrop}
                />
            </div>

            {/* BOTTOM-LEFT: Team chat (pinned) */}
            <div style={{ position: "absolute", left: 16, bottom: 16, width: 360, pointerEvents: "auto" }}>
                <TeamChatPanel style={{ position: "static" }} />
            </div>

            {/* Death overlay */}
            {amDead && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        background: "radial-gradient(ellipse at center, rgba(120,0,0,0.15), rgba(0,0,0,0.65))",
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            color: "#ffe1e1",
                            textShadow: "0 2px 18px rgba(0,0,0,0.6)",
                            fontWeight: 900,
                            letterSpacing: 1,
                            fontSize: 42,
                        }}
                    >
                        YOU DIED
                    </div>
                </div>
            )}
        </div>
    );
}
