// src/ui/TopBar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { myPlayer } from "playroomkit";
import { useGameClock } from "../systems/dayNightClock";
import "./ui.css";

export function TopBar({ phase, timer, players, events = [] }) {
    // --- Game clock state (Zustand-style) ---
    const format = useGameClock((s) => s.format);
    const phaseFn = useGameClock((s) => s.phase);          // "day" | "night"
    const pctFn = useGameClock((s) => s.phaseProgress);  // function → 0..1
    const dayNumber = useGameClock((s) => s.dayNumber);
    const maxDays = useGameClock((s) => s.maxDays);

    // ---- Clock (tick once per second) ----
    const [clock, setClock] = useState(format());
    useEffect(() => {
        const id = setInterval(() => setClock(format()), 1000);
        setClock(format()); // initial
        return () => clearInterval(id);
    }, [format]);

    // ---- Day/Night chip (subscribe to store; no per-frame polling) ----
    const [ph, setPh] = useState(phaseFn());
    useEffect(() => {
        const api = useGameClock.getState?.();
        if (!api?.subscribe) { setPh(phaseFn()); return; }
        setPh(phaseFn()); // initial
        // subscribe to phase changes only
        const unsub = api.subscribe((s) => s.phase, (nextPhase) => setPh(nextPhase));
        return () => unsub?.();
    }, [phaseFn]);

    // ---- Progress bar (update ~4×/sec; only setState when value changes) ----
    const [progress, setProgress] = useState(() => Math.floor((pctFn?.() || 0) * 100));
    useEffect(() => {
        let mounted = true;
        const id = setInterval(() => {
            const p = Math.floor((pctFn?.() || 0) * 100);
            if (!mounted) return;
            setProgress((prev) => (prev === p ? prev : p));
        }, 250);
        return () => { mounted = false; clearInterval(id); };
    }, [pctFn]);

    // ---- Meeting countdown (from props; parent updates this) ----
    const isMeeting = phase === "meeting";
    const mt = Number(timer ?? 0);
    const mm = String(Math.floor(mt / 60)).padStart(2, "0");
    const ss = String(mt % 60).padStart(2, "0");

    // ---- Events popover ----
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

    // ---- Votes detection & flash ----
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

    // post-meeting poll for late "Votes:" line (kept as-is)
    const prevPhaseRef = useRef(phase);
    useEffect(() => {
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = phase;
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
    }, [phase]);

    useEffect(() => () => hideTimerRef.current && clearTimeout(hideTimerRef.current), []);

    const parsedRows = useMemo(() => {
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
    }, [votesFlash]);

    const latestPreview = latestVotesLine
        ? latestVotesLine
        : list.length
            ? String(list[list.length - 1])
            : "No events yet";

    // shared tokens
    const INK = "var(--bp-ink, #07334a)";
    const BLUE = "var(--bp-blue, #0f4f68)";
    const ORANGE = "var(--bp-orange, #ffb340)";
    const TEXT = "var(--bp-text, #e8f1ff)";

    return (
        <div
            className="topbar"
            style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "4px 8px 8px",
                color: TEXT,
                fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, Arial, sans-serif',
                // (background/border/blur intentionally minimal)
            }}
        >
            {/* Left cluster */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ letterSpacing: ".03em" }}>Planet A — Prototype</strong>
                <span className="tb-dim">| Day: <b>{dayNumber}/{maxDays}</b></span>
                <span className="tb-dim">| Phase: <b>{String(phase)}</b></span>

                {/* Day/Night chip */}
                <span
                    className="tb-chip"
                    style={{
                        marginLeft: 6,
                        border: `2px solid ${INK}`,
                        background: "transparent",
                        fontWeight: 800,
                        letterSpacing: ".04em",
                    }}
                >
                    {ph.toUpperCase()}
                </span>

                {/* Clock */}
                <span className="tb-dim">| Clock: <b style={{ letterSpacing: 0.5 }}>{clock}</b></span>
            </div>

            {/* Vote Results (compact) */}
            {votesFlash && (
                <div
                    className="tb-chip"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginLeft: 8,
                        border: `2px solid ${INK}`,
                        maxWidth: 520,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                    }}
                    title={votesFlash}
                >
                    <strong>Vote Results:</strong>
                    <div style={{ display: "flex", gap: 8, overflow: "hidden" }}>
                        {parsedRows.length
                            ? parsedRows.map((r) => (
                                <span key={r.id} style={{ fontWeight: 800 }}>
                                    {r.name}: {r.votes}
                                </span>
                            ))
                            : <span>{String(votesFlash).replace(/^Votes:\s*/i, "")}</span>}
                    </div>
                    <button onClick={() => setVotesFlash(null)} title="Hide" className="tb-btn">×</button>
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
                    gap: 6,
                }}
            >
                <button
                    onClick={() => setOpen((s) => !s)}
                    title="Show recent events"
                    className="tb-btn"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        border: `2px solid ${INK}`,
                        fontWeight: 800,
                        letterSpacing: ".03em",
                        whiteSpace: "nowrap",
                    }}
                >
                    Events
                    <span className="tb-badge">{events?.length ?? 0}</span>
                </button>

                {/* Latest preview */}
                <div
                    className="tb-dim"
                    style={{
                        maxWidth: 480,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        padding: isVotesLine(latestPreview) ? "1px 6px" : 0,
                        border: isVotesLine(latestPreview) ? `2px solid ${INK}` : "none",
                        borderRadius: isVotesLine(latestPreview) ? 8 : 0,
                    }}
                    title={latestPreview}
                >
                    {latestPreview}
                </div>

                {/* Popover */}
                {open && (
                    <div
                        style={{
                            position: "absolute",
                            top: "calc(100% + 8px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 480,
                            maxHeight: 220,
                            overflow: "auto",
                            background: "transparent",
                            border: `2px solid ${INK}`,
                            borderRadius: 12,
                            padding: 8,
                            zIndex: 20,
                        }}
                    >
                        <div className="tb-dim" style={{ marginBottom: 6, fontWeight: 800, letterSpacing: ".03em" }}>
                            Events
                        </div>
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
                                                lineHeight: 1.3,
                                                padding: votes ? "3px 6px" : "1px 0",
                                                borderRadius: votes ? 6 : 0,
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
                    className="tb-chip"
                    style={{
                        marginLeft: 8,
                        border: `2px solid ${INK}`,
                        fontWeight: 800,
                        letterSpacing: ".03em",
                    }}
                >
                    MEETING <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</span>
                </span>
            )}

            {/* Right cluster */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tb-dim">Alive: <b>{players}</b></span>
                <span className="tb-dim">you are: {myPlayer()?.getProfile?.().name || "Anon"}</span>
            </div>

            {/* Phase progress */}
            <div
                style={{
                    position: "absolute",
                    left: 6,
                    right: 6,
                    bottom: 4,
                    height: 6,
                    borderRadius: 6,
                    border: `1px solid ${INK}`,
                    background: "transparent",
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
