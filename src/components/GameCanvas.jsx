// src/components/GameCanvas.jsx
import { Canvas, useFrame } from '@react-three/fiber';
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
        // background stays transparent
        ctx.font = 'bold 120px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // outline
        ctx.lineWidth = 18;
        ctx.strokeStyle = outline;
        ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
        // fill
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

            {/* Zone tints */}
            <mesh position={[OUTSIDE_AREA.x, 0.002, OUTSIDE_AREA.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[OUTSIDE_AREA.w, OUTSIDE_AREA.d]} />
                <meshStandardMaterial color="#0e1420" opacity={0.9} transparent />
            </mesh>
            <mesh position={[STATION_AREA.x, 0.003, STATION_AREA.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[STATION_AREA.w, STATION_AREA.d]} />
                <meshStandardMaterial color="#1b2431" opacity={0.95} transparent />
            </mesh>

            {/* Subtle grid */}
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

// Collision against wall AABBs
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

function LocalMover() {
    const keys = useRef({});
    const [pos, setPos] = useState(() => getMyPos());
    const yawRef = useRef(0);

    useEffect(() => {
        const down = e => (keys.current[e.key.toLowerCase()] = true);
        const up = e => (keys.current[e.key.toLowerCase()] = false);
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);

    useFrame((_, dt) => {
        if (!dt) return;
        const dir = { x: 0, z: 0 };
        if (keys.current['w']) dir.z -= 1;
        if (keys.current['s']) dir.z += 1;
        if (keys.current['a']) dir.x -= 1;
        if (keys.current['d']) dir.x += 1;

        let next = { ...pos };
        if (dir.x || dir.z) {
            const len = Math.hypot(dir.x, dir.z) || 1;
            const nx = dir.x / len, nz = dir.z / len;
            next.x += nx * SPEED * dt;
            next.z += nz * SPEED * dt;
            yawRef.current = Math.atan2(nx, nz);
        }

        next = resolveCollisions(next);

        // Keep inside outer bounds (small margin from walls)
        const m = WALL_THICKNESS + PLAYER_RADIUS + 0.05;
        next.x = Math.max(-FLOOR.w / 2 + m, Math.min(FLOOR.w / 2 - m, next.x));
        next.z = Math.max(-FLOOR.d / 2 + m, Math.min(FLOOR.d / 2 - m, next.z));

        if (next.x !== pos.x || next.z !== pos.z) {
            setPos(next);
            setMyPos(next.x, next.y, next.z);
            myPlayer().setState('yaw', yawRef.current, false);
        }
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
        <Canvas camera={{ position: [0, 10, 12], fov: 50 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 10, 3]} intensity={1} />
            <FloorAndWalls />
            <Players dead={dead} />
            <LocalMover />
        </Canvas>
    );
}
