// src/ui/TeamChatPanel.jsx
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList, useMultiplayerState, getRoomCode } from "playroomkit";
import "./ui.css";

/* ---------- helpers ---------- */
const safe = (v) => { try { return String(v ?? "").trim(); } catch { return ""; } };
const firstNonEmpty = (...vals) => vals.find((v) => safe(v)) || "";

/** Robust team slug + aliases (TeamA / Alpha / A / 1 → teama; TeamB / Beta / B / 2 → teamb) */
const normTeamId = (s) => {
    const base = safe(s || "team");
    const lower = (base.normalize?.("NFKD") || base).toLowerCase().replace(/\p{M}/gu, "");
    const collapsed = lower.replace(/[^a-z0-9]+/g, "");
    const afterTeam = collapsed.startsWith("team") ? collapsed.slice(4) : collapsed;

    const mapAlias = (w) => {
        switch (w) {
            case "teama": case "a": case "alpha": case "1": case "one": case "i": return "teama";
            case "teamb": case "b": case "beta": case "bravo": case "2": case "ii": return "teamb";
            default: return "";
        }
    };
    const viaAfterTeam = mapAlias(afterTeam); if (viaAfterTeam) return viaAfterTeam;
    const viaCollapsed = mapAlias(collapsed); if (viaCollapsed) return viaCollapsed;

    const tokens = lower.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
    for (const t of tokens) { const a = mapAlias(t); if (a) return a; }

    const out = afterTeam || collapsed;
    return out.slice(0, 32) || "team";
};

// Merge + dedupe by id
const dedupeById = (arr) => {
    const seen = new Set();
    const out = [];
    for (const m of arr || []) {
        if (!m || !m.id) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
    }
    return out;
};

/**
 * TeamChatPanel — supports GLOBAL and TEAM chat.
 * - Default: global channel (everyone in the room): channel = "chat:global"
 * - Team mode: pass scope="team" to use per-team channel "chat:<teamId>"
 * Includes a fallback transport (per-player state mirror) for extra reliability.
 *
 * Skinned to match Backpack (glass/ink/illustrated) via .tc--illustrated in ui.css
 */
