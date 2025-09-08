import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";

/**
 * TeamChatPanel — compact card (bottom-left), sync with App **and** Playroom.
 * Props (preferred; if omitted, falls back to Playroom):
 *  - teamName?: string
 *  - members?: Array<{ id, name, role?, color?, isOnline? }>
 *  - messages?: Array<{ id, senderId, text, ts }>
 *  - myId?: string
 *  - onSend?: (text) => void
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
    // periodic refresh so Playroom reads update even if parent doesn't re-render
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 400); return () => clearInterval(id); }, []);

    const me = myPlayer();
    const allPlayers = usePlayersList(true);

    // TEAM NAME: props win; then Playroom
    const liveTeam = firstNonEmpty(
        teamName,
        me?.getState?.("team"),
        me?.getState?.("teamName")
    ) || "Team";

    // MEMBERS: if props provided, use them; else build from Playroom
    const roster = useMemo(() => {
        if (Array.isArray(members) && members.length > 0) return members;

        // Build from Playroom
        const built = allPlayers.map((p) => ({
            id: p.id,
            name: firstNonEmpty(p?.profile?.name, p?.name, p?.getState?.("name"), shortId(p.id)),
            role: safeString(p?.getState?.("role")),                // read role from player state
            team: firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName")),
            isOnline: true,
            color: p?.profile?.color,
        }));

        // If I have a team, show only that team; otherwise show all
        const myTeam = liveTeam || "";
        return myTeam ? built.filter((m) => m.team === myTeam) : built;
    }, [members, allPlayers, liveTeam]);

    // MESSAGES: props win; else try Playroom
    const liveMessages = useMemo(() => {
        if (Array.isArray(messages)) return messages;
        const perTeam = me?.getState?.(`chat:${liveTeam}`);
        if (Array.isArray(perTeam)) return perTeam;
        const generic = me?.getState?.("teamChat") || me?.getState?.("teamMessages");
        if (Array.isArray(generic)) return generic;
        return [];
    }, [messages, me, liveTeam]);

    const liveMyId = myId || me?.id || "me";

    // UI
    const [text, setText] = useState("");
    const listRef = useRef(null);

    // autoscroll when near bottom
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

        const now = Date.now();
        const msg = {
            id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
            senderId: liveMyId,
            text: t,
            ts: now,
        };

        // local optimistic echo into Playroom state (and broadcast)
        const key = `chat:${liveTeam}`;
        const prev = me?.getState?.(key);
        const next = Array.isArray(prev) ? [...prev, msg] : [msg];
        me?.setState?.(key, next, true);

        // still fire your network action if provided
        onSend?.(t);

        setText("");
    };


    const namesLine = roster.length
        ? roster.map((m) => `${m.name}${m.role ? ` (${m.role})` : ""}`).join(", ")
        : "—";

    return (
        <div
            style={{
                position: "absolute",
                left: 10,
                bottom: 10, // bottom-left anchor
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
            {/* Team name (same style as RolePanel/MetersPanel headers) */}
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

/* helpers */
function safeString(v) { if (v == null) return ""; try { return String(v).trim(); } catch { return ""; } }
function shortId(id) { const s = safeString(id); return s ? s.slice(0, 6) : "player"; }
function firstNonEmpty(...vals) { for (const v of vals) { const s = safeString(v); if (s) return s; } return ""; }
