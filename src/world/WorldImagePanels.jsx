// src/world/WorldImagePanels.jsx
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useMultiplayerState } from "playroomkit";

// ⬅️ this file lives under src/world → go up a folder
import { getMuralUrlList, WIRE_PATTERNS } from "../data/wireKeys.js";
import { DEVICESTV } from "../data/gameObjects.js";
import { roomCenter } from "../map/deckA";

/* ----------------------------------------------------------------------------
   Inline SVG → Texture (debug panel)
----------------------------------------------------------------------------- */
function makeInlineSVGTexture({ text = "A", w = 512, h = 512 } = {}) {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111"/>
      <stop offset="1" stop-color="#444"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#g)"/>
  <rect x="16" y="16" width="${w - 32}" height="${h - 32}" fill="none" stroke="#fff" stroke-width="8" rx="24"/>
  <text x="50%" y="58%" text-anchor="middle" font-size="${Math.floor(h * 0.5)}" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#f2f2f2">
    ${String(text).slice(0, 2)}
  </text>
</svg>`.trim();

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const loader = new THREE.TextureLoader();

    const tex = loader.load(url, (t) => {
        // sRGB for correct colors (three r152+)
        if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
        else t.encoding = THREE.sRGBEncoding; // compat with older three
        t.anisotropy = 8;
        t.needsUpdate = true;
        // Free the object URL once the texture is in memory
        setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    return tex;
}

function InlineSVGPanel({ position = [0, 2, 0], size = [2, 1.2], letter = "A", rotationY = 0 }) {
    const texture = useMemo(() => makeInlineSVGTexture({ text: letter }), [letter]);
    return (
        <group position={position} rotation={[0, rotationY, 0]}>
            <mesh>
                <planeGeometry args={[size[0], size[1]]} />
                <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

/* ----------------------------------------------------------------------------
   Config
----------------------------------------------------------------------------- */

// Turn this ON to load /ui/wire_keys/key_<ID>.png|svg. Off = procedural fallback.
const USE_IMAGES = true;

// Toggle the debug SVG panel (shows big letter at a visible spot)
const SHOW_SVG_TEST = false;

// Procedural palette (fallback)
const PALETTE = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#f59e0b",
};

// How white before we consider an image "blank" (0..255)
const BLANK_IMAGE_THRESHOLD = 254;

/* ----------------------------------------------------------------------------
   Helpers
----------------------------------------------------------------------------- */

// draw the 2×2 shapes grid for a key id → returns CanvasTexture
function textureFromKeyId(keyId, w = 768, h = 512) {
    const spec = WIRE_PATTERNS[keyId] || {};
    const shapes = ["triangle", "circle", "square", "hexagon"];
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");

    // bg + frame
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    const pad = 28,
        cellW = (w - pad * 3) / 2,
        cellH = (h - pad * 3) / 2;

    shapes.forEach((s, i) => {
        const r = (i / 2) | 0,
            col = i % 2;
        const x = pad + col * (cellW + pad);
        const y = pad + r * (cellH + pad);
        const cx = x + cellW / 2,
            cy = y + cellH / 2,
            R = Math.min(cellW, cellH) * 0.32;

        ctx.fillStyle = "#0f172a";
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(x, y, cellW, cellH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = PALETTE[spec[s]] || "#9ca3af";
        ctx.beginPath();
        if (s === "triangle") {
            ctx.moveTo(cx, cy - R);
            ctx.lineTo(cx - R * 0.9, cy + R * 0.9);
            ctx.lineTo(cx + R * 0.9, cy + R * 0.9);
            ctx.closePath();
        } else if (s === "circle") {
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
        } else if (s === "square") {
            ctx.rect(cx - R, cy - R, 2 * R, 2 * R);
        } else {
            for (let k = 0; k < 6; k++) {
                const a = (Math.PI / 3) * k + Math.PI / 6;
                const px = cx + R * Math.cos(a),
                    py = cy + R * Math.sin(a);
                k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
        }
        ctx.fill();
    });

    const tex = new THREE.CanvasTexture(c);
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
}

// quick check for “blank/white” textures (1×1, 2×2, or almost white)
function isBlankImage(img) {
    try {
        const w = img.naturalWidth || img.width || 0,
            h = img.naturalHeight || img.height || 0;
        if (!w || !h) return true;
        if (w <= 2 && h <= 2) return true;
        const c = document.createElement("canvas");
        c.width = Math.min(64, w);
        c.height = Math.min(64, h);
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0,
            n = c.width * c.height;
        for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        const avg = sum / n; // 0..255
        return avg > BLANK_IMAGE_THRESHOLD;
    } catch {
        return false;
    }
}

/* ----------------------------------------------------------------------------
   Panel (loads image → falls back to procedural)
----------------------------------------------------------------------------- */
function MuralPanel({ keyId, urlList, width = 1.6, height = 1.2 }) {
    const [tex, setTex] = useState(null);

    useEffect(() => {
        let alive = true;
        let currentTex = null;

        const setTexture = (t) => {
            currentTex = t;
            setTex(t);
        };

        if (!USE_IMAGES) {
            setTexture(textureFromKeyId(keyId));
            return () => {
                alive = false;
                if (currentTex?.dispose) currentTex.dispose();
            };
        }

        const loader = new THREE.TextureLoader();
        let i = 0;

        const tryNext = () => {
            if (!alive) return;
            if (!urlList || i >= urlList.length) {
                console.warn("[MURAL] all URLs failed → procedural:", keyId);
                setTexture(textureFromKeyId(keyId));
                return;
            }
            const url = urlList[i++];
            loader.load(
                url,
                (t) => {
                    if (!alive) return;
                    console.log("[MURAL] loaded:", url);
                    if (t?.image && isBlankImage(t.image)) {
                        console.warn("[MURAL] image appears blank → procedural:", url);
                        if (t.dispose) t.dispose();
                        setTexture(textureFromKeyId(keyId));
                        return;
                    }
                    if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
                    else t.encoding = THREE.sRGBEncoding;
                    t.anisotropy = 8;
                    setTexture(t);
                },
                undefined,
                () => {
                    console.warn("[MURAL] failed:", url);
                    tryNext();
                }
            );
        };

        tryNext();
        return () => {
            alive = false;
            if (currentTex?.dispose) currentTex.dispose();
        };
    }, [urlList, keyId]);

    return (
        <group>
            {/* slim frame */}
            <mesh>
                <boxGeometry args={[width + 0.06, height + 0.06, 0.06]} />
                <meshStandardMaterial color="#283345" />
            </mesh>
            {/* poster */}
            <mesh position={[0, 0, 0.035]}>
                <planeGeometry args={[width, height]} />
                {tex ? (
                    <meshBasicMaterial map={tex} transparent side={THREE.DoubleSide} />
                ) : (
                    <meshBasicMaterial color="#8B0000" side={THREE.DoubleSide} />
                )}
            </mesh>
        </group>
    );
}

/* ----------------------------------------------------------------------------
   Main
----------------------------------------------------------------------------- */
export default function WorldImagePanels() {
    // Host loop publishes the active key (WireConsoleSystem). Default "A".
    const [keyId] = useMultiplayerState("wire:keyId", "A");

    useEffect(() => {
        console.log("[WorldImagePanels] mounted with keyId:", keyId);
        return () => console.log("[WorldImagePanels] unmounted");
    }, [keyId]);

    // If your good art is SVGs, flip order to ["svg","png"]
    const urlList = useMemo(() => getMuralUrlList(keyId, ["png", "svg"]), [keyId]);

    // Use configured device(s), else auto-place in Rocket room
    const panels = useMemo(() => {
        const devs = (DEVICESTV || []).filter((d) => d?.type === "mural_key"); // includes "wire_mural" in Rocket
        if (devs.length) return devs;
        const c = roomCenter?.("Rocket") || { x: 0, z: 0 };
        return [
            {
                id: "wire_mural_auto",
                type: "mural_key",
                x: c.x - 1.2,
                z: c.z - 2.0,
                y: 0.8,
                yaw: Math.PI,
                width: 2.0,
                height: 1.35,
            },
        ];
    }, []);

    // Debug SVG panel position (shifted so it doesn't overlap the real mural)
    const testPos = useMemo(() => {
        const c = roomCenter("Rocket");
        return [c.x + 1.5, 2.0, c.z - 1.0];
    }, []);

    return (
        <group>
            {SHOW_SVG_TEST && (
                <InlineSVGPanel position={testPos} size={[2, 1.2]} letter={keyId} rotationY={Math.PI} />
            )}

            {panels.map((d) => {
                const {
                    x = 0,
                    y = 0.8,
                    z = 0,
                    yaw = 0,
                    width = 1.6,
                    height = 1.2,
                    id = "mural",
                } = d || {};
                return (
                    <group key={id} position={[x, y, z]} rotation={[0, yaw, 0]}>
                        <MuralPanel keyId={keyId} urlList={urlList} width={width} height={height} />
                    </group>
                );
            })}
        </group>
    );
}
