import React, { useEffect, useMemo, useRef, useState, useReducer } from "react";
import { myPlayer, usePlayersList } from "playroomkit";

/**
 * TeamChatPanel — compact card (bottom-left), live-synced with Playroom
 * Props (all optional, live values are used if omitted):
 *  - teamName?: string
 *  - members?: Array<{ id:string, name:string, color?:string, isOnline?:boolean }>
 *  - messages?: Array<{ id:string, senderId:string, text:string, ts:number }>
 *  - myId?: string
 *  - onSend?: (text:string) => void   // if omitted, messages are locally echoed to myPlayer() state
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
    // force periodic refresh so we see Playroom state changes immediately
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => {
        const id = setInterval(force, 400);
        return () => clearInterval(id);
    }, []);

    const me = myPlayer();
    const allPlayers = usePlayersList(true);

    // ---- LIVE TEAM NAME ----
    const liveTeam =
        firstNonEmpty(
            teamName,
            me?.getState?.("team"),
            me?.getState?.("teamName")
        ) || "Team";

    // ---- LIVE MEMBERS (filter by same team) ----
    const liveMembers = useMemo(() => {
        const list = Array.isArray(members) && members.length > 0 ? members : allPlayers.map((p) => ({
            id: p.id,
            name: p?.profile?.name || p?.name || shortId(p.id),
            color: p?.profile?.color,
            isOnline: true,
            _team: safeString(p?.getState?.("team") || p?.getState?.("teamName")),
        }));
        return list
            .filter((m) => !m._team || m._team === liveTeam) // if no team on member, we keep them; adjust if needed
            .map(({ _team, ...m }) => m);
    }, [members, allPlayers, liveTeam]);

    // Determine current player id (live)
    const liveMyId = myId || me?.id || "me";

    // ---- LIVE MESSAGES (check common state keys if props empty) ----
    const liveMessages = useMemo(() => {
        if (Array.isArray(messages)) return messages;

        // Try chat:<team>
        const keyed = me?.getState?.(`chat:${liveTeam}`);
        if (Array.isArray(keyed)) return keyed;

        // Try generic keys
        const teamChat = me?.getState?.("teamChat");
        if (Array.isArray(teamChat)) return teamChat;

        const teamMessages = me?.getState?.("teamMessages");
        if (Array.isArray(teamMessages)) return teamMessages;

        return [];
    }, [messages, me, liveTeam]);

    // ---- UI state ----
    const [text, setText] = useState("");
    const listRef = useRef(null);

    // autoscroll when already at bottom
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
            // Local echo to Playroom player state so the panel stays responsive without wiring
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
        liveMembers.length > 0 ? liveMembers.map((m) => m.name || "Player").join(", ") : "—";

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
                width: 340,
                maxHeight: "46vh",
                gridTemplateRows: "auto auto 1fr auto",
                ...style,
            }}
        >
            {/* Title line */}
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Team — {liveTeam}</div>
            </div>

            {/* Members line */}
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
                                    {memberName(liveMembers, m.senderId)}
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

/* --------------- helpers --------------- */
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
function memberName(members, id) {
    return members.find((m) => m.id === id)?.name || "Unknown";
}
