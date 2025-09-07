// src/components/GameCanvas.jsx
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { myPlayer, usePlayersList } from 'playroomkit';
import { getMyPos, setMyPos } from '../network/playroom';
import {
    FLOOR, WALL_THICKNESS, WALL_HEIGHT,
    OUTSIDE_AREA, STATION_AREA, ROOMS,
    walls, wallAABBs
} from '../map/deckA';

const SPEED = 4;
const PLAYER_RADIUS = 0.35;

/** Canvas-text label → plane texture laid on floor */
function TextLabel({ text, position = [0, 0.01, 0], width = 6, color = '#cfe7ff', outline = '#0d1117' }) {
    const { texture, aspect } = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 120px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 18;
        ctx.strokeStyle = outline;
        ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = color;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return { texture: tex, aspect: canvas.width / canvas.height };
    }, [text, color, outline]);
    const h = width / (aspect || 4);
    return (
        <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, h]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
    );
}

function SimpleAstronaut({ color = 'deepskyblue' }) {
    return (
        <group>
            <mesh position={[0, 0.6, 0]}>
                <cylinderGeometry args={[0.35, 0.35, 1.2, 16]} />
                <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, 1.35, 0]}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, 1.35, 0.32]}>
                <sphereGeometry args={[0.06, 12, 12]} />
                <meshStandardMaterial color="white" />
            </mesh>
        </group>
    );
}

