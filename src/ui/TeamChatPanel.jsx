import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";

export default function TeamChatPanel({
    teamName,
    members,
    messages,
    myId,
    onSend,
    inputDisabled = false,
    style,
}) {
    // force refresh so Playroom state changes are visible even if parent doesn't re-render
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 400); return () => clearInterval(id); }, []);

    const me = myPlayer();
    const allPlayers = usePlayersList(true);

    // TEAM: prop wins; then Playroom; then "Team"
    const liveTeam = firstNonEmpty(teamName, me?.getState?.("team"), me?.getState?.("teamName")) || "Team";
    const teamKey = `chat:${liveTeam}`; // single source key

    // --- LOCAL FALLBACK BUFFER (ensures you see your message instantly even if Playroom write fails) ---
    const [localMsgs, setLocalMsgs] = useState([]);

    // ROSTER: props win; else build from Playroom
    const roster = useMemo(() => {
        if (Array.isArray(members) && members.length > 0) return members;

        const built = allPlayers.map((p) => ({
            id: p.id,
            name: firstNonEmpty(p?.profile?.name, p?.name, p?.getState?.("name"), shortId(p.id)),
            role: safeString(p?.getState?.("role")),
            team: firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName")),
            isOnline: true,
            color: p?.profile?.color,
        }));
        // If I have a team, show only that team; else everyone
        return liveTeam ? built.filter((m) => m.team === liveTeam) : built;
    }, [members, allPlayers, liveTeam]);

    const liveMyId = myId || me?.id || "me";

    // MESSAGES (display): props → Playroom per-team → Playroom generic → local buffer
    const liveMessages = useMemo(() => {
        if (Array.isArray(messages)) return messages;

        const perTeam = me?.getState?.(teamKey);
        if (Array.isArray(perTeam)) return perTeam;

        const generic = me?.getState?.("teamChat") || me?.getState?.("teamMessages");
        if (Array.isArray(generic)) return generic;

        return localMsgs; // final fallback so something shows
    }, [messages, me, teamKey, localMsgs]);

    // Basic UI state
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

        // Construct message once
        const now = Date.now();
        const msg = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, senderId: liveMyId, text: t, ts: now };

        // 1) Local echo (guaranteed immediate UI)
        setLocalMsgs((curr) => [...curr, msg]);

        // 2) Write to Playroom (if API exists)
        try {
            const prev = me?.getState?.(teamKey);
            const next = Array.isArray(prev) ? [...prev, msg] : [msg];
            me?.setState?.(teamKey, next, true);
        } catch { }

        // 3) Upstream action (your networking)
        try { onSend?.(t); } catch { }

        setText("");
    };

    const namesLine = roster.length
        ? roster.map((m) => `${m.name}${m.role ? ` (${m.role})` : ""}`).join(", ")
        : "—";

    return (
        <div
            style={{
                position: "absolute",
                left: 16,
                bottom: 16,
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
                pointerEvents: "auto",
                ...style,
            }}
        >
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Team — {liveTeam}</div>
            </div>

            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Members — {namesLine}</div>
            </div>

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
