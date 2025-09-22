// src/ui/TeamChatPanel.jsx
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList, useMultiplayerState } from "playroomkit";
import "./ui.css";

/* ---------- helpers ---------- */
const safe = (v) => { try { return String(v ?? "").trim(); } catch { return ""; } };
const firstNonEmpty = (...vals) => vals.find((v) => safe(v)) || "";
const normTeamId = (s) => safe(s || "team").toLowerCase().replace(/\s+/g, "-").slice(0, 32);

export default function TeamChatPanel({
    teamName,            // optional override; otherwise reads myPlayer state
    inputDisabled = false,
    style,
}) {
    // keep UI fresh as presence can be eventual
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 500); return () => clearInterval(id); }, []);

    const me = myPlayer();
    const myId = me?.id || "me";
    const allPlayers = usePlayersList(true);

    // canonical team + channel
    const liveTeam = firstNonEmpty(teamName, me?.getState?.("team"), me?.getState?.("teamName"), "Team");
    const teamId = normTeamId(liveTeam);
    const channel = `chat:${teamId}`;

    // shared, networked buffer for this team
    const [netMsgs, setMsgs] = useMultiplayerState(channel, []); // [{id, fromId, name, text, ts}]
    const msgs = Array.isArray(netMsgs) ? netMsgs : [];

    // same-team presence
    const members = useMemo(() => {
        return (allPlayers || []).filter((p) => {
            const t = normTeamId(firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName")));
            return t === teamId;
        });
    }, [allPlayers, teamId]);

    // compose + send
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

        // sync to everyone on this team
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

    // autoscroll
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
        } catch { return ""; }
    };

    return (
        <section className="tc tc--illustrated tc--half" data-component="teamchat" style={style}>
            <div className="tc-card">
                {/* Header (glass strip): team name + online pills */}
                <header className="tc__header">
                    <div className="tc__title">{String(liveTeam).toUpperCase()}</div>
                    <div className="tc__members">
                        {members.map((p) => {
                            const name =
                                p?.getState?.("name") ||
                                p?.getProfile?.().name ||
                                p?.name ||
                                `Player-${String(p?.id || "").slice(-4)}`;
                            return (
                                <span key={p.id} className="member-pill" title={name}>
                                    <span className="dot on" />
                                    <span className="pill-name">{name}</span>
                                </span>
                            );
                        })}
                    </div>
                </header>

                {/* Messages */}
                <div className="tc__list" ref={listRef}>
                    {msgs.length === 0 && <div className="tc__empty">No messages yet.</div>}

                    {msgs.map((m) => {
                        const mine = m.fromId === myId;
                        const time = fmt(m.ts);
                        return (
                            <div key={m.id} className={`tc-bubble ${mine ? "me" : ""}`} title={`${m.name} · ${time}`}>
                                {!mine && <div className="tc-bubble__meta">{m.name} · {time}</div>}
                                <div className="tc-bubble__text">{String(m.text || "")}</div>
                            </div>
                        );
                    })}
                </div>

                {/* Input */}
                <form className="tc__inputRow" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
                    <input
                        className="tc-input"
                        type="text"
                        placeholder={inputDisabled ? "Chat disabled" : "Type a message… (Enter to send)"}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKey}
                        disabled={inputDisabled}
                    />
                    <button
                        className="tc-send"
                        disabled={inputDisabled || draft.trim() === ""}
                        type="submit"
                        title="Send"
                    >
                        Send
                    </button>
                </form>
            </div>
        </section>
    );
}
