// src/ui/TeamChatPanel.jsx
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { myPlayer, usePlayersList, useMultiplayerState, getRoomCode } from "playroomkit";
import "./ui.css";

/* ---------- helpers ---------- */
const safe = (v) => { try { return String(v ?? "").trim(); } catch { return ""; } };
const firstNonEmpty = (...vals) => vals.find((v) => safe(v)) || "";

// Robust team slug: trims, NFKD normalize, removes diacritics, keeps [a-z0-9], squashes dashes.
// Robust team slug with aliases (A ↔ Alpha, B ↔ Beta/Bravo, etc.)
const normTeamId = (s) => {
    const base = safe(s || "team");
    const nfkd = base.normalize?.("NFKD") || base;
    const lower = nfkd.replace(/\p{M}/gu, "").toLowerCase();

    // Collapse non-alnum (so "Team Alpha" → "teamalpha", "team-a" → "teama")
    const collapsed = lower.replace(/[^a-z0-9]+/g, "");

    // Map a bunch of synonyms to the same canonical ids
    const ALIAS = {
        // Team A / Alpha
        teama: "teama", a: "teama", alpha: "teama", "1": "teama", one: "teama", i: "teama",
        // Team B / Beta / Bravo
        teamb: "teamb", b: "teamb", beta: "teamb", bravo: "teamb", "2": "teamb", two: "teamb", ii: "teamb",
        // (Optional) add more:
        // teamc: "teamc", c: "teamc", gamma: "teamc", charlie: "teamc", "3": "teamc", three: "teamc", iii: "teamc",
    };

    // 1) Exact collapsed alias (handles "teama", "team-alpha", "alpha", "a", "1")
    if (ALIAS[collapsed]) return ALIAS[collapsed];

    // 2) Token-wise alias (handles extra words like "blue team alpha")
    const tokens = lower
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .filter((t) => t !== "team");

    for (const t of tokens) {
        if (ALIAS[t]) return ALIAS[t];
    }

    // 3) Fallback: use collapsed string
    return collapsed.slice(0, 32) || "team";
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

export default function TeamChatPanel({
    teamName,               // optional: force a specific team label
    inputDisabled = false,
    height = 360,
    style,
    debug = false,          // set true to show room/channel + counts
}) {
    // small ticker to keep presence fresh
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => { const id = setInterval(force, 500); return () => clearInterval(id); }, []);

    const me = myPlayer();
    const myId = me?.id || "";
    const allPlayers = usePlayersList(true);

    // Room readiness — do not mount shared state until we actually have a room code
    const room = (() => {
        try { return getRoomCode?.() || new URL(location.href).searchParams.get("r") || ""; }
        catch { return ""; }
    })();
    const ready = Boolean(room && myId);

    // Canonical team label/id (derive from prop or player state)
    const liveTeam = firstNonEmpty(
        teamName,
        me?.getState?.("team"),
        me?.getState?.("teamName"),
        "Team"
    );
    const teamId = normTeamId(liveTeam);
    const channel = `chat:${teamId}`;

    // Compute same-team presence (works even before ready)
    const members = useMemo(() => {
        return (allPlayers || []).filter((p) => {
            const t = normTeamId(firstNonEmpty(p?.getState?.("team"), p?.getState?.("teamName")));
            return t === teamId;
        });
    }, [allPlayers, teamId]);

    // Local mirror so sender always sees their message instantly
    const [localMsgs, setLocalMsgs] = useState([]);
    const lastChannelRef = useRef(channel);
    useEffect(() => {
        if (lastChannelRef.current !== channel) {
            lastChannelRef.current = channel;
            setLocalMsgs([]); // switching team -> clear local buffer
        }
    }, [channel]);

    // If not ready yet, render a lightweight shell (prevents off-room binding)
    if (!ready) {
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
                    height,
                    display: "flex",
                    flexDirection: "column",
                    ...style,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>Team Chat — {liveTeam}</div>
                    {debug && <span style={{ fontSize: 10, opacity: 0.75 }}>joining room…</span>}
                </div>
                <div style={{ flex: "1 1 auto", minHeight: 0, display: "grid", placeItems: "center", opacity: 0.7 }}>
                    Connecting…
                </div>
            </div>
        );
    }

    // ---- Ready: mount the shared state now ----
    const [netMsgsRaw, setMsgs] = useMultiplayerState(channel, []); // shared per team
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

        // 1) Local echo immediately
        setLocalMsgs((prev) => [...prev, msg]);

        // 2) Append to shared state (IMPORTANT: sync flag = true)
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

    // Merge network + local (dedupe) so sender always sees their msg even if net lags
    const msgs = useMemo(() => dedupeById([...(netMsgs || []), ...(localMsgs || [])]), [netMsgs, localMsgs]);

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
                height,
                display: "flex",
                flexDirection: "column",
                ...style,
            }}
        >
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Team Chat — {liveTeam}</div>
                {debug && (
                    <span title={`Room ${room}, Channel ${channel}`} style={{ fontSize: 10, opacity: 0.75, whiteSpace: "nowrap" }}>
                        {room} · {channel} · n:{netMsgs.length} l:{localMsgs.length}
                    </span>
                )}
                <div className="member-row" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
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

            {/* body fills remaining space */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
                {/* scrollable history */}
                <div
                    ref={listRef}
                    className="chat-list"
                    style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", paddingRight: 4 }}
                >
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

                    {(!msgs || msgs.length === 0) && (
                        <div style={{ opacity: 0.6, fontSize: 13, padding: "4px 2px" }}>
                            No messages yet. Say hi to your team!
                        </div>
                    )}
                </div>

                {/* input row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8 }}>
                    <input
                        disabled={inputDisabled}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKey}
                        placeholder={inputDisabled ? "Chat disabled" : "Type a message… (Enter to send)"}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            borderRadius: 8,
                            border: "1px solid #3a4252",
                            background: "rgba(255,255,255,0.06)",
                            color: "white",
                            padding: "8px 10px",
                            outline: "none",
                        }}
                    />
                    <button
                        className="item-btn"
                        disabled={inputDisabled || !draft.trim()}
                        onClick={() => send(draft)}
                        style={{ whiteSpace: "nowrap" }}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