function FloorAndWalls() {
    return (
        <group>
            {/* Base floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[FLOOR.w, FLOOR.d]} />
                <meshStandardMaterial color="#141a22" />
            </mesh>

            {/* Zones */}
            <mesh position={[OUTSIDE_AREA.x, 0.002, OUTSIDE_AREA.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[OUTSIDE_AREA.w, OUTSIDE_AREA.d]} />
                <meshStandardMaterial color="#0e1420" opacity={0.9} transparent />
            </mesh>
            <mesh position={[STATION_AREA.x, 0.003, STATION_AREA.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[STATION_AREA.w, STATION_AREA.d]} />
                <meshStandardMaterial color="#1b2431" opacity={0.95} transparent />
            </mesh>

            {/* Grid */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
                <planeGeometry args={[FLOOR.w, FLOOR.d, 20, 12]} />
                <meshBasicMaterial wireframe transparent opacity={0.12} />
            </mesh>

            {/* Walls */}
            {walls.map((w, i) => (
                <mesh key={i} position={[w.x, WALL_HEIGHT / 2, w.z]}>
                    <boxGeometry args={[w.w, WALL_HEIGHT, w.d]} />
                    <meshStandardMaterial color="#3b4a61" />
                </mesh>
            ))}

            {/* Labels */}
            <TextLabel text="Outside" position={[OUTSIDE_AREA.x, 0.01, OUTSIDE_AREA.z]} width={8} color="#9fb6ff" />
            {ROOMS.map(r => (
                <TextLabel key={r.key} text={r.name} position={[r.x, 0.01, r.z]} width={Math.min(r.w * 0.9, 8)} color="#d6eaff" />
            ))}
        </group>
    );
}

// Collision vs wall boxes
function resolveCollisions(next) {
    for (let pass = 0; pass < 2; pass++) {
        for (const b of wallAABBs) {
            const insideX = next.x > (b.minX - PLAYER_RADIUS) && next.x < (b.maxX + PLAYER_RADIUS);
            const insideZ = next.z > (b.minZ - PLAYER_RADIUS) && next.z < (b.maxZ + PLAYER_RADIUS);
            if (!(insideX && insideZ)) continue;

            const dxLeft = (next.x - (b.minX - PLAYER_RADIUS));
            const dxRight = ((b.maxX + PLAYER_RADIUS) - next.x);
            const dzTop = (next.z - (b.minZ - PLAYER_RADIUS));
            const dzBottom = ((b.maxZ + PLAYER_RADIUS) - next.z);

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

/** Local player controller + facing (yaw) + network sync */
function LocalMover() {
    const keys = useRef({});
    const [pos, setPos] = useState(() => getMyPos());
    const yawRef = useRef(0);
    const dragging = useRef(false);
    const lastX = useRef(0);

    // Input listeners (keyboard + right-mouse drag to rotate camera/yaw)
    useEffect(() => {
        const down = e => (keys.current[e.key.toLowerCase()] = true);
        const up = e => (keys.current[e.key.toLowerCase()] = false);
        const md = (e) => { if (e.button === 2) { dragging.current = true; lastX.current = e.clientX; } };
        const mu = (e) => { if (e.button === 2) dragging.current = false; };
        const mm = (e) => {
            if (!dragging.current) return;
            const dx = e.clientX - lastX.current;
            lastX.current = e.clientX;
            yawRef.current -= dx * 0.003; // sensitivity
        };
        const cm = (e) => { if (dragging.current) e.preventDefault(); }; // disable context menu while dragging
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('mousedown', md);
        window.addEventListener('mouseup', mu);
        window.addEventListener('mousemove', mm);
        window.addEventListener('contextmenu', cm);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('mousedown', md);
            window.removeEventListener('mouseup', mu);
            window.removeEventListener('mousemove', mm);
            window.removeEventListener('contextmenu', cm);
        };
    }, []);

    useFrame((_, dt) => {
        if (!dt) return;

        // Q/E rotate (in addition to mouse)
        if (keys.current['q']) yawRef.current += 1.5 * dt;
        if (keys.current['e']) yawRef.current -= 1.5 * dt;

        // Movement relative to yaw (W/S forward/back, A/D strafe)
        const forward = new THREE.Vector3(Math.sin(yawRef.current), 0, Math.cos(yawRef.current));
        const right = new THREE.Vector3(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));

        let move = new THREE.Vector3();
        if (keys.current['w']) move.add(forward);
        if (keys.current['s']) move.sub(forward);
        if (keys.current['d']) move.add(right);
        if (keys.current['a']) move.sub(right);
        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(SPEED * dt);
            const next = { x: pos.x + move.x, y: pos.y, z: pos.z + move.z };
            resolveCollisions(next);
            // keep within outer bounds
            const m = WALL_THICKNESS + PLAYER_RADIUS + 0.05;
            next.x = Math.max(-FLOOR.w / 2 + m, Math.min(FLOOR.w / 2 - m, next.x));
            next.z = Math.max(-FLOOR.d / 2 + m, Math.min(FLOOR.d / 2 - m, next.z));

            setPos(next);
            setMyPos(next.x, next.y, next.z);
            // Face movement direction (optional): blend towards camera-forward
            const targetYaw = Math.atan2(move.x, move.z);
            const blend = 0.25; // smoothing
            const a = yawRef.current, b = targetYaw;
            const shortest = Math.atan2(Math.sin(b - a), Math.cos(b - a));
            yawRef.current = a + shortest * blend;
        }

        // Broadcast yaw (unreliable is fine)
        myPlayer().setState('yaw', yawRef.current, false);
    });

    return null;
}

/** Third-person camera following the local player */
function ThirdPersonCamera() {
    const { camera } = useThree();
    const curPos = useRef(new THREE.Vector3(0, 5, 8));
    const lookAt = useRef(new THREE.Vector3());
    useFrame(() => {
        const p = myPlayer();
        const x = Number(p.getState('x') ?? 0);
        const y = Number(p.getState('y') ?? 0);
        const z = Number(p.getState('z') ?? 0);
        const yaw = Number(p.getState('yaw') ?? 0);

        const height = 3.0;      // camera height above player
        const distance = 6.0;    // camera distance behind player

        // behind vector (opposite of forward)
        const behind = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(distance);
        const desired = new THREE.Vector3(x, y + 1.2 + height, z).add(behind);

        // smooth camera
        curPos.current.lerp(desired, 0.12);
        camera.position.copy(curPos.current);

        // look at player chest
        lookAt.current.set(x, y + 1.2, z);
        camera.lookAt(lookAt.current);
    });
    return null;
}

function Players({ dead = [] }) {
    const players = usePlayersList(true);
    return (
        <>
            {players.map((p) => {
                if (dead.includes(p.id)) return null;
                const x = Number(p.getState('x') ?? 0);
                const y = Number(p.getState('y') ?? 0);
                const z = Number(p.getState('z') ?? 0);
                const yaw = Number(p.getState('yaw') ?? 0);
                const color = myPlayer().id === p.id ? '#ff6ec7' : '#68c7ff';
                return (
                    <group key={p.id} position={[x, y, z]} rotation={[0, yaw, 0]}>
                        <SimpleAstronaut color={color} />
                    </group>
                );
            })}
        </>
    );
}

export default function GameCanvas({ dead = [] }) {
    return (
        <Canvas camera={{ position: [0, 8, 10], fov: 50 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 10, 3]} intensity={1} />
            <FloorAndWalls />
            <Players dead={dead} />
            <LocalMover />
            <ThirdPersonCamera />
        </Canvas>
    );
}
