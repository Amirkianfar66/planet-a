// src/ui/HUD.jsx
import React, { useEffect, useMemo, useState } from "react";
import { myPlayer } from "playroomkit";
import { MetersPanel, RolePanel, BackpackPanel, TeamChatPanel } from ".";
import { useGameState } from "../game/GameStateProvider";
import { requestAction as prRequestAction } from "../network/playroom";
import { getAbilitiesForRole } from "../game/roleAbilities";
import { isOutsideByRoof } from "../map/deckA";
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
            <div>
                <Key>F</Key> Role Ability &nbsp;·&nbsp; <Key>G</Key> Bite <span style={{ opacity: 0.7 }}>(if infected)</span>
            </div>
        </div>
    );
}

/* ---------- Ability bar (bottom-right above backpack) --------- */
function AbilityBar({ role, onUse, disabled = false }) {
    // Track infection so abilities recompute immediately after infection flips
    const me = myPlayer();
    const [infected, setInfected] = useState(!!me?.getState?.("infected"));
    useEffect(() => {
        const t = setInterval(() => {
            const flag = !!me?.getState?.("infected");
            setInfected(prev => (prev === flag ? prev : flag));
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

    // Key binding: match by configured key for ANY ability (F for role, G for Bite, etc.)
    useEffect(() => {
        if (disabled) return;
        const onKey = (e) => {
            const hit = abilities.find(ab => (ab.key || "KeyF") === e.code);
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
                bottom: 16 + 360 + 12, // stack just above backpack (backpack ~360px tall)
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                padding: 8,
                borderRadius: 10,
                color: "white",
                width: 220,
                pointerEvents: "auto",
                opacity: disabled ? 0.5 : 1,
            }}
        >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Role Ability</div>
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
                        style={{ width: "100%" }}
                        title={a.label}
                    >
                        {a.icon || "★"} {a.label} {readyIn > 0 ? `(${sec}s)` : ""}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * HUD – overlay
 * - Left: Status (Life/O2/Energy), Role
 * - Chat: bottom-left
 * - Top-center: Keyboard guide (hidden when dead)
 * - Backpack: bottom-right
 * - Ability bar: above backpack (disabled when dead)
 */
export default function HUD({ game = {} }) {
    const { oxygen = 100, power = 100, myRole = "Unassigned" } = useGameState();

    const me = myPlayer();
    const lifeVal = Number(me?.getState?.("life") ?? 100);
    const amDead = Boolean(me?.getState?.("dead"));
    // ✅ NEW: read local player energy and keep it in state so HUD updates
    const [energyVal, setEnergyVal] = useState(Number(me?.getState?.("energy") ?? 100));
    useEffect(() => {
        const iv = setInterval(() => {
            const v = Number(myPlayer()?.getState?.("energy") ?? 100);
            setEnergyVal(prev => (prev === v ? prev : v));
        }, 150);
        return () => clearInterval(iv);
    }, []);

    // ✅ NEW: live oxygen from player state (host updates this)
    const [oxygenVal, setOxygenVal] = useState(Number(me?.getState?.("oxygen") ?? 100));
    useEffect(() => {
          const iv = setInterval(() => {
                     const v = Number(myPlayer()?.getState?.("oxygen") ?? 100);
                     setOxygenVal(prev => (prev === v ? prev : v));
          }, 150);
              return () => clearInterval(iv);
    }, []);
        // ✅ NEW: track position for outside/inside check
    const [pos, setPos] = useState({
     x: Number(me?.getState?.("x") || 0),
                   z: Number(me?.getState?.("z") || 0),
                });
   useEffect(() => {
           const iv = setInterval(() => {
                   const p = myPlayer();
                   setPos(prev => {
                           const nx = Number(p?.getState?.("x") || 0);
                           const nz = Number(p?.getState?.("z") || 0);
                           return (prev.x === nx && prev.z === nz) ? prev : { x: nx, z: nz };
                   });
           }, 120);
           return () => clearInterval(iv);
        }, []);
   const outside = isOutsideByRoof(pos.x, pos.z); // ✅ NEW
    // ✅ NEW: keep a live snapshot of the backpack so stacking/counts update immediately
    const [bpSnapshot, setBpSnapshot] = useState(() => me?.getState?.("backpack") || []);
    useEffect(() => {
           let mounted = true;
              const iv = setInterval(() => {
                      const next = myPlayer()?.getState?.("backpack") || [];
                      // cheap shallow-ish compare (length + ids/types/qty)
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
    const bpFromPlayer = bpSnapshot; // live, host-driven snapshot
    const capFromPlayer = Number(me?.getState?.("capacity")) || 8;
 
   // Always prefer the live snapshot so backpack reflects host changes instantly
    const items = bpFromPlayer;
    const capacity = Number(meProp.capacity ?? capFromPlayer);

    const requestAction =
        typeof game.requestAction === "function"
            ? game.requestAction
            : (type, target, value) => prRequestAction(type, target, value);

    const handleUseItem = (id) => {
        if (amDead) return; // dead: no using

        // Look up the clicked item in the backpack to decide behavior
        const item = (items || []).find((b) => b.id === id);

        if (item?.type === "food_tank") {
            // Toggle: host tries to load 1 food into the tank (if you have any / not full),
            // otherwise unloads 1 food back to your backpack.
            requestAction("container", "food_tank", { containerId: id, op: "toggle" });
            return;
        }

        if (item?.type === "food") {
            // Eat one food from backpack
            requestAction("use", `eat|${id}`, 0);
            return;
        }

        // Fallback for other types (keeps previous behavior you had)
        if (typeof game.onUseItem === "function") return game.onUseItem(id);
        requestAction("useItem", String(id));
    };

    const handleDrop = (id) => {
        if (amDead) return; // dead: no dropping
        if (typeof game.onDropItem === "function") return game.onDropItem(id);
        requestAction("dropItem", String(id));
    };

    // Ability trigger → compute origin/dir and send to host
    const useAbility = (ability) => {
        if (amDead) return; // dead: no abilities
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
        <div
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                filter: amDead ? "grayscale(0.8)" : "none",
            }}
        >
            {/* Keyboard guide (hidden when dead) */}
            {!amDead && <KeyGuidePanel />}

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
                    {/* ✅ Use live oxygen + show when outside */}
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

                {/* CENTER column (free) */}
                <div />

                {/* RIGHT column left empty to keep center width stable */}
                <div />
            </div>

            {/* Ability bar (pinned above backpack; disabled when dead) */}
            <AbilityBar role={myRole} onUse={useAbility} disabled={amDead} />

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

            {/* BOTTOM-LEFT: Team chat (pinned). If you want to block typing when dead, add inputDisabled to TeamChatPanel. */}
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
