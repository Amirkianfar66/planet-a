import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer } from "playroomkit";
import { getMyPos, setMyPos } from "../network/playroom";
import { FLOOR, WALL_THICKNESS, wallAABBs, roomCenter } from "../map/deckA";
import { getStaticAABBs } from "../systems/collision";

const SPEED = 4;
const PLAYER_RADIUS = 0.35;
const GRAVITY = 16;
const JUMP_V = 5.2;
const GROUND_Y = 0;

// Prefer exact "lockdown", then aliases
const LOCK_KEYS = ["lockdown", "Lockdown", "lockdown_room", "brig", "jail", "detention"];

const LOCKDOWN_POS = (() => {
    for (const k of LOCK_KEYS) {
        const c = typeof roomCenter === "function" ? roomCenter(k) : null;
        if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
            return Object.freeze({ x: +c.x, y: Number.isFinite(c.y) ? +c.y : 0, z: +c.z });
        }
    }
    return Object.freeze({ x: 12, y: 0, z: -6 }); // fallback
})();

function resolveCollisions(next, boxes) {
    for (let pass = 0; pass < 2; pass++) {
        for (const b of boxes) {
            const insideX = next.x > (b.minX - PLAYER_RADIUS) && next.x < (b.maxX + PLAYER_RADIUS);
            const insideZ = next.z > (b.minZ - PLAYER_RADIUS) && next.z < (b.maxZ + PLAYER_RADIUS);
            if (!(insideX && insideZ)) continue;

            const dxLeft = next.x - (b.minX - PLAYER_RADIUS);
            const dxRight = (b.maxX + PLAYER_RADIUS) - next.x;
            const dzTop = next.z - (b.minZ - PLAYER_RADIUS);
            const dzBottom = (b.maxZ + PLAYER_RADIUS) - next.z;

            const minXPen = Math.min(dxLeft, dxRight);
            const minZPen = Math.min(dzTop, dzBottom);

            if (minXPen < minZPen) {
                next.x = dxLeft < dxRight ? (b.minX - PLAYER_RADIUS) : (b.maxX + PLAYER_RADIUS);
            } else {
                next.z = dzTop < dzBottom ? (b.minZ - PLAYER_RADIUS) : (b.maxZ + PLAYER_RADIUS);
            }
        }
    }
    return next;
}

