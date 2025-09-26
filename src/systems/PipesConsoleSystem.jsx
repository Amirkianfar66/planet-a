// src/systems/PipesConsoleSystem.jsx
import React, { useEffect, useMemo, useState } from "react";
import { isHost, myPlayer, usePlayersList, useMultiplayerState } from "playroomkit";
import { hostAppendEvent, useEvents } from "../network/playroom";
import PUZZLE from "../data/5x5-square-puzzle.json";

// Bit masks (match HexaPipes): U=1, R=2, D=4, L=8
const U = 1 << 0, R = 1 << 1, D = 1 << 2, L = 1 << 3;

// Rotate a mask 90° CW "turns" times
const ROT = (mask, turns = 0) => {
    let m = mask & 15;
    for (let t = 0; t < (turns & 3); t++) {
        const up = (m & U) ? R : 0;
        const right = (m & R) ? D : 0;
        const down = (m & D) ? L : 0;
        const left = (m & L) ? U : 0;
        m = up | right | down | left;
    }
    return m;
};

// Build a seed from the exact puzzle JSON
function seedFromJson(json) {
    const n = Number(json.width || 5);
    const tiles = Array.isArray(json.tiles) ? json.tiles : [];
    const types = Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => (tiles[r * n + c] | 0) & 15)
    );

    // random starting rotations 0..3
    let initRot = Array.from({ length: n }, () =>
        Array.from({ length: n }, () => (Math.random() * 4 | 0) & 3)
    );

    // avoid starting already-solved (rare but possible)
    if (isSolved(types, initRot)) {
        initRot = initRot.map(row => row.map(k => (k + 1) & 3));
    }

    return { n, types, initRot };
}

// Validation: every edge reciprocated by neighbor, and NO border leaks
function isSolved(types, rot) {
    const n = types.length;
    const inb = (r, c) => r >= 0 && r < n && c >= 0 && c < n;

    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const m = ROT(types[r][c], rot[r][c] & 3);

            // Up
            if (m & U) {
                if (!inb(r - 1, c)) return false;           // border leak
                const up = ROT(types[r - 1][c], rot[r - 1][c] & 3);
                if (!(up & D)) return false;
            } else if (inb(r - 1, c)) {
                const up = ROT(types[r - 1][c], rot[r - 1][c] & 3);
                if (up & D) return false;                // neighbor points into us
            }

            // Right
            if (m & R) {
                if (!inb(r, c + 1)) return false;
                const rt = ROT(types[r][c + 1], rot[r][c + 1] & 3);
                if (!(rt & L)) return false;
            } else if (inb(r, c + 1)) {
                const rt = ROT(types[r][c + 1], rot[r][c + 1] & 3);
                if (rt & L) return false;
            }

            // Down
            if (m & D) {
                if (!inb(r + 1, c)) return false;
                const dn = ROT(types[r + 1][c], rot[r + 1][c] & 3);
                if (!(dn & U)) return false;
            } else if (inb(r + 1, c)) {
                const dn = ROT(types[r + 1][c], rot[r + 1][c] & 3);
                if (dn & U) return false;
            }

            // Left
            if (m & L) {
                if (!inb(r, c - 1)) return false;
                const lf = ROT(types[r][c - 1], rot[r][c - 1] & 3);
                if (!(lf & R)) return false;
            } else if (inb(r, c - 1)) {
                const lf = ROT(types[r][c - 1], rot[r][c - 1] & 3);
                if (lf & R) return false;
            }
        }
    }
    return true;
}

/* ------------------------------ Host loop ------------------------------ */
function HostLoop() {
    const host = isHost();
    const players = usePlayersList(true);
    const [, setEvents] = useEvents();
    const [solved, setSolved] = useMultiplayerState("engine:solved", false);
    const [seedJson, setSeedJson] = useMultiplayerState("engine:seed", "");

    useEffect(() => {
        if (!host || solved || seedJson) return;
        const seed = seedFromJson(PUZZLE);
        setSeedJson(JSON.stringify(seed));
    }, [host, solved, seedJson, setSeedJson]);

    useEffect(() => {
        if (!host) return;
        let stop = false;
        const handled = new Map();

        const loop = () => {
            if (stop) return;

            let seed = null;
            try { seed = seedJson ? JSON.parse(seedJson) : null; } catch { }
            const types = seed?.types;

            if (types) {
                for (const p of players) {
                    const tick = Number(p?.getState?.("engine:reqTick") || 0);
                    if (!tick || handled.get(p.id) === tick) continue;

                    let guess = null;
                    try { const raw = p.getState?.("engine:guessRot"); guess = raw ? JSON.parse(raw) : null; } catch { }

                    const ok = !!guess && isSolved(types, guess);
                    p.setState("engine:last", ok ? "ok" : "bad", true);
                    if (ok && !solved) {
                        setSolved(true);
                        hostAppendEvent(setEvents, "Engine piping complete — Engine READY.");
                    }
                    handled.set(p.id, tick);
                }
            }
            requestAnimationFrame(loop);
        };
        loop();
        return () => { stop = true; };
    }, [host, players, seedJson, solved, setSolved, setEvents]);

    return null;
}

