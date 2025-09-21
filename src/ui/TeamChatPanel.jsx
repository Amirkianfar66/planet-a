import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import "./ui.css";

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
    const allPlayers = usePlayersList();

    // TEAM name: prop wins; else my state; else "Team"
    const liveTeam =
        firstNonEmpty(teamName, me?.getState?.("team"), me?.getState?.("teamName")) || "Team";
    const teamKey = `chat:${liveTeam}`;

    // Local fallback buffer (instant echo)
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

    // Aggregate messages from all players on this team
    const aggregatedFromPlayers = useMemo(() => {
        const collected = [];
        for (const p of allPlayers) {
            const pTeam = firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName"));
            if (liveTeam && pTeam !== liveTeam) continue;
            const arr = p?.getState?.(teamKey);
            if (Array.isArray(arr)) {
                for (const m of arr) {
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
        const map = new Map();
        for (const m of collected) if (!map.has(m.id)) map.set(m.id, m);
        return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
    }, [allPlayers, liveTeam, teamKey]);

    // Final messages: props → aggregated → my own state → local buffer
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

        // 1) local echo
        setLocalMsgs((curr) => [...curr, msg]);

        // 2) broadcast via Playroom
        try {
            const prev = me?.getState?.(teamKey);
            const next = Array.isArray(prev) ? [...prev, msg] : [msg];
            me?.setState?.(teamKey, next, true);
        } catch { }

        // 3) optional host action
        try { onSend?.(t); } catch { }

        setText("");
    };

    return (
        <section className="tc tc--illustrated" data-component="teamchat" style={style}>
            <div className="tc-card">
                {/* Messages only (no team/members headers) */}
                <div className="tc__list" ref={listRef}>
                    {liveMessages.length === 0 && (
                        <div className="tc__empty">No messages yet.</div>
                    )}

                    {liveMessages.map((m) => {
                        const mine = m.senderId === liveMyId;
                        const sender = roster.find((x) => x.id === m.senderId);
                        const senderLabel = sender
                            ? `${sender.name}${sender.role ? ` (${sender.role})` : ""}`
                            : "Unknown";
                        const time = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                        return (
                            <div
                                key={m.id}
                                className={`tc-bubble ${mine ? "me" : ""}`}
                                title={`${senderLabel} — ${time}`}
                            >
                                {m.text}
                            </div>
                        );
                    })}
                </div>

                <form className="tc__inputRow" onSubmit={send}>
                    <input
                        className="tc-input"
                        type="text"
                        placeholder="Message your team…"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={inputDisabled}
                    />
                    <button
                        className="tc-send"
                        disabled={inputDisabled || text.trim() === ""}
                    >
                        Send
                    </button>
                </form>
            </div>
        </section>
    );
}

/* helpers */
function safeString(v) { if (v == null) return ""; try { return String(v).trim(); } catch { return ""; } }
function shortId(id) { const s = safeString(id); return s ? s.slice(0, 6) : "player"; }
function firstNonEmpty(...vals) { for (const v of vals) { const s = safeString(v); if (s) return s; } return ""; }
