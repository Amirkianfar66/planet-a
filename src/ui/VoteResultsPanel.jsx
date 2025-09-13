// src/ui/VoteResultsPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGameClock } from "../systems/dayNightClock";
import { usePlayersList } from "playroomkit";

/**
 * Panel that appears at 21:00 with voting results.
 * - Prefers "Votes:" event text if present
 * - Otherwise computes from alive players' `vote` states
 * - Auto-hides after 20 seconds, closable
 */
export default function VoteResultsPanel({ phase, events = [] }) {
    // clock access (parse HH:MM or HH:MM:SS)
    const format = useGameClock((s) => s.format);
    const getSec = () => {
        try {
            const txt = String(format() || "");
            const parts = txt.split(":").map((n) => parseInt(n, 10) || 0);
            const [h = 0, m = 0, s = 0] = parts;
            return h * 3600 + m * 60 + s;
        } catch {
            return 0;
        }
    };

    const players = usePlayersList(true);

    const isVotesLine = (s) => /^Votes:\s*/i.test(String(s));
    const latestVotesFromEvents = useMemo(() => {
        const arr = Array.isArray(events) ? events : [];
        for (let i = arr.length - 1; i >= 0; i--) {
            const s = String(arr[i]);
            if (isVotesLine(s)) return s;
        }
        return null;
    }, [events]);

    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState([]); // [{name, votes, locked?, total?}]
    const hideTimerRef = useRef(null);
    const lastShowTsRef = useRef(0);

    const showForAWhile = () => {
        setOpen(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setOpen(false), 20000);
        lastShowTsRef.current = Date.now();
    };

    useEffect(() => () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }, []);

    const parseVotesLine = (line) => {
        const raw = String(line).replace(/^Votes:\s*/i, "");
        const parsed = raw
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((pair) => {
                const [name, num] = pair.split(":").map((t) => t.trim());
                return { name: name || "Player", votes: Number(num) || 0 };
            })
            .sort((a, b) => b.votes - a.votes);
        return parsed;
    };

    const computeFromPlayers = () => {
        const alive = players.filter((p) => {
            try { return p.getState?.("dead") !== true; } catch { return true; }
        });

        const votesByTarget = new Map();
        for (const voter of alive) {
            try {
                const targetId = voter.getState?.("vote");
                if (targetId) votesByTarget.set(targetId, (votesByTarget.get(targetId) || 0) + 1);
            } catch { }
        }

        const nameOf = (p) =>
            p?.getState?.("name") || p?.profile?.name || p?.name || String(p?.id).slice(0, 4);

        const rows = alive.map((p) => ({
            id: p.id,
            name: nameOf(p),
            votes: votesByTarget.get(p.id) || 0,
        }));
        rows.sort((a, b) => b.votes - a.votes);

        const threshold = Math.ceil(0.5 * alive.length);
        return rows.map((r) => ({ ...r, locked: r.votes >= threshold, total: alive.length }));
    };

    // detect crossing 21:00
    const prevSecRef = useRef(getSec());
    useEffect(() => {
        let raf;
        const target = 21 * 3600;
        const crossed = (from, to, goal) => {
            if (to === from) return false;
            return (to > from) ? (goal > from && goal <= to) : (goal > from || goal <= to);
        };

        const tick = () => {
            const prev = prevSecRef.current;
            const cur = getSec();
            if (crossed(prev, cur, target)) {
                if (latestVotesFromEvents) {
                    setRows(parseVotesLine(latestVotesFromEvents));
                } else {
                    setRows(computeFromPlayers());
                }
                showForAWhile();
            }
            prevSecRef.current = cur;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [format, latestVotesFromEvents, players]);

    // also pop if a Votes: line appears later
    useEffect(() => {
        if (!latestVotesFromEvents) return;
        if (Date.now() - lastShowTsRef.current < 2000) return; // avoid immediate dupe
        setRows(parseVotesLine(latestVotesFromEvents));
        showForAWhile();
    }, [latestVotesFromEvents]);

    if (!open) return null;

    return (
        <div
            style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 30,
                pointerEvents: "auto",
            }}
        >
            <div
                style={{
                    minWidth: 420,
                    maxWidth: 720,
                    background: "rgba(14,17,22,0.95)",
                    color: "white",
                    border: "1px solid #2a3a6a",
                    borderRadius: 12,
                    boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
                    padding: 12,
                    fontFamily: "ui-sans-serif",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>Vote Results</div>
                    <button
                        onClick={() => setOpen(false)}
                        style={{
                            marginLeft: "auto",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid #334155",
                            color: "white",
                            padding: "4px 8px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 12,
                        }}
                    >
                        Close
                    </button>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                    {rows.length ? (
                        rows.map((r, i) => (
                            <div
                                key={r.id ?? i}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "6px 8px",
                                    borderRadius: 8,
                                    background: r.locked ? "rgba(255,120,120,.10)" : "rgba(255,255,255,0.04)",
                                    border: r.locked ? "1px solid rgba(255,120,120,.35)" : "1px solid rgba(255,255,255,0.08)",
                                }}
                            >
                                <div style={{ width: 22, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                    {r.votes}
                                </div>
                                <div style={{ fontWeight: 700 }}>{r.name}</div>
                                {typeof r.total === "number" && (
                                    <div style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
                                        {r.votes}/{r.total}
                                    </div>
                                )}
                                {r.locked && (
                                    <span
                                        title="Reached ≥ 50% threshold"
                                        style={{
                                            marginLeft: 8,
                                            padding: "2px 6px",
                                            fontSize: 11,
                                            borderRadius: 999,
                                            border: "1px solid rgba(255,120,120,.35)",
                                            background: "rgba(255,120,120,.15)",
                                            fontWeight: 700,
                                        }}
                                    >
                                        LOCKDOWN
                                    </span>
                                )}
                            </div>
                        ))
                    ) : (
                        <div style={{ opacity: 0.8 }}>No votes recorded.</div>
                    )}
                </div>

                <div style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>
                    Auto-hides in ~20s
                </div>
            </div>
        </div>
    );
}
