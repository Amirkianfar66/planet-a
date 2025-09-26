// src/systems/WireConsoleSystem.jsx
import React, { useEffect, useRef, useState } from "react";
import { isHost, useMultiplayerState, usePlayersList, myPlayer } from "playroomkit";
import { hostAppendEvent, useEvents } from "../network/playroom";
import { WIRE_PATTERNS, getRandomKeyId } from "../data/wireKeys.js";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const SHAPES = ["triangle", "circle", "square", "hexagon"];
const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_HEX = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#f59e0b" };

/** Background board (place the image in /public/ui/) */
const BOARD_URL = (import.meta?.env?.BASE_URL || "/") + "ui/wire_console_v2.png";

/* -------------------------------------------------------------------------- */
/* Host-only loop: seed hidden solution + validate guesses                    */
/* -------------------------------------------------------------------------- */

function WireHostLoop() {
    const host = isHost();
    const players = usePlayersList(true);
    const [, setEvents] = useEvents();
    const [solved, setSolved] = useMultiplayerState("wire:solved", false);
    const solutionRef = useRef(null); // host-only secret mapping

    // Publish a mural key id and seed the host's hidden solution from WIRE_PATTERNS
    const [keyId, setKeyId] = useMultiplayerState("wire:keyId", "A");

    useEffect(() => {
        if (!host || solved || solutionRef.current) return;
        const id = getRandomKeyId();            // pick any allowed key (A,C,E,G,H,I…R)
        setKeyId(id);                            // tell all clients which mural to show
        solutionRef.current = WIRE_PATTERNS[id]; // host-only answer (shape->color)
    }, [host, solved, setKeyId]);

    // Validate guesses (light RAF loop)
    useEffect(() => {
        if (!host) return;
        let stop = false;
        const handled = new Map(); // playerId -> last req tick

        const loop = () => {
            if (stop) return;
            const sol = solutionRef.current;
            if (sol) {
                for (const p of players) {
                    const tick = Number(p?.getState?.("wire:reqTick") || 0);
                    if (!tick || handled.get(p.id) === tick) continue;

                    let guess;
                    try {
                        const raw = p.getState?.("wire:guessJson");
                        guess = raw ? JSON.parse(raw) : null;
                    } catch {
                        guess = null;
                    }

                    const ok =
                        !!guess &&
                        SHAPES.every((s) => COLORS.includes(guess[s])) &&
                        SHAPES.every((s) => guess[s] === sol[s]);

                    p.setState("wire:lastResult", ok ? "ok" : "bad", true);

                    if (ok && !solved) {
                        setSolved(true);
                        hostAppendEvent(setEvents, "Wire Console solved — engine console unlocked.");
                    }
                    handled.set(p.id, tick);
                }
            }
            requestAnimationFrame(loop);
        };
        loop();
        return () => { stop = true; };
    }, [host, players, setEvents, setSolved, solved]);

    return null;
}

/* -------------------------------------------------------------------------- */
/* ----------------------- CLIENT UI: overlay + board ---------------------- */

