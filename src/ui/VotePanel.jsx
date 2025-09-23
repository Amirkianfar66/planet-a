// src/ui/VotePanel.jsx
import React, { useMemo } from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import { useGameState } from "../game/GameStateProvider";

export function VotePanel() {
    const { dead = [], phase, timer } = useGameState();
    const players = usePlayersList(); // presence-based

    // Candidates = alive and NOT in lockdown
    const candidates = useMemo(() => {
        return players.filter((p) => {
            if (dead.includes(p.id)) return false;             // excluded by server list
            try {
                const isDead = !!p.getState?.("dead");
                const lockedNow =
                    !!p.getState?.("inLockdown") ||                // arrest flow
                    !!p.getState?.("in_lockdown") ||               // vote-summon flow
                    !!p.getState?.("locked");                      // extra flag in vote-summon
                return !isDead && !lockedNow;
            } catch {
                return true;
            }
        });
    }, [players, dead]);

    const me = myPlayer();
    const myVote = String(me?.getState?.("vote") || "");
    const choose = (id) => me?.setState?.("vote", id || "skip", true);

    const mt = Number(timer ?? 0);
    const mm = String(Math.floor(mt / 60)).padStart(2, "0");
    const ss = String(mt % 60).padStart(2, "0");
    if (phase !== "meeting") return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                display: "grid",
                placeItems: "right",
                background: "rgba(0,0,0,0.5)",
                color: "white",
                fontFamily: "ui-sans-serif",
                zIndex: 50,
            }}
        >
            <div style={{ background: "#141922", padding: 16, borderRadius: 10, width: 420 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>Meeting — Vote</h3>
                    <small style={{ opacity: 0.7 }}>{mm}:{ss}</small>
                </div>

                <div style={{ display: "grid", gap: 8, maxHeight: 320, overflow: "auto" }}>
                    {candidates.map((p) => {
                        const name = p.getProfile().name || "Player " + p.id.slice(0, 4);
                        const selected = myVote === p.id;
                        return (
                            <button
                                key={p.id}
                                onClick={() => choose(p.id)}
                                style={{
                                    textAlign: "left",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    border: selected ? "2px solid #6ee7ff" : "1px solid #2a3242",
                                    background: selected ? "#0e2a33" : "#1a2230",
                                    color: "white",
                                    cursor: "pointer",
                                }}
                            >
                                {name}
                            </button>
                        );
                    })}

                    <button
                        onClick={() => choose("skip")}
                        style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #2a3242",
                            background: myVote === "skip" ? "#2a1a1a" : "#1f1a1a",
                            color: "#ffb4b4",
                            cursor: "pointer",
                        }}
                    >
                        Skip vote
                    </button>
                </div>
            </div>
        </div>
    );
}
