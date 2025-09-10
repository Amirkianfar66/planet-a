// src/world/SimplePickupDemo.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer, isHost, usePlayersList } from "playroomkit";

/**
 * Networked Simple Pickup (1 object, host authoritative)
 * - One item at [2, 0, 0]
 * - Any player presses "P" or clicks → sends a request
 * - HOST accepts first request and sets demoPicked on itself
 * - All clients poll for that host flag; when seen → item disappears everywhere
 */

const ITEM_ID = "demoItem1";
const ITEM_POS = [2, 0, 0];

/* ----------------- small UI helpers ----------------- */
function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => {
        if (ref.current) ref.current.quaternion.copy(camera.quaternion);
    });
    return (
        <group ref={ref} position={position}>
            {children}
        </group>
    );
}

function TextSprite({
    text = "",
    width = 0.95,
    bg = "rgba(20,26,34,0.92)",
    fg = "#ffffff",
}) {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // rounded rect
        const x = 6,
            y = 50,
            w = canvas.width - 12,
            h = 92,
            r = 20;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.fill();

        // text
        ctx.fillStyle = fg;
        ctx.font =
            "600 48px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, y + h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return tex;
    }, [text, bg, fg]);

    const aspect = 512 / 192;
    return (
        <mesh>
            <planeGeometry args={[width, width / aspect]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
    );
}

function ItemMesh() {
    return (
        <group>
            <mesh>
                <cylinderGeometry args={[0.15, 0.15, 0.35, 12]} />
                <meshStandardMaterial color="#2dd4bf" />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
                <meshStandardMaterial color="#0f172a" />
            </mesh>
        </group>
    );
}

/* ----------------- main demo ----------------- */
export default function SimplePickupDemo() {
    const others = usePlayersList(true);
    const me = myPlayer();
    const host = isHost();

    // Keep a live ref to "everyone" (others + me if missing)
    const playersRef = useRef([]);
    useEffect(() => {
        const arr = [...(others || [])];
        if (me && !arr.find((p) => p.id === me.id)) arr.push(me);
        playersRef.current = arr;
    }, [others, me]);

    // Local picked state (mirrors host flag)
    const [picked, setPicked] = useState(false);

    // Poll for the host's demoPicked flag so all clients update reliably
    useEffect(() => {
        const t = setInterval(() => {
            try {
                const arr = playersRef.current || [];
                const anyPicked = arr.some(
                    (p) => String(p?.getState("demoPicked") || "") === ITEM_ID
                );
                setPicked((prev) => (prev !== anyPicked ? anyPicked : prev));
            } catch { }
        }, 150);
        return () => clearInterval(t);
    }, []);

    // Client input → send a pickup request
    const sendPickupRequest = () => {
        if (picked) return;
        const id = Math.floor(Math.random() * 1e9);
        me?.setState("reqId", id, true);
        me?.setState("reqType", "demo_pickup", true);
        me?.setState("reqTarget", ITEM_ID, true);
        me?.setState("reqValue", 0, true);
    };

    useEffect(() => {
        const onKeyDown = (e) => {
            if ((e.key || "").toLowerCase() === "p") sendPickupRequest();
        };
        window.addEventListener("keydown", onKeyDown, { passive: true });
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [picked, me]);

    // Host: process pickup requests at a gentle cadence
    useEffect(() => {
        if (!host) return;
        const processed = new Map(); // per-player last handled reqId
        const h = setInterval(() => {
            if (picked) return;
            const arr = playersRef.current || [];
            for (const p of arr) {
                const reqId = Number(p?.getState("reqId") || 0);
                const reqType = String(p?.getState("reqType") || "");
                const reqTarget = String(p?.getState("reqTarget") || "");
                if (!reqId || reqType !== "demo_pickup" || reqTarget !== ITEM_ID) continue;
                if (processed.get(p.id) === reqId) continue;

                // Accept first valid request → mark picked globally (host-owned flag)
                myPlayer()?.setState("demoPicked", ITEM_ID, true);
                processed.set(p.id, reqId);
                console.log("[HOST] demo item picked by", p.id);
                break;
            }
        }, 100);
        return () => clearInterval(h);
    }, [host, picked]);

    // ---------- Render ----------
    if (picked) return null;

    return (
        <group
            position={[ITEM_POS[0], ITEM_POS[1] + 0.25, ITEM_POS[2]]}
            onPointerDown={(e) => {
                e.stopPropagation();
                sendPickupRequest();
            }}
            onPointerOver={() => {
                document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
                document.body.style.cursor = "";
            }}
        >
            <ItemMesh />

            {/* floor ring */}
            <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.35, 0.42, 24]} />
                <meshBasicMaterial color="#86efac" transparent opacity={0.85} />
            </mesh>

            {/* label */}
            <Billboard position={[0, 0.85, 0]}>
                <TextSprite text={"Press P or Click to pick up"} />
            </Billboard>
        </group>
    );
}
