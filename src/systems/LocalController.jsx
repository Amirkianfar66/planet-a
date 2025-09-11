import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer } from "playroomkit";
import { getMyPos, setMyPos } from "../network/playroom";
import { FLOOR, WALL_THICKNESS, wallAABBs } from "../map/deckA";


const SPEED = 4;
const PLAYER_RADIUS = 0.35;
const GRAVITY = 16;
const JUMP_V = 5.2;
const GROUND_Y = 0;

function resolveCollisions(next) {
    for (let pass = 0; pass < 2; pass++) {
        for (const b of wallAABBs) {
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

/** Inner controller: your original logic lives here */
function LocalControllerInner() {
    const keys = useRef({});
    const [pos, setPos] = useState(() => getMyPos());
    const yawRef = useRef(0);
    const dragging = useRef(false);
    const lastX = useRef(0);

    const vyRef = useRef(0);
    const groundedRef = useRef(true);

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

            resolveCollisions(next);

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

        const p = myPlayer();
        p.setState("yaw", yawRef.current, false);
        p.setState("spd", horizSpeed, false);
        p.setState("air", !groundedRef.current, false);
    });

    return null;
}

/** Wrapper: mounts inner controller only if alive (dead ⇒ no inputs) */
export default function LocalController() {
    const me = myPlayer();
    const amDead = Boolean(me?.getState?.("dead"));
    return amDead ? null : <LocalControllerInner />;
}
