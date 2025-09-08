import React, { useMemo } from "react";
import { myPlayer, usePlayersList } from "playroomkit";

export function VotePanel({ dead }) {
    const players = usePlayersList(true);
    const alive = useMemo(
        () => players.filter((p) => !dead.includes(p.id)),
        [players, dead]
    );
    const me = myPlayer();
    const myVote = String(me.getState("vote") || "");
    const choose = (id) => me.setState("vote", id || "skip", true);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.5)",
                color: "white",
                fontFamily: "ui-sans-serif",
            }}
        >
            <div
                style={{ background: "#141922", padding: 16, borderRadius: 10, width: 420 }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>Meeting — Vote</h3>
                    <small style={{ opacity: 0.7 }}>select a suspect</small>
                </div>

                <div style={{ display: "grid", gap: 8, maxHeight: 320, overflow: "auto" }}>
                    {alive.map((p) => {
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
                        }}
                    >
                        Skip vote
                    </button>
                </div>
            </div>
        </div>
    );
}
