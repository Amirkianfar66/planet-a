// src/dev/PerfHUD.jsx
import React, { useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { createPortal } from "react-dom";

/** Mount THIS inside <Canvas>. It collects stats and emits them to window. */
export function PerfProbe() {
    const gl = useThree((s) => s.gl);
    const frameCount = useRef(0);
    const acc = useRef({ lastT: performance.now() });

    useFrame(() => { frameCount.current++; });

    useEffect(() => {
        const tick = () => {
            const now = performance.now();
            const dt = (now - acc.current.lastT) / 1000;
            acc.current.lastT = now;

            let calls = 0, tris = 0, geos = 0, tex = 0;
            if (gl?.info) {
                calls = gl.info.render.calls;
                tris = gl.info.render.triangles;
                geos = gl.info.memory.geometries;
                tex = gl.info.memory.textures;
                gl.info.reset(); // start a new window
            }

            const fps = Math.round(frameCount.current / Math.max(dt, 1e-3));
            frameCount.current = 0;

            const snapshot = { fps, calls, tris, geos, tex };
            window.__perfStats__ = snapshot;
            window.dispatchEvent(new CustomEvent("__perfstats__", { detail: snapshot }));
        };

        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [gl]);

    return null; // 🔴 no DOM inside Canvas
}

/** Mount THIS anywhere in normal React DOM (outside <Canvas>). */
export function PerfOverlay({ top = 8, left = 8 }) {
    const [stats, setStats] = useState(() => window.__perfStats__ || {});

    useEffect(() => {
        const onStats = (e) => setStats(e.detail || window.__perfStats__ || {});
        window.addEventListener("__perfstats__", onStats);
        const pull = setInterval(() => setStats(window.__perfStats__ || {}), 1000); // fallback
        return () => {
            window.removeEventListener("__perfstats__", onStats);
            clearInterval(pull);
        };
    }, []);

    return createPortal(
        <div style={{
            position: "fixed", top, left, zIndex: 2147483647,
            background: "rgba(0,0,0,0.6)", color: "#fff",
            padding: 8, borderRadius: 8,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12, lineHeight: 1.3, pointerEvents: "none"
        }}>
            <div><b>FPS:</b> {stats.fps ?? "…"}</div>
            <div><b>Draw calls:</b> {stats.calls ?? "…"} &nbsp;|&nbsp; <b>Tris:</b> {stats.tris ?? "…"}</div>
            <div><b>Geos:</b> {stats.geos ?? "…"} &nbsp;|&nbsp; <b>Textures:</b> {stats.tex ?? "…"}</div>
        </div>,
        document.body
    );
}
