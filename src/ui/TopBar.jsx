// src/ui/TopBar.jsx
import React, { useEffect, useState, useRef } from "react";
import { myPlayer } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";

export function TopBar({ phase, timer, players, events = [] }) {
    // Game-clock state
    const format = useGameClock((s) => s.format);
    const phaseFn = useGameClock((s) => s.phase);
    const pct = useGameClock((s) => s.phaseProgress);
    const dayNumber = useGameClock((s) => s.dayNumber);
    const maxDays = useGameClock((s) => s.maxDays);

    // Live UI clock + day/night chip
    const [clock, setClock] = useState(format());
    const [ph, setPh] = useState(phaseFn());
    useEffect(() => {
        let raf;
        const loop = () => {
            setClock(format());
            setPh(phaseFn());
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [format, phaseFn]);

    const progress = Math.floor(pct() * 100);

    // Meeting countdown
    const isMeeting = phase === "meeting";
    const mt = Number(timer ?? 0);
    const mm = String(Math.floor(mt / 60)).padStart(2, "0");
    const ss = String(mt % 60).padStart(2, "0");

    // Events popover
    const [open, setOpen] = useState(false);
    const popRef = useRef(null);
    useEffect(() => {
        const onDoc = (e) => {
            if (!popRef.current) return;
            if (!popRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // ---- Votes detection ----
    const isVotesLine = (s) => /^Votes:\s*/i.test(String(s));
    const list = Array.isArray(events) ? events : [];
    const findLatestVotes = (arr) => {
        for (let i = arr.length - 1; i >= 0; i--) {
            const s = String(arr[i]);
            if (isVotesLine(s)) return { index: i, line: s };
        }
        return { index: -1, line: null };
    };
    const { index: latestVotesIndex, line: latestVotesLine } = findLatestVotes(list);

    const eventsRef = useRef(list);
    useEffect(() => { eventsRef.current = Array.isArray(events) ? events : []; }, [events]);

    const [votesFlash, setVotesFlash] = useState(null);
    const hideTimerRef = useRef(null);
    const lastShownRef = useRef(-1);

    useEffect(() => {
        if (latestVotesIndex < 0 || !latestVotesLine) return;
        if (latestVotesIndex === lastShownRef.current) return;
        lastShownRef.current = latestVotesIndex;
        setVotesFlash(latestVotesLine);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setVotesFlash(null), 20000);
    }, [latestVotesIndex, latestVotesLine]);

    const prevPhaseRef = useRef(phase);
    useEffect(() => {
        const prev = prevPhaseRef.current;
        if (prev === "meeting" && phase !== "meeting") {
            let tries = 0;
            const id = setInterval(() => {
                const { index, line } = findLatestVotes(eventsRef.current);
                if (index >= 0 && line && index !== lastShownRef.current) {
                    lastShownRef.current = index;
                    setVotesFlash(line);
                    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                    hideTimerRef.current = setTimeout(() => setVotesFlash(null), 20000);
                    clearInterval(id);
                }
                if (++tries > 20) clearInterval(id);
            }, 100);
            return () => clearInterval(id);
        }
        prevPhaseRef.current = phase;
    }, [phase]);

    useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

    // Parse "Votes: Alice: 3 | Bob: 2 | ..."
    const parsedRows = (() => {
        if (!votesFlash) return [];
        const raw = String(votesFlash).replace(/^Votes:\s*/i, "");
        return raw
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((pair, i) => {
                const [name, num] = pair.split(":").map((t) => t.trim());
                return { id: i, name: name || "Player", votes: Number(num) || 0 };
            })
            .sort((a, b) => b.votes - a.votes);
    })();

    const latestPreview = latestVotesLine
        ? latestVotesLine
        : list.length
            ? String(list[list.length - 1])
            : "No events yet";

    // ---- Shared “illustrated glass” tokens (fallbacks if CSS vars aren’t global) ----
    const INK = "var(--bp-ink, #07334a)";
    const BLUE = "var(--bp-blue, #0f4f68)";
    const ORANGE = "var(--bp-orange, #ffb340)";
    const TEXT = "var(--bp-text, #e8f1ff)";

    return (
        <div
            style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 14px 12px",
                color: TEXT,
                fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, Arial, sans-serif',

                /* glassy top bar shell */
                background: "linear-gradient(180deg, rgba(15,79,104,0.50), rgba(15,79,104,0.35))",
                border: `4px solid ${INK}`,
                borderRadius: 16,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: "0 8px 24px rgba(0,0,0,.25), inset 0 0 0 4px rgba(16,95,126,.6)",
            }}
        >
            {/* Left cluster */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ letterSpacing: ".03em" }}>Planet A — Prototype</strong>
                <span style={{ opacity: 0.9 }}>| Day: <b>{dayNumber}/{maxDays}</b></span>
                <span style={{ opacity: 0.9 }}>| Phase: <b>{String(phase)}</b></span>

                {/* Day/Night chip (glass pill) */}
                <span
                    style={{
                        marginLeft: 6,
                        padding: "2px 10px",
                        border: `3px solid ${INK}`,
                        borderRadius: 999,
                        background:
                            ph === "day"
                                ? "linear-gradient(180deg, rgba(255,230,160,.35), rgba(255,230,160,.18))"
                                : "linear-gradient(180deg, rgba(140,180,255,.35), rgba(140,180,255,.18))",
                        fontWeight: 900,
                        fontSize: 12,
                        letterSpacing: ".04em",
                    }}
                >
                    {ph.toUpperCase()}
                </span>

                {/* Clock */}
                <span style={{ opacity: 0.9 }}>
                    | Clock: <b style={{ letterSpacing: 1 }}>{clock}</b>
                </span>
            </div>

            {/* Vote Results (glass chip) */}
            {votesFlash && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginLeft: 8,
                        padding: "4px 10px",
                        border: `3px solid ${INK}`,
                        borderRadius: 12,
                        background: "linear-gradient(180deg, rgba(120,160,255,0.28), rgba(120,160,255,0.18))",
                        fontSize: 12,
                        maxWidth: 560,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                    }}
                    title={votesFlash}
                >
                    <strong style={{ opacity: 0.95 }}>Vote Results:</strong>
                    <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
                        {parsedRows.length
                            ? parsedRows.map((r) => (
                                <span key={r.id} style={{ fontWeight: 900 }}>
                                    {r.name}: {r.votes}
                                </span>
                            ))
                            : <span>{String(votesFlash).replace(/^Votes:\s*/i, "")}</span>}
                    </div>
                    <button
                        onClick={() => setVotesFlash(null)}
                        title="Hide"
                        style={{
                            marginLeft: 8,
                            background: "rgba(255,255,255,0.10)",
                            border: `2px solid ${INK}`,
                            color: TEXT,
                            padding: "2px 8px",
                            borderRadius: 8,
                            fontSize: 11,
                            cursor: "pointer",
                        }}
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Centered Events button + preview */}
            <div
                ref={popRef}
                style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <button
                    onClick={() => setOpen((s) => !s)}
                    title="Show recent events"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
                        border: `3px solid ${INK}`,
                        color: TEXT,
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: ".03em",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    Events
                    <span
                        style={{
                            background: "rgba(255,255,255,0.22)",
                            borderRadius: 999,
                            padding: "0 8px",
                            fontWeight: 900,
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        {events?.length ?? 0}
                    </span>
                </button>

                {/* Latest preview (glass outline when it's a Votes line) */}
                <div
                    style={{
                        maxWidth: 520,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: 0.9,
                        fontSize: 12,
                        padding: isVotesLine(latestPreview) ? "2px 8px" : 0,
                        border: isVotesLine(latestPreview) ? `2px solid ${INK}` : "none",
                        borderRadius: isVotesLine(latestPreview) ? 10 : 0,
                        background: isVotesLine(latestPreview)
                            ? "linear-gradient(180deg, rgba(120,160,255,0.20), rgba(120,160,255,0.10))"
                            : "transparent",
                    }}
                    title={latestPreview}
                >
                    {latestPreview}
                </div>

                {/* Popover (glass card) */}
                {open && (
                    <div
                        style={{
                            position: "absolute",
                            top: "calc(100% + 10px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 520,
                            maxHeight: 240,
                            overflow: "auto",
                            background: "linear-gradient(180deg, rgba(15,79,104,0.50), rgba(15,79,104,0.35))",
                            border: `4px solid ${INK}`,
                            borderRadius: 16,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 4px rgba(16,95,126,.6)",
                            backdropFilter: "blur(8px)",
                            WebkitBackdropFilter: "blur(8px)",
                            padding: 10,
                            zIndex: 20,
                        }}
                    >
                        <div style={{ opacity: 0.75, marginBottom: 6, fontWeight: 900, letterSpacing: ".03em" }}>Events</div>
                        <div style={{ display: "grid", gap: 6 }}>
                            {(Array.isArray(events) ? events : [])
                                .slice()
                                .reverse()
                                .map((e, i) => {
                                    const s = String(e);
                                    const votes = isVotesLine(s);
                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                fontSize: 12,
                                                lineHeight: 1.3,
                                                padding: votes ? "4px 8px" : "2px 0",
                                                borderRadius: votes ? 8 : 0,
                                                background: votes
                                                    ? "linear-gradient(180deg, rgba(120,160,255,0.20), rgba(120,160,255,0.10))"
                                                    : "transparent",
                                                border: votes ? `2px solid ${INK}` : "none",
                                                fontFamily: votes
                                                    ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
                                                    : undefined,
                                            }}
                                        >
                                            • {s}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>

            {/* Meeting countdown chip */}
            {isMeeting && (
                <span
                    style={{
                        marginLeft: 8,
                        padding: "2px 10px",
                        border: `3px solid ${INK}`,
                        borderRadius: 999,
                        background: "linear-gradient(180deg, rgba(255,120,120,.30), rgba(255,120,120,.18))",
                        fontWeight: 900,
                        fontSize: 12,
                        letterSpacing: ".03em",
                    }}
                >
                    MEETING{" "}
                    <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>
                        {mm}:{ss}
                    </span>
                </span>
            )}

            {/* Right cluster */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                <span>Alive: <b>{players}</b></span>
                <span style={{ opacity: 0.8 }}>
                    you are: {myPlayer()?.getProfile?.().name || "Anon"}
                </span>
            </div>

            {/* Phase progress (thin inked track) */}
            <div
                style={{
                    position: "absolute",
                    left: 8,
                    right: 8,
                    bottom: 6,
                    height: 6,
                    borderRadius: 6,
                    border: `2px solid ${INK}`,
                    background: "rgba(255,255,255,0.12)",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${progress}%`,
                        background: `linear-gradient(90deg, ${ORANGE}, ${BLUE})`,
                    }}
                />
            </div>
        </div>
    );
}