/* ------------------------------ Client UI ------------------------------ */
function BoardUI({ onClose }) {
    const [seedJson] = useMultiplayerState("engine:seed", "");
    const [solved] = useMultiplayerState("engine:solved", false);
    const [status, setStatus] = useState(solved ? "✅ Engine already ready." : "");

    const seed = useMemo(() => {
        try { return seedJson ? JSON.parse(seedJson) : null; } catch { return null; }
    }, [seedJson]);

    const n = seed?.n || 5;
    const types = seed?.types || [];
    const initRot = seed?.initRot || Array.from({ length: n }, () => Array(n).fill(0));
    const [rot, setRot] = useState(initRot);
    useEffect(() => { setRot(initRot); }, [seedJson]);

    const rotate = (r, c, dir = 1) => {
        setRot(prev => {
            const next = prev.map(row => row.slice());
            next[r][c] = (next[r][c] + (dir > 0 ? 1 : 3)) & 3;
            return next;
        });
    };

    const submit = () => {
        const me = myPlayer?.(); if (!me) return;
        const tick = (Number(me.getState?.("engine:reqTick") || 0) + 1) | 0;
        me.setState("engine:guessRot", JSON.stringify(rot), true);
        me.setState("engine:reqTick", tick, true);
        setStatus("Checking…");
    };

    useEffect(() => {
        const me = myPlayer?.(); if (!me) return;
        let t;
        const poll = () => {
            const res = String(me.getState?.("engine:last") || "");
            if (res === "ok") setStatus("✅ All pipes closed. Engine READY!");
            else if (res === "bad") setStatus("❌ Open ends or mismatches. Try again.");
            t = setTimeout(poll, 120);
        };
        poll();
        return () => clearTimeout(t);
    }, []);

    // simple glyph renderer (draws whatever bits are set)
    const TILE_SIZE = 78;
    const W = n * TILE_SIZE, H = n * TILE_SIZE;

    return (
        <div style={{ position: "relative", width: W + 20, padding: 10, borderRadius: 14, background: "#0b1220", border: "1px solid #223049" }}>
            <div style={{ display: "flex", justifyContent: "space-between", margin: "0 6px 8px" }}>
                <h3 style={{ margin: 0, fontSize: 16, letterSpacing: .3 }}>Engine Piping Console</h3>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setRot(initRot)} style={{ padding: "4px 8px" }}>Reset</button>
                    <button onClick={onClose} style={{ padding: "4px 8px" }}>Close</button>
                </div>
            </div>

            <div style={{
                position: "relative", width: W, height: H, borderRadius: 12, background: "#0f172a",
                border: "1px solid #1f2a3b", boxShadow: "0 8px 24px rgba(0,0,0,.35) inset, 0 8px 28px rgba(0,0,0,.35)"
            }}>
                {Array.from({ length: n }).map((_, r) =>
                    Array.from({ length: n }).map((_, c) => {
                        const m = ROT(types[r][c], rot[r][c] & 3);
                        return (
                            <div key={`${r}_${c}`}
                                onClick={() => rotate(r, c, 1)}
                                onContextMenu={(e) => { e.preventDefault(); rotate(r, c, -1); }}
                                style={{
                                    position: "absolute", left: c * TILE_SIZE, top: r * TILE_SIZE,
                                    width: TILE_SIZE, height: TILE_SIZE, display: "grid", placeItems: "center",
                                    borderRight: c === n - 1 ? "none" : "1px solid #233145",
                                    borderBottom: r === n - 1 ? "none" : "1px solid #233145",
                                    cursor: "pointer", userSelect: "none",
                                    background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02))"
                                }}
                                title="Click to rotate CW, right-click CCW">
                                <PipeGlyph mask={m} />
                            </div>
                        );
                    })
                )}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button onClick={submit} style={{ padding: "8px 12px", borderRadius: 10, background: "#2563eb", color: "#fff", fontWeight: 700 }}>
                    Validate
                </button>
                {status && <div style={{ alignSelf: "center", opacity: .95 }}>{status}</div>}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: .8 }}>
                Goal: rotate tiles so <b>every</b> pipe end connects to a neighbor — no border leaks.
            </div>
        </div>
    );
}

function PipeGlyph({ mask }) {
    const stroke = "#cbd5e1";
    const thick = 8;
    const s = 44;
    const cap = "round";
    const segs = [];
    if (mask & U) segs.push(<line key="u" x1={s} y1={s} x2={s} y2={8} stroke={stroke} strokeWidth={thick} strokeLinecap={cap} />);
    if (mask & R) segs.push(<line key="r" x1={s} y1={s} x2={s * 2 - 8} y2={s} stroke={stroke} strokeWidth={thick} strokeLinecap={cap} />);
    if (mask & D) segs.push(<line key="d" x1={s} y1={s} x2={s} y2={s * 2 - 8} stroke={stroke} strokeWidth={thick} strokeLinecap={cap} />);
    if (mask & L) segs.push(<line key="l" x1={s} y1={s} x2={8} y2={s} stroke={stroke} strokeWidth={thick} strokeLinecap={cap} />);
    return (
        <svg width={72} height={72} viewBox="0 0 88 88" style={{ borderRadius: 8, background: "#1f2937" }}>
            <circle cx="44" cy="44" r="10" fill="#94a3b8" />
            {segs}
        </svg>
    );
}

/* ------------------------------ Overlay ------------------------------ */
function Overlay() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let t;
        const poll = () => {
            const me = myPlayer?.();
            if (!me) { t = setTimeout(poll, 120); return; }
            setOpen(!!me.getState?.("ui_pipesOpen"));
            t = setTimeout(poll, 120);
        };
        poll();
        return () => clearTimeout(t);
    }, []);
    if (!open) return null;
    const close = () => myPlayer()?.setState?.("ui_pipesOpen", 0, true);
    return (
        <div style={{
            position: "fixed", inset: 0, display: "grid", placeItems: "center",
            background: "rgba(0,0,0,.55)", zIndex: 2000, cursor: "default"
        }}>
            <BoardUI onClose={close} />
        </div>
    );
}

export default function PipesConsoleSystem() {
    return (
        <>
            <HostLoop />
            <Overlay />
        </>
    );
}
