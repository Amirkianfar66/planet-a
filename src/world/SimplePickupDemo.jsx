// src/world/SimplePickupDemo.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer, isHost, usePlayersList } from "playroomkit";

/**
 * Networked Simple Pickup (1 object, host authoritative)
 * - Renders ONE item at [2, 0, 0].
 * - Any player presses "P" or clicks → sends a request.
 * - HOST processes the request once, sets a shared flag on itself.
 * - ALL clients read that flag from the host player → item disappears for everyone.
 */

const ITEM_ID = "demoItem1";
const ITEM_POS = [2, 0, 0];

// Small UI bits (billboard text)
function TextSprite({ text = "", width = 0.95, bg = "rgba(20,26,34,0.92)", fg = "#ffffff" }) {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const x = 6, y = 50, w = canvas.width - 12, h = 92, r = 20;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        ctx.fillStyle = fg;
        ctx.font = "600 48px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, y + h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
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

function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

function ItemMesh() {
    return (
        <group>
            <mesh><cylinderGeometry args={[0.15, 0.15, 0.35, 12]} /><meshStandardMaterial color="#2dd4bf" /></mesh>
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.06, 0.06, 0.1, 12]} /><meshStandardMaterial color="#0f172a" /></mesh>
        </group>
    );
}

export default function SimplePickupDemo() {
    // All players list; may exclude self, so we’ll add self below
    const others = usePlayersList(true);
    const me = myPlayer();
    const host = isHost();

    // Always work with a list that includes "me"
    const everyone = useMemo(() => {
        const arr = [...(others || [])];
        if (me && !arr.find(p => p.id === me.id)) arr.push(me);
        return arr;
    }, [others, me]);

    // Has the item been picked up? (host writes; everyone reads host's flag)
    const picked = useMemo(() => {
        // If any player has demoPicked === ITEM_ID, we consider it picked.
        // Convention: host sets this; clients just read it.
        return everyone.some(p => String(p.getState("demoPicked") || "") === ITEM_ID);
    }, [everyone]);

    // ---------- CLIENT: send a pickup request (P key or click) ----------
    const reqSeq = useRef(Math.floor(Math.random() * 1000) + 1);

    useEffect(() => {
        function sendRequest() {
            if (picked) return; // already gone
            const id = ++reqSeq.current;
            me?.setState("reqId", id, true);
            me?.setState("reqType", "demo_pickup", true);
            me?.setState("reqTarget", ITEM_ID, true);
            me?.setState("reqValue", 0, true);
            // (host will process this and flip demoPicked; no local hiding here)
        }

        function onKeyDown(e) {
            if ((e.key || "").toLowerCase() !== "p") return;
            sendRequest();
        }

        window.addEventListener("keydown", onKeyDown, { passive: true });
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [me, picked]);

    // ---------- HOST: process pickup requests and broadcast once ----------
    useEffect(() => {
        if (!host) return;

        const processed = new Map(); // per-player last handled reqId
        let done = false;

        const tick = () => {
            if (done) return;
            // If already picked, no more work
            const isPicked = everyone.some(p => String(p.getState("demoPicked") || "") === ITEM_ID);
            if (isPicked) { done = true; return; }

            for (const p of everyone) {
                const reqId = Number(p.getState("reqId") || 0);
                const reqType = String(p.getState("reqType") || "");
                const reqTarget = String(p.getState("reqTarget") || "");

                if (!reqId || reqType !== "demo_pickup" || reqTarget !== ITEM_ID) continue;
                if (processed.get(p.id) === reqId) continue;

                // Accept first valid request → mark picked globally (host-owned flag)
                myPlayer()?.setState("demoPicked", ITEM_ID, true);
                console.log("[HOST] demo item picked by", p.id);
                processed.set(p.id, reqId);
                done = true;
                break;
            }

            // keep polling until done
            if (!done) queueMicrotask(tick);
        };

        // start fast microtask loop (cheap; reacts quickly)
        queueMicrotask(tick);
        return () => { done = true; };
    }, [host, everyone]);

    // ---------- Render ----------
    if (picked) return null; // item has been picked → hide for everyone

    return (
        <group
            position={[ITEM_POS[0], ITEM_POS[1] + 0.25, ITEM_POS[2]]}
            onPointerDown={(e) => {
                e.stopPropagation();
                // mirror the keyboard path: send a pickup request
                const id = ++reqSeq.current;
                me?.setState("reqId", id, true);
                me?.setState("reqType", "demo_pickup", true);
                me?.setState("reqTarget", ITEM_ID, true);
                me?.setState("reqValue", 0, true);
            }}
            onPointerOver={() => { document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = ""; }}
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
