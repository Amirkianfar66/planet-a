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
    // force refresh so remote state changes render even if parent doesn't re-render
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 400); return () => clearInterval(id); }, []);

    const me = myPlayer();
    const allPlayers = usePlayersList(true);

    // TEAM name: prop wins; else my state; else "Team"
    const liveTeam =
        firstNonEmpty(teamName, me?.getState?.("team"), me?.getState?.("teamName")) || "Team";
    const teamKey = `chat:${liveTeam}`;

    // Local fallback buffer (so you see your message immediately even if network is slow)
    const [localMsgs, setLocalMsgs] = useState([]);

    // Roster: props win; else build from all players (filter by team)
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
        return built.filter((m) => !liveTeam || m.team === liveTeam);
    }, [members, allPlayers, liveTeam]);

    const liveMyId = myId || me?.id || "me";

    // 🔽 Aggregate messages from ALL players in this team
    const aggregatedFromPlayers = useMemo(() => {
        const collected = [];
        for (const p of allPlayers) {
            const pTeam = firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName"));
            if (liveTeam && pTeam !== liveTeam) continue;
            const arr = p?.getState?.(teamKey);
            if (Array.isArray(arr)) {
                for (const m of arr) {
                    // normalize and tag the origin to help dedupe
                    collected.push({
                        id: String(m.id ?? `${m.senderId ?? p.id}-${m.ts ?? 0}`),
                        senderId: m.senderId ?? p.id,
                        text: String(m.text ?? ""),
                        ts: Number(m.ts ?? 0),
                        _from: p.id,
                    });
                }
            }
        }
        // dedupe by id, then sort by ts asc
        const map = new Map();
        for (const m of collected) if (!map.has(m.id)) map.set(m.id, m);
        return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
    }, [allPlayers, liveTeam, teamKey]);

    // Final messages: props → aggregatedFromPlayers → my own state → local buffer
    const liveMessages = useMemo(() => {
        if (Array.isArray(messages)) return messages;
        const fromMe = me?.getState?.(teamKey);
        const combined = [
            ...(aggregatedFromPlayers || []),
            ...(Array.isArray(fromMe)
                ? fromMe.map((m) => ({
                    id: String(m.id ?? `${m.senderId ?? liveMyId}-${m.ts ?? 0}`),
                    senderId: m.senderId ?? liveMyId,
                    text: String(m.text ?? ""),
                    ts: Number(m.ts ?? 0),
                }))
                : []),
            ...(localMsgs || []),
        ];
        // dedupe and sort again in case of overlap
        const map = new Map();
        for (const m of combined) if (!map.has(m.id)) map.set(m.id, m);
        return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
    }, [messages, aggregatedFromPlayers, me, teamKey, localMsgs, liveMyId]);

    // ui state
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

        // 1) local echo for instantaneous UI
        setLocalMsgs((curr) => [...curr, msg]);

        // 2) write to *my* Playroom player state, broadcast=true
        try {
            const prev = me?.getState?.(teamKey);
            const next = Array.isArray(prev) ? [...prev, msg] : [msg];
            me?.setState?.(teamKey, next, true);
        } catch { }

        // 3) optional network action (host can rebroadcast / persist)
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
            <div style={{ fontSize: 12, opacity: 0.8 }}>Team — {liveTeam}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Members — {namesLine}</div>

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
