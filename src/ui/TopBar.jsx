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

  // ---- Votes detection (index-based; retriggers even if text repeats) ----
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

  // Keep freshest events for fallback polling
  const eventsRef = useRef(list);
  useEffect(() => {
    eventsRef.current = Array.isArray(events) ? events : [];
  }, [events]);

  // 20s Vote Results strip
  const [votesFlash, setVotesFlash] = useState(null);
  const hideTimerRef = useRef(null);
  const lastShownRef = useRef(-1);

  // Primary trigger
  useEffect(() => {
    if (latestVotesIndex < 0 || !latestVotesLine) return;
    if (latestVotesIndex === lastShownRef.current) return;
    lastShownRef.current = latestVotesIndex;
    setVotesFlash(latestVotesLine);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVotesFlash(null), 20000);
  }, [latestVotesIndex, latestVotesLine]);

  // Fallback: after meeting ends, poll briefly in case Votes line lands a tick later
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
        if (++tries > 20) clearInterval(id); // ~2s
      }, 100);
      return () => clearInterval(id);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

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

  // Preview prefers latest Votes
  const latestPreview = latestVotesLine
    ? latestVotesLine
    : list.length
    ? String(list[list.length - 1])
    : "No events yet";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "8px 12px 11px",
        background: "#0e1116",
        color: "white",
        fontFamily: "ui-sans-serif",
        fontSize: 14,
      }}
    >
      {/* Left cluster */}
      <strong>Planet A — Prototype</strong>
      <span>| Day: <b>{dayNumber}/{maxDays}</b></span>
      <span>| Phase: <b>{String(phase)}</b></span>

      {/* Day/Night chip */}
      <span
        style={{
          marginLeft: 8,
          padding: "2px 8px",
          border: "1px solid #334155",
          borderRadius: 999,
          background: ph === "day" ? "rgba(255,225,120,0.18)" : "rgba(120,160,255,0.18)",
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {ph.toUpperCase()}
      </span>

      {/* Pretty in-world clock */}
      <span>| Clock: <b style={{ letterSpacing: 1 }}>{clock}</b></span>

      {/* Vote Results strip (20s) */}
      {votesFlash && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginLeft: 8,
            padding: "4px 10px",
            border: "1px solid #2a3a6a",
            borderRadius: 10,
            background: "rgba(120,160,255,0.18)",
            fontSize: 12,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
                  <span key={r.id} style={{ fontWeight: 700 }}>
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid #334155",
              color: "white",
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Centered Events tab */}
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
            background: "rgba(255,255,255,0.06)",
            border: "1px solid #334155",
            color: "white",
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Events
          <span
            style={{
              background: "rgba(255,255,255,0.2)",
              borderRadius: 999,
              padding: "0 8px",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {events?.length ?? 0}
          </span>
        </button>

        {/* Latest (single-line) preview (prefers Votes) */}
        <div
          style={{
            maxWidth: 520,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.8,
            fontSize: 12,
            background: isVotesLine(latestPreview)
              ? "rgba(120,160,255,0.12)"
              : "transparent",
            border: isVotesLine(latestPreview) ? "1px solid #2a3a6a" : "none",
            borderRadius: isVotesLine(latestPreview) ? 6 : 0,
            padding: isVotesLine(latestPreview) ? "2px 6px" : 0,
            fontFamily: isVotesLine(latestPreview)
              ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
              : undefined,
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
              width: 520,
              maxHeight: 240,
              overflow: "auto",
              background: "rgba(14,17,22,0.95)",
              border: "1px solid #2a3242",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              padding: 10,
              zIndex: 20,
            }}
          >
            <div style={{ opacity: 0.7, marginBottom: 6 }}>Events</div>
            <div style={{ display: "grid", gap: 4 }}>
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
                        padding: votes ? "4px 8px" : 0,
                        borderRadius: votes ? 6 : 0,
                        background: votes
                          ? "rgba(120,160,255,0.12)"
                          : "transparent",
                        border: votes ? "1px solid #2a3a6a" : "none",
                        fontFamily: votes
                          ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
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
            padding: "2px 8px",
            border: "1px solid rgba(255,120,120,.35)",
            borderRadius: 999,
            background: "rgba(255,120,120,.18)",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          MEETING{" "}
          <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>
            {mm}:{ss}
          </span>
        </span>
      )}

      {/* Right cluster */}
      <span style={{ marginLeft: "auto" }}>
        Alive: <b>{players}</b>
      </span>
      <span style={{ marginLeft: 12, opacity: 0.7 }}>
        you are: {myPlayer()?.getProfile?.().name || "Anon"}
      </span>

      {/* Phase progress */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: "rgba(255,255,255,0.12)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "rgba(255,255,255,0.85)",
          }}
        />
      </div>
    </div>
  );
}