/** Inner controller */
function LocalControllerInner() {
    const keys = useRef({});
    const [pos, setPos] = useState(() => getMyPos());
    const yawRef = useRef(0);
    const dragging = useRef(false);
    const lastX = useRef(0);

    const vyRef = useRef(0);
    const groundedRef = useRef(true);

    // Expose my position for Door3D, etc.
    const publishPlayerPos = (p) => {
        if (typeof window !== "undefined") {
            window.__playerPos = [p.x, p.y, p.z];
        }
    };

    // Seed on mount; clean up on unmount
    useEffect(() => {
        publishPlayerPos(getMyPos());
        return () => {
            if (typeof window !== "undefined") delete window.__playerPos;
        };
    }, []);

    useEffect(() => {
        const down = (e) => {
            keys.current[e.key.toLowerCase()] = true;
            if (e.code === "Space" && groundedRef.current) {
                vyRef.current = JUMP_V;
                groundedRef.current = false;
            }
        };
        const up = (e) => (keys.current[e.key.toLowerCase()] = false);
        const md = (e) => { if (e.button === 2) { dragging.current = true; lastX.current = e.clientX; } };
        const mu = (e) => { if (e.button === 2) dragging.current = false; };
        const mm = (e) => {
            if (!dragging.current) return;
            const dx = e.clientX - lastX.current;
            lastX.current = e.clientX;
            yawRef.current -= dx * 0.003;
        };
        const cm = (e) => { if (dragging.current) e.preventDefault(); };

        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("mousedown", md);
        window.addEventListener("mouseup", mu);
        window.addEventListener("mousemove", mm);
        window.addEventListener("contextmenu", cm);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("mousedown", md);
            window.removeEventListener("mouseup", mu);
            window.removeEventListener("mousemove", mm);
            window.removeEventListener("contextmenu", cm);
        };
    }, []);

    useFrame((_, dt) => {
        if (!dt) return;

        const p = myPlayer();

        // Authoritative teleport acceptance:
        // If the network pos is far from local pos (e.g., team spawn), snap locally once.
        const net = getMyPos();
        if (net) {
            const dx = net.x - pos.x, dz = net.z - pos.z;
            const horizSq = dx * dx + dz * dz;
            if (horizSq > 1.0) { // > ~1m horizontal → treat as teleport
                setPos(net);
                setMyPos(net.x, net.y, net.z);
                publishPlayerPos(net);
                // keep yawRef; skip rest of frame to avoid immediately overwriting
                p?.setState?.("yaw", yawRef.current, false);
                p?.setState?.("spd", 0, false);
                p?.setState?.("air", false, false);
                return;
            }
        }

        // Dynamic colliders: static walls + extra boxes (doors, etc.)
        const doorStore = (typeof window !== "undefined" && window.__doorAABBs) ? window.__doorAABBs : null;
        const dynamicDoorAABBs = doorStore ? Array.from(doorStore.values()) : [];
        const colliders = wallAABBs.concat(getStaticAABBs(), dynamicDoorAABBs);

        // Lockdown: pin inside lockdown anchor (no movement while locked)
        if (p?.getState?.("inLockdown")) {
            const next = { x: LOCKDOWN_POS.x, y: LOCKDOWN_POS.y, z: LOCKDOWN_POS.z };
            setPos(next);
            setMyPos(next.x, next.y, next.z);
            publishPlayerPos(next);
            p.setState("yaw", yawRef.current, false);
            p.setState("spd", 0, false);
            p.setState("air", false, false);
            return;
        }

        // yaw rotation keys
        if (keys.current["q"]) yawRef.current += 1.5 * dt;
        if (keys.current["e"]) yawRef.current -= 1.5 * dt;

        const forward = new THREE.Vector3(Math.sin(yawRef.current), 0, Math.cos(yawRef.current));
        const right = new THREE.Vector3(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));

        let move = new THREE.Vector3();
        if (keys.current["w"]) move.add(forward);
        if (keys.current["s"]) move.sub(forward);
        if (keys.current["d"]) move.add(right);
        if (keys.current["a"]) move.sub(right);

        let horizSpeed = 0;
        const next = { x: pos.x, y: pos.y, z: pos.z };

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(SPEED * dt);
            horizSpeed = SPEED;
            next.x += move.x;
            next.z += move.z;

            resolveCollisions(next, colliders);

            const m = WALL_THICKNESS + PLAYER_RADIUS + 0.05;
            next.x = Math.max(-FLOOR.w / 2 + m, Math.min(FLOOR.w / 2 - m, next.x));
            next.z = Math.max(-FLOOR.d / 2 + m, Math.min(FLOOR.d / 2 - m, next.z));

            // smooth face-the-move
            const targetYaw = Math.atan2(move.x, move.z);
            const a = yawRef.current, b = targetYaw;
            const shortest = Math.atan2(Math.sin(b - a), Math.cos(b - a));
            yawRef.current = a + shortest * 0.25;
        }

        // gravity & ground
        vyRef.current -= GRAVITY * dt;
        next.y += vyRef.current * dt;
        if (next.y <= GROUND_Y) {
            next.y = GROUND_Y;
            vyRef.current = 0;
            groundedRef.current = true;
        } else {
            groundedRef.current = false;
        }

        setPos(next);
        setMyPos(next.x, next.y, next.z);
        publishPlayerPos(next);
        p?.setState?.("yaw", yawRef.current, false);
        p?.setState?.("spd", horizSpeed, false);
        p?.setState?.("air", !groundedRef.current, false);
    });

    return null;
}

/** Wrapper: mounts inner controller only if alive (dead ⇒ no inputs) */
export default function LocalController() {
    const me = myPlayer();
    const amDead = Boolean(me?.getState?.("dead"));
    return amDead ? null : <LocalControllerInner />;
}
