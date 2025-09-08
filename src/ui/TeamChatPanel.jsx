import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";

/**
 * TeamChatPanel — compact card (bottom-left), LIVE roster from Playroom
 * - Shows Team name, and "Members — Name (Role)" pulled from Playroom state
 * - Polls every 400ms so it stays in sync even if parent doesn't re-render
 * - Messages: uses props if provided; otherwise reads common Playroom keys and locally echoes
 *
 * Props (all optional):
 *  - teamName?: string
 *  - members?: Array<{ id, name, color?, isOnline? }>
 *  - messages?: Array<{ id, senderId, text, ts }>
 *  - myId?: string
 *  - onSend?: (text: string) => void
 *  - inputDisabled?: boolean
 *  - style?: React.CSSProperties
 */
export default function TeamChatPanel({
    teamName,
    members,
    messages,
    myId,
    onSend,
    inputDisabled = false,
    style,
}) {
    // Force periodic refresh so Playroom state changes show up
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => {
        const id = setInterval(force, 400);
        return () => clearInterval(id);
    }, []);

    const me = myPlayer();
    const allPlayers = usePlayersList(true);

    // --- LIVE team name (prop wins, then myPlayer state) ---
    const liveTeam =
        firstNonEmpty(teamName, me?.getState?.("team"), me?.getState?.("teamName")) || "Team";

    // --- LIVE roster: names + roles from Playroom ---
    const roster = useMemo(() => {
        // If caller passed members, keep them but enrich with role/team when possible
        const base = (Array.isArray(members) && members.length > 0
            ? members
            : allPlayers.map((p) => ({
                id: p.id,
                name: firstNonEmpty(p?.profile?.name, p?.name, p?.getState?.("name"), shortId(p.id)),
                color: p?.profile?.color,
            }))
        ).map((m) => {
            // find the actual Playroom player to read state from
            const p = allPlayers.find((x) => x.id === m.id);
            const role = safeString(p?.getState?.("role")) || "Unassigned";
            const team = firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName"));
            return { ...m, role, team };
        });

        // Filter to my team if I have one; otherwise show everyone
        const myTeam = liveTeam || "";
        const filtered = myTeam ? base.filter((m) => m.team === myTeam) : base;

        // Mark online if not provided
        return filtered.map((m) => ({ isOnline: true, ...m }));
    }, [members, allPlayers, liveTeam]);

    // --- myId (live) ---
    const liveMyId = myId || me?.id || "me";

    // --- LIVE messages: props first, then Playroom common keys ---
    const liveMessages = useMemo(() => {
        if (Array.isArray(messages)) return messages;

        // Prefer a per-team key (lets different teams have isolated chats)
        const perTeam = me?.getState?.(`chat:${liveTeam}`);
        if (Array.isArray(perTeam)) return perTeam;

        const teamChat = me?.getState?.("teamChat");
        if (Array.isArray(teamChat)) return teamChat;

        const teamMessages = me?.getState?.("teamMessages");
        if (Array.isArray(teamMessages)) return teamMessages;

        return [];
    }, [messages, me, liveTeam]);

    // --- UI state ---
    const [text, setText] = useState("");
    const listRef = useRef(null);

    // autoscroll if near bottom
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
        if (atBottom) el.scrollTop = el.scrollHeight;
    }, [liveMessages]);

    const send = (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;

        if (onSend) {
            onSend(t);
        } else {
            // Local echo so you can see messages immediately
            const now = Date.now();
            const msg = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, senderId: liveMyId, text: t, ts: now };
            const key = `chat:${liveTeam}`;
            const prev = me?.getState?.(key);
            const next = Array.isArray(prev) ? [...prev, msg] : [msg];
            me?.setState?.(key, next, true);
        }

        setText("");
    };

    const namesLine =
        roster.length > 0
            ? roster.map((m) => `${m.name} (${m.role || "—"})`).join(", ")
            : "—";

    return (
        <div
            style={{
                position: "absolute",
                left: 10,
                bottom: 10, // bottom-left corner
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                padding: 10,
                borderRadius: 10,
                display: "grid",
                gap: 10,
                color: "white",
                width: 360,
                maxHeight: "46vh",
                gridTemplateRows: "auto auto 1fr auto",
                ...style,
            }}
        >
            {/* Team name */}
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Team — {liveTeam}</div>
            </div>

            {/* Members + roles */}
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Members — {namesLine}</div>
            </div>

            {/* Messages */}
            <div
                ref={listRef}
                style={{
                    minHeight: 0,
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingRight: 2,
                }}
            >
                {liveMessages.length === 0 && (
                    <div
                        style={{
                            fontSize: 12,
                            opacity: 0.7,
                            padding: "8px 10px",
                            background: "#1b2433",
                            border: "1px solid #2a3242",
                            borderRadius: 6,
                        }}
                    >
                        No messages yet.
                    </div>
                )}

                {liveMessages.map((m) => {
                    const mine = m.senderId === liveMyId;
                    const sender = roster.find((x) => x.id === m.senderId);
                    const senderLabel = sender ? `${sender.name}${sender.role ? ` (${sender.role})` : ""}` : "Unknown";

                    return (
                        <div
                            key={m.id}
                            style={{
                                alignSelf: mine ? "flex-end" : "flex-start",
                                maxWidth: "85%",
                                background: mine ? "#19324a" : "#1b2433",
                                border: "1px solid #2a3242",
                                borderRadius: 6,
                                padding: "8px 10px",
                                fontSize: 12,
                                lineHeight: 1.35,
                            }}
                            title={new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        >
                            {!mine && (
                                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
                                    {senderLabel}
                                </div>
                            )}
                            {m.text}
                        </div>
                    );
                })}
            </div>

            {/* Input */}
            <form onSubmit={send} style={{ display: "flex", gap: 6 }}>
                <input
                    type="text"
                    placeholder="Send a message to your team…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={inputDisabled}
                    style={{
                        flex: 1,
                        background: "#0e141f",
                        border: "1px solid #2a3242",
                        color: "white",
                        padding: "8px 10px",
                        borderRadius: 8,
                        fontSize: 12,
                    }}
                />
                <button
                    disabled={inputDisabled || text.trim() === ""}
                    style={{
                        background: "linear-gradient(180deg,#3098ff,#2677ff)",
                        color: "white",
                        border: "none",
                        padding: "8px 10px",
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: inputDisabled || text.trim() === "" ? "not-allowed" : "pointer",
                        opacity: inputDisabled || text.trim() === "" ? 0.6 : 1,
                    }}
                >
                    Send
                </button>
            </form>
        </div>
    );
}

/* ----------------- helpers ----------------- */
function safeString(v) {
    if (v == null) return "";
    try { return String(v).trim(); } catch { return ""; }
}
function shortId(id) {
    const s = safeString(id);
    return s ? s.slice(0, 6) : "player";
}
function firstNonEmpty(...vals) {
    for (const v of vals) {
        const s = safeString(v);
        if (s) return s;
    }
    return "";
}