// Child with all the interactive hooks
function WireBoard({ onClose }) {
    const [status, setStatus] = useState("");
    const [solved] = useMultiplayerState("wire:solved", false);
    // NOTE: keyId is used by the world panel, not shown inside the console UI
    // const [keyId] = useMultiplayerState("wire:keyId", "A");

    // Board layout (pixel size of the PNG in UI)
    const W = 560, H = 560;
    const HANDLE_SIZE = 24; // dot size

    // --- Normalized anchors (0..1) you can tweak to match the PNG ---
    // Left drag dots (one per shape). Tune these to sit on your art.
    const LEFT_ANCHORS_N = {
        triangle: { u: 0.26, v: 0.43 },
        circle: { u: 0.26, v: 0.53 },
        square: { u: 0.26, v: 0.63 },
        hexagon: { u: 0.26, v: 0.74 },
    };

    // Right color sockets (top → bottom). Tune per your PNG squares.
    const RIGHT_ANCHORS_N = [
        { u: 0.73, v: 0.42 },
        { u: 0.73, v: 0.52 },
        { u: 0.73, v: 0.63 },
        { u: 0.73, v: 0.74 },
    ];

    // Helpers: normalized → px
    const px = (u) => Math.round(u * W);
    const py = (v) => Math.round(v * H);

    // Precompute px anchors
    const LEFT_ANCHORS = Object.fromEntries(
        Object.entries(LEFT_ANCHORS_N).map(([k, a]) => [k, { x: px(a.u), y: py(a.v) }])
    );
    const RIGHT_ANCHOR_ROWS = RIGHT_ANCHORS_N.map((a) => ({ x: px(a.u), y: py(a.v) }));

    const SOCKET_COLORS_TOP_TO_BOTTOM = ["red", "blue", "yellow", "green"];
    // Socket positions
    const sockets = SOCKET_COLORS_TOP_TO_BOTTOM.map((color, idx) => ({
        color,
        x: RIGHT_ANCHOR_ROWS[idx].x,
        y: RIGHT_ANCHOR_ROWS[idx].y,
    }));

    // Wire state
    const [mapping, setMapping] = useState({});
    const [occupied, setOccupied] = useState({});

    // Drag state
    const [drag, setDrag] = useState(null);
    const boardRef = useRef(null);

    // Watch host validation result
    useEffect(() => {
        const me = myPlayer?.(); if (!me) return;
        let t;
        const poll = () => {
            const res = String(me.getState?.("wire:lastResult") || "");
            if (res === "ok") setStatus("✅ Console unlocked!");
            else if (res === "bad") setStatus("❌ Incorrect mapping. Try again.");
            t = setTimeout(poll, 120);
        };
        poll();
        return () => clearTimeout(t);
    }, []);

    useEffect(() => { if (solved) setStatus("✅ Console already unlocked."); }, [solved]);

    // Helpers
    const toBoardXY = (evt) => {
        const r = boardRef.current.getBoundingClientRect();
        const e = evt.touches ? evt.touches[0] : evt;
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const shapeAnchor = (shape) => LEFT_ANCHORS[shape];

    const bez = (x1, y1, x2, y2) => {
        const dx = (x2 - x1) * 0.55;
        return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    };

    // Drag handlers
    const startDrag = (shape, evt) => {
        evt.preventDefault();
        const { x, y } = toBoardXY(evt);
        const prev = mapping[shape];
        if (prev) {
            setOccupied((o) => { const n = { ...o }; delete n[prev]; return n; });
            setMapping((m) => { const n = { ...m }; delete n[shape]; return n; });
        }
        setDrag({ shape, x, y });
    };

    const moveDrag = (evt) => {
        if (!drag) return;
        const { x, y } = toBoardXY(evt);
        setDrag((d) => ({ ...d, x, y }));
    };

    const endDrag = (evt) => {
        if (!drag) return;
        const { x, y } = toBoardXY(evt);
        const SNAP = 28;
        let best = null, bestD2 = SNAP * SNAP + 1;
        for (const s of sockets) {
            if (occupied[s.color]) continue;
            const dx = x - s.x, dy = y - s.y, d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { best = s; bestD2 = d2; }
        }
        if (best) {
            setMapping((m) => ({ ...m, [drag.shape]: best.color }));
            setOccupied((o) => ({ ...o, [best.color]: drag.shape }));
        }
        setDrag(null);
    };

    const resetAll = () => { setMapping({}); setOccupied({}); setStatus(""); };

    const allConnected = SHAPES.every((s) => mapping[s]);

    const submit = () => {
        if (!allConnected) { setStatus("Connect all four wires first."); return; }
        const me = myPlayer?.(); if (!me) return;
        const tick = (Number(me.getState?.("wire:reqTick") || 0) + 1) | 0;
        me.setState("wire:guessJson", JSON.stringify(mapping), true);
        me.setState("wire:reqTick", tick, true);
        setStatus("Checking…");
    };

    // Hover socket (for glow + preview tint)
    let hoverColor = null;
    if (drag) {
        let best = null, bestD2 = Infinity;
        for (const s of sockets) {
            if (occupied[s.color]) continue;
            const dx = drag.x - s.x, dy = drag.y - s.y, d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { best = s; bestD2 = d2; }
        }
        if (best && bestD2 <= 30 * 30) hoverColor = best.color;
    }

    return (
        <div
            onMouseMove={moveDrag} onMouseUp={endDrag}
            onTouchMove={moveDrag} onTouchEnd={endDrag}
            style={{ position: "relative", width: W + 20, padding: 10, borderRadius: 14, background: "#0d1117", border: "1px solid #2a3242" }}
        >
            {/* Title bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 6px 8px" }}>
                <h3 style={{ margin: 0, fontSize: 16, letterSpacing: .3 }}>Wiring Pattern Console</h3>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={resetAll} style={{ padding: "4px 8px" }}>Reset</button>
                    <button onClick={onClose} style={{ padding: "4px 8px" }}>Close</button>
                </div>
            </div>

            {/* Board */}
            <div
                ref={boardRef}
                style={{
                    position: "relative", width: W, height: H, borderRadius: 12,
                    background: `url(${BOARD_URL}) center/cover no-repeat`,
                    border: "1px solid #223049",
                    boxShadow: "0 8px 24px rgba(0,0,0,.35) inset, 0 8px 28px rgba(0,0,0,.35)"
                }}
            >
                {/* Wires (SVG) */}
                <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
                    {SHAPES.map(shape => {
                        const color = mapping[shape];
                        if (!color) return null;
                        const a = shapeAnchor(shape);
                        const s = sockets.find(ss => ss.color === color);
                        const path = bez(a.x, a.y, s.x, s.y);
                        const stroke = COLOR_HEX[color];
                        return (
                            <g key={`wire_${shape}`}>
                                <path d={path} stroke={stroke} strokeWidth={10} fill="none" strokeLinecap="round" />
                                <path d={path} stroke="#111827" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.35} />
                            </g>
                        );
                    })}
                    {drag && (() => {
                        const a = shapeAnchor(drag.shape);
                        const path = bez(a.x, a.y, drag.x, drag.y);
                        const stroke = hoverColor ? COLOR_HEX[hoverColor] : "#a1a1aa";
                        return (
                            <g key="drag_wire">
                                <path d={path} stroke={stroke} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={hoverColor ? "none" : "8 10"} />
                                <path d={path} stroke="#111827" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.35} />
                            </g>
                        );
                    })()}
                </svg>

                {/* Left handles: textless dot grips */}
                {SHAPES.map((shape) => (
                    <button
                        key={`handle_${shape}`}
                        onMouseDown={(e) => startDrag(shape, e)}
                        onTouchStart={(e) => startDrag(shape, e)}
                        aria-label={`Drag from ${shape}`}
                        style={{
                            position: "absolute",
                            left: LEFT_ANCHORS[shape].x - HANDLE_SIZE / 2,
                            top: LEFT_ANCHORS[shape].y - HANDLE_SIZE / 2,
                            width: HANDLE_SIZE,
                            height: HANDLE_SIZE,
                            padding: 0,
                            borderRadius: 999,
                            border: "2px solid #64748b",
                            background:
                                "radial-gradient(circle at 50% 50%, rgba(148,163,184,0.95) 30%, rgba(15,23,42,0.95) 31%)",
                            boxShadow:
                                drag?.shape === shape
                                    ? "0 0 12px rgba(148,163,184,.9)"
                                    : "0 0 6px rgba(148,163,184,.45)",
                            userSelect: "none",
                            cursor: drag?.shape === shape ? "grabbing" : "grab",
                            outline: "none",
                        }}
                        title="Drag wire"
                    />
                ))}

                {/* Right sockets */}
                {sockets.map(s => {
                    const used = occupied[s.color];
                    const glow = hoverColor === s.color && !used;
                    const bg = used ? COLOR_HEX[s.color] : "transparent";
                    return (
                        <div key={`socket_${s.color}`}
                            style={{
                                position: "absolute", left: s.x - 20, top: s.y - 20, width: 40, height: 40,
                                borderRadius: 10, border: `3px solid ${COLOR_HEX[s.color]}`,
                                boxShadow: glow ? `0 0 14px ${COLOR_HEX[s.color]}` : "none",
                                background: bg, pointerEvents: "none"
                            }}
                            title={`${s.color.toUpperCase()} socket`}
                        />
                    );
                })}

                {/* Footer controls */}
                <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex", gap: 8 }}>
                    <button
                        onClick={submit}
                        style={{ padding: "8px 12px", borderRadius: 10, background: allConnected ? "#2563eb" : "#334155", color: "#fff", fontWeight: 700 }}
                        disabled={!allConnected}
                    >
                        Validate
                    </button>
                    {status && <div style={{ alignSelf: "center", opacity: .95 }}>{status}</div>}
                </div>
            </div>
        </div>
    );
}

// Parent overlay: ONLY manages open/close flag → stable hook order
function Overlay() {
    const [open, setOpen] = useState(false);

    // Track ui flag from InteractionSystem
    useEffect(() => {
        let t;
        const poll = () => {
            const me = myPlayer?.();
            if (!me) { t = setTimeout(poll, 120); return; }
            setOpen(!!me.getState?.("ui_wireOpen"));
            t = setTimeout(poll, 120);
        };
        poll();
        return () => clearTimeout(t);
    }, []);

    if (!open) return null;

    const close = () => myPlayer()?.setState?.("ui_wireOpen", 0, true);

    return (
        <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.55)", zIndex: 2000, cursor: "default" }}>
            <WireBoard onClose={close} />
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* System wrapper                                                             */
/* -------------------------------------------------------------------------- */

export default function WireConsoleSystem() {
    return (
        <>
            <WireHostLoop />
            <Overlay />
        </>
    );
}
