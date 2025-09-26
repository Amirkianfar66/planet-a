// src/world/WorldImagePanels.jsx
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useMultiplayerState } from "playroomkit";

// ✅ this file lives under src/world → go up a folder
import { getMuralUrlList, WIRE_PATTERNS } from "../data/wireKeys.js";
import { DEVICESTV } from "../data/gameObjects.js";
import { roomCenter } from "../map/deckA";

// --- TEMP: set to false to ignore PNG/SVG and ALWAYS draw from data (proves the pipeline)
const USE_IMAGES = false;
// --- simple palette for drawing from data
const PALETTE = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#f59e0b" };

// draw the 2×2 shapes grid for a key id → returns CanvasTexture
function textureFromKeyId(keyId, w = 768, h = 512) {
    const spec = WIRE_PATTERNS[keyId] || {};
    const shapes = ["triangle", "circle", "square", "hexagon"];
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");

    // bg + frame
    ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 8; ctx.strokeRect(6, 6, w - 12, h - 12);

    const pad = 28, cellW = (w - pad * 3) / 2, cellH = (h - pad * 3) / 2;

    shapes.forEach((s, i) => {
        const r = (i / 2) | 0, col = i % 2;
        const x = pad + col * (cellW + pad);
        const y = pad + r * (cellH + pad);
        const cx = x + cellW / 2, cy = y + cellH / 2, R = Math.min(cellW, cellH) * 0.32;

        ctx.fillStyle = "#0f172a"; ctx.strokeStyle = "#334155"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.rect(x, y, cellW, cellH); ctx.fill(); ctx.stroke();

        ctx.fillStyle = PALETTE[spec[s]] || "#9ca3af";
        ctx.beginPath();
        if (s === "triangle") {
            ctx.moveTo(cx, cy - R); ctx.lineTo(cx - R * 0.9, cy + R * 0.9); ctx.lineTo(cx + R * 0.9, cy + R * 0.9); ctx.closePath();
        } else if (s === "circle") {
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
        } else if (s === "square") {
            ctx.rect(cx - R, cy - R, 2 * R, 2 * R);
        } else {
            for (let k = 0; k < 6; k++) {
                const a = (Math.PI / 3) * k + Math.PI / 6;
                const px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
                k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
        }
        ctx.fill();
    });

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

// quick check for “blank/white” textures (1×1, 2×2, or almost white)
function isBlankImage(img) {
    try {
        const w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0;
        if (!w || !h) return true;
        if (w <= 2 && h <= 2) return true;
        const c = document.createElement("canvas");
        c.width = Math.min(64, w); c.height = Math.min(64, h);
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0, n = c.width * c.height;
        for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        const avg = sum / n; // 0..255
        return avg > 250;
    } catch {
        return false;
    }
}

function MuralPanel({ keyId, urlList, width = 1.6, height = 1.2 }) {
    const [tex, setTex] = useState(null);

    useEffect(() => {
        let alive = true;

        // forced canvas mode → no file loading at all
        if (!USE_IMAGES) {
            setTex(textureFromKeyId(keyId));
            return () => { alive = false; };
        }

        // otherwise, try files then fallback to canvas
        const loader = new THREE.TextureLoader();
        let i = 0;

        const tryNext = () => {
            if (!alive) return;
            if (!urlList || i >= urlList.length) {
                console.warn("[MURAL] all URLs failed → procedural:", keyId);
                setTex(textureFromKeyId(keyId));
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
                        setTex(textureFromKeyId(keyId));
                        return;
                    }
                    t.colorSpace = THREE.SRGBColorSpace;
                    t.anisotropy = 8;
                    setTex(t);
                },
                undefined,
                () => {
                    console.warn("[MURAL] failed:", url);
                    tryNext();
                }
            );
        };

        tryNext();
        return () => { alive = false; };
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
                {tex ? <meshBasicMaterial map={tex} transparent /> : <meshBasicMaterial color="#8B0000" />}
            </mesh>
        </group>
    );
}

export default function WorldImagePanels() {
    // host loop publishes the active key
    const [keyId] = useMultiplayerState("wire:keyId", "A"); // published by WireConsoleSystem :contentReference[oaicite:1]{index=1}

    // if your good art is SVGs, flip order to ["svg","png"]
    const urlList = useMemo(() => getMuralUrlList(keyId, ["png", "svg"]), [keyId]); // builds /ui/wire_keys/key_<ID>.ext :contentReference[oaicite:2]{index=2}

    // use configured device(s), else auto-place in Rocket room
    const panels = useMemo(() => {
        const devs = (DEVICESTV || []).filter(d => d?.type === "mural_key"); // includes "wire_mural" in Rocket 
        if (devs.length) return devs;
        const c = roomCenter?.("Rocket") || { x: 0, z: 0 };
        return [{ id: "wire_mural_auto", type: "mural_key", x: c.x - 1.2, z: c.z - 2.0, y: 0.8, yaw: Math.PI, width: 2.0, height: 1.35 }];
    }, []);

    return (
        <group>
            {panels.map(d => {
                const { x = 0, y = 0.8, z = 0, yaw = 0, width = 1.6, height = 1.2, id } = d || {};
                return (
                    <group key={id} position={[x, y, z]} rotation={[0, yaw, 0]}>
                        <MuralPanel keyId={keyId} urlList={urlList} width={width} height={height} />
                    </group>
                );
            })}
        </group>
    );
}