export default function TeamChatPanel({
    scope = "global",       // "global" | "team"
    teamName,               // used only when scope === "team"
    inputDisabled = false,
    height = 360,
    style,
    debug = false,          // show room/channel + counts
}) {
    // keep presence UI fresh
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 500); return () => clearInterval(id); }, []);

    const me = myPlayer();
    const myId = me?.id || "";
    const allPlayers = usePlayersList(true);

    // Room readiness — avoid binding shared state until we have a room code
    const room = (() => {
        try { return getRoomCode?.() || new URL(location.href).searchParams.get("r") || ""; }
        catch { return ""; }
    })();
    const ready = Boolean(room && myId);

    // Canonical team label/id (only for team scope)
    const liveTeam = firstNonEmpty(teamName, me?.getState?.("team"), me?.getState?.("teamName"), "Team");
    const teamId = normTeamId(liveTeam);

    // Channel selection
    const channel = scope === "team" ? `chat:${teamId}` : "chat:global";

    // Presence (all players for global; same-team for team scope)
    const members = useMemo(() => {
        if (scope !== "team") return allPlayers || [];
        return (allPlayers || []).filter((p) => {
            const t = normTeamId(firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName")));
            return t === teamId;
        });
    }, [allPlayers, scope, teamId]);

    // Local echo to show immediately
    const [localMsgs, setLocalMsgs] = useState([]);
    const lastChannelRef = useRef(channel);
    useEffect(() => {
        if (lastChannelRef.current !== channel) {
            lastChannelRef.current = channel;
            setLocalMsgs([]); // switching channel → clear local buffer
        }
    }, [channel]);

    // Not ready yet → illustrated shell with "Connecting…"
    if (!ready) {
        return (
            <section className="tc tc--illustrated tc--half" style={{ height, ...style }}>
                <div className="tc-card">
                    <header className="tc__header">
                        <div className="tc__title">{(scope === "team" ? liveTeam : "GLOBAL").toUpperCase()}</div>
                        {debug && <div className="tc__members" style={{ opacity: .7, fontSize: 11 }}>joining room…</div>}
                    </header>
                    <div className="tc__list" style={{ display: "grid", placeItems: "center", opacity: .75 }}>
                        Connecting…
                    </div>
                    <form className="tc__inputRow" onSubmit={(e) => e.preventDefault()}>
                        <input className="tc-input" disabled placeholder="Chat disabled until connected…" />
                        <button className="tc-send" disabled>Send</button>
                    </form>
                </div>
            </section>
        );
    }

    // ---- Ready: mount shared state ----
    const [netMsgsRaw, setMsgs] = useMultiplayerState(channel, []); // shared buffer
    const netMsgs = Array.isArray(netMsgsRaw) ? netMsgsRaw : [];

    // Self-heal corrupted channel (not an array)
    const healedRef = useRef(false);
    useEffect(() => {
        if (!healedRef.current && !Array.isArray(netMsgsRaw)) {
            healedRef.current = true;
            setMsgs(() => [], true);
        }
    }, [netMsgsRaw, setMsgs]);

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
        const msg = { id: `${myId}:${ts}:${Math.random().toString(36).slice(2, 7)}`, fromId: myId, name, text: text.slice(0, 500), ts };

        // 1) Local echo
        setLocalMsgs((prev) => [...prev, msg]);

        // 2) Append to shared state (sync flag = true)
        setMsgs((prev) => {
            const base = Array.isArray(prev) ? prev : [];
            const next = [...base, msg];
            if (next.length > 200) next.splice(0, next.length - 200);
            return next;
        }, true);

        // 3) Fallback transport: mirror on sender state (host can rebroadcast)
        try {
            const p = myPlayer?.();
            if (p?.setState) {
                const nextOutId = ((Number(p.getState("chatOutId") || 0) + 1) | 0);
                p.setState("chatOut", { ...msg, channel }, true);
                p.setState("chatOutId", nextOutId, true);
            }
        } catch { }

        setDraft("");
    };

    // Enter to send
    const onKey = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!inputDisabled) send(draft);
        }
    };

    // Merge network + local (dedupe) so sender always sees their msg even if net lags
    const msgs = useMemo(() => dedupeById([...(netMsgs || []), ...(localMsgs || [])]), [netMsgs, localMsgs]);

    // Fallback receiver: watch all players for chatOut/chatOutId and merge
    const lastSeenRef = useRef(new Map()); // playerId -> last outId
    useEffect(() => {
        const t = setInterval(() => {
            const list = allPlayers || [];
            for (const p of list) {
                if (!p?.id) continue;
                const outId = Number(p.getState?.("chatOutId") || 0);
                const last = lastSeenRef.current.get(p.id) || 0;
                if (outId > last) {
                    lastSeenRef.current.set(p.id, outId);
                    const m = p.getState?.("chatOut");
                    const matches = m?.channel ? (m.channel === channel) : (channel === "chat:global");
                    if (m && m.id && matches) {
                        setLocalMsgs((prev) => dedupeById([...prev, m]));
                    }
                }
            }
        }, 200);
        return () => clearInterval(t);
    }, [allPlayers, channel]);

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
            return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        } catch { return ""; }
    };

    return (
        <section className="tc tc--illustrated tc--half" style={{ height, ...style }}>
            <div className="tc-card">
                {/* Header: team/global title + presence pills + optional debug */}
                <header className="tc__header" title={debug ? `Room ${room} · ${channel}` : undefined}>
                    <div className="tc__title">
                        {(scope === "team" ? liveTeam : "GLOBAL").toUpperCase()}
                        {debug && (
                            <span style={{ marginLeft: 8, opacity: .65, fontSize: 11 }}>
                                {room} · {channel} · n:{netMsgs.length} l:{localMsgs.length}
                            </span>
                        )}
                    </div>
                    <div className="tc__members">
                        {(members || []).map((p) => {
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
                    {(msgs || []).map((m) => {
                        const isMe = m.fromId === myId;
                        return (
                            <div key={m.id} className={`tc-bubble ${isMe ? "me" : ""}`} title={`${m.name} · ${fmt(m.ts)}`}>
                                {!isMe && <div className="tc-bubble__meta">{m.name} · {fmt(m.ts)}</div>}
                                <div className="tc-bubble__text">{String(m.text || "")}</div>
                            </div>
                        );
                    })}
                    {(!msgs || msgs.length === 0) && (
                        <div className="tc__empty">No messages yet.</div>
                    )}
                </div>

                {/* Input */}
                <form className="tc__inputRow" onSubmit={(e) => { e.preventDefault(); if (!inputDisabled) send(draft); }}>
                    <input
                        className="tc-input"
                        disabled={inputDisabled}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKey}
                        placeholder={inputDisabled ? "Chat disabled" : "Type a message… (Enter to send)"}
                    />
                    <button className="tc-send" disabled={inputDisabled || !draft.trim()} type="submit">
                        Send
                    </button>
                </form>
            </div>
        </section>
    );
}
