// src/ui/TeamChatPanel.jsx
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList, useMultiplayerState } from "playroomkit";
import "./ui.css";

/* ---------- helpers ---------- */
const safe = (v) => {
    try { return String(v ?? "").trim(); } catch { return ""; }
};
const firstNonEmpty = (...vals) => vals.find((v) => safe(v)) || "";
const normTeamId = (s) =>
    safe(s || "team").toLowerCase().replace(/\s+/g, "-").slice(0, 32);

/**
 * Team-only chat using a shared multiplayer state:
 *  - canonical channel per team: `chat:<normalized team>`
 *  - writes replicate with setState(..., true)
 *  - presence shows only same-team players
 */
export default function TeamChatPanel({
    teamName,               // optional override; otherwise reads myPlayer state
    inputDisabled = false,
    style,
}) {
    // Presence in playroom can be eventual; this small ticker keeps UI fresh.
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => {
        const id = setInterval(force, 500);
        return () => clearInterval(id);
    }, []);

    const me = myPlayer();
    const myId = me?.id || "me";
    const allPlayers = usePlayersList(true);

    // Canonical team label/id
    const liveTeam = firstNonEmpty(
        teamName,
        me?.getState?.("team"),
        me?.getState?.("teamName"),
        "Team"
    );
    const teamId = normTeamId(liveTeam);
    const channel = `chat:${teamId}`;

    // Shared, networked buffer for this team
    const [netMsgs, setMsgs] = useMultiplayerState(channel, []); // [{id, fromId, name, text, ts}]
    const msgs = Array.isArray(netMsgs) ? netMsgs : [];

    // Same-team presence
    const members = useMemo(() => {
        return (allPlayers || []).filter((p) => {
            const t = normTeamId(
                firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName"))
            );
            return t === teamId;
        });
    }, [allPlayers, teamId]);

    // Compose + send
    const [draft, setDraft] = useState("");
    const send = (textRaw) => {
        const text = safe(textRaw);
        if (!text) return;

        const name =
            me?.getState?.("name") ||
            me?.getProfile?.().name ||
            me?.name ||
            `Player-${String(myId).slice(-4)}`;

        const ts = Date.now();
        const msg = {
            id: `${myId}:${ts}:${Math.random().toString(36).slice(2, 7)}`,
            fromId: myId,
            name,
            text: text.slice(0, 500),
            ts,
        };

        // Important: pass 'true' to sync to everyone on this team
        setMsgs((prev) => {
            const base = Array.isArray(prev) ? prev : [];
            const next = [...base, msg];
            if (next.length > 120) next.splice(0, next.length - 120);
            return next;
        }, true);

        setDraft("");
    };

    // Enter to send
    const onKey = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!inputDisabled) send(draft);
        }
    };

    // Autoscroll
    const listRef = useRef(null);
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [msgs?.length]);

    const fmt = (ts) => {
        try {
            const d = new Date(ts);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            return `${hh}:${mm}`;
        } catch {
            return "";
        }
    };

    return (
        <div
            className="team-chat"
            style={{
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                borderRadius: 12,
                color: "white",
                padding: 10,
                fontFamily: "ui-sans-serif",
                width: "100%",
                ...style,
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                }}
            >
                <div style={{ fontWeight: 700 }}>Team Chat — {liveTeam}</div>
                <div className="member-row">
                    {members.map((p) => {
                        const name =
                            p?.getState?.("name") ||
                            p?.getProfile?.().name ||
                            p?.name ||
                            `Player-${String(p?.id || "").slice(-4)}`;
                        return (
                            <span key={p.id} className="member-pill" title={name}>
                                <span className="dot on" />
                                <span style={{ fontSize: 12 }}>{name}</span>
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* Body */}
            <div className="chat-body">
                <div ref={listRef} className="chat-list">
                    {(msgs || []).map((m) => {
                        const isMe = m.fromId === myId;
                        return (
                            <div key={m.id} className={`bubble ${isMe ? "me" : ""}`}>
                                <div className="bubble-author">
                                    <span style={{ fontWeight: 700 }}>{m.name || "Player"}</span>
                                    <span style={{ opacity: 0.7 }}>· {fmt(m.ts)}</span>
                                </div>
                                <div className="bubble-text">{String(m.text || "")}</div>
                            </div>
                        );
                    })}
                </div>

                {/* Input */}
                <div className="chat-input">
                    <input
                        disabled={inputDisabled}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKey}
                        placeholder={
                            inputDisabled ? "Chat disabled" : "Type a message… (Enter to send)"
                        }
                    />
                    <button
                        className="item-btn"
                        disabled={inputDisabled || !draft.trim()}
                        onClick={() => send(draft)}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
