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

/* ---------------- Role styling ------------------ */
/* Whole-suit colors by role */
const ROLE_STYLE = {
    'Engineer': { suit: '#FF8D3A', prop: 'wrench' },      // orange
    'Research': { suit: '#FFFFFF', prop: 'syringe' },     // white
    'Station Director': { suit: '#FF5A5A', prop: 'controller' },  // red
    'Officer': { suit: '#1E3A8A', prop: 'tablet' },      // dark blue
    'Guard': { suit: '#68C7FF', prop: 'gun' },         // sky blue
    'Food Supplier': { suit: '#FFC83D', prop: 'backpack' },    // yellow
};
const DEFAULT_STYLE = { suit: '#68C7FF', prop: 'tablet' };

/* --- tiny color utilities for readable panels/stripes/name tags --- */
function parseHex(hex) {
    const s = hex.replace('#', '');
    const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shadeHex(hex, amt = -40) {
    const { r, g, b } = parseHex(hex);
    const clamp = (v) => Math.min(255, Math.max(0, v + amt));
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return '#' + toHex(clamp(r)) + toHex(clamp(g)) + toHex(clamp(b));
}
function luminance({ r, g, b }) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function secondaryFromSuit(hex) {
    const lum = luminance(parseHex(hex));
    // If the suit is light (like white / yellow / sky), use a darker secondary; if dark, use a lighter secondary
    return lum > 170 ? shadeHex(hex, -70) : shadeHex(hex, +70);
}

/* ---------- Canvas-text floor label ----------- */
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

/* --------- Billboard (faces camera) ---------- */
function Billboard({ position = [0, 0, 0], children }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

/* --------- Name + role floating tag ---------- */
function NameTag({ name = 'Anon', role = 'Crew', accent = '#68c7ff', position = [0, 2.2, 0] }) {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(20,26,34,0.85)';
        const r = 26, w = canvas.width - 8, h = 120, x = 4, y = 36;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        ctx.font = '700 56px ui-sans-serif, system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(name, canvas.width / 2, 92);

        ctx.font = '500 40px ui-sans-serif, system-ui';
        ctx.fillStyle = accent;
        ctx.fillText(role, canvas.width / 2, 140);

        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(44, 44, 10, 0, Math.PI * 2); ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }, [name, role, accent]);

    return (
        <Billboard position={position}>
            <mesh>
                <planeGeometry args={[1.8, 0.7]} />
                <meshBasicMaterial map={texture} transparent />
            </mesh>
        </Billboard>
    );
}

/* -------------- 3D chibi astronaut (whole suit tinted) --------------- */
function Astronaut3D({ suit = '#68c7ff', prop = 'tablet', showName = true, name = 'Anon', role = 'Crew' }) {
    const white = '#ffffff';
    const dark = '#111318';
    const visor = '#0f1216';

    const secondary = useMemo(() => secondaryFromSuit(suit), [suit]);

    /* right-hand prop (simple shapes for performance) */
    const RightProp = () => {
        // Position near right hand
        const basePos = [0.6, 1.0, 0.18];

        switch (prop) {
            case 'wrench': // Engineer
                return (
                    <group position={[0.6, 1.0, 0.2]} rotation={[0, -Math.PI / 10, 0]}>
                        {/* handle */}
                        <mesh position={[0, -0.05, 0]}>
                            <cylinderGeometry args={[0.04, 0.04, 0.5, 12]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        {/* head (crescent-ish) */}
                        <mesh position={[0, 0.25, 0]}>
                            <boxGeometry args={[0.22, 0.12, 0.08]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        <mesh position={[0.08, 0.25, 0]}>
                            <boxGeometry args={[0.1, 0.18, 0.08]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                    </group>
                );
            case 'syringe': // Research
                return (
                    <group position={basePos} rotation={[0, -Math.PI / 18, 0]}>
                        {/* barrel */}
                        <mesh>
                            <cylinderGeometry args={[0.06, 0.06, 0.42, 12]} />
                            <meshStandardMaterial color={white} />
                        </mesh>
                        {/* blood */}
                        <mesh position={[0, 0.02, 0]}>
                            <cylinderGeometry args={[0.055, 0.055, 0.34, 12]} />
                            <meshStandardMaterial color={'#d62828'} />
                        </mesh>
                        {/* plunger */}
                        <mesh position={[0, 0.25, 0]}>
                            <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        {/* needle */}
                        <mesh position={[0, -0.24, 0]}>
                            <cylinderGeometry args={[0.01, 0.005, 0.18, 8]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                    </group>
                );
            case 'controller': // Station Director (remote/controller)
                return (
                    <group position={basePos}>
                        <mesh>
                            <boxGeometry args={[0.5, 0.24, 0.08]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        {/* screen / LEDs */}
                        <mesh position={[0, 0.02, 0.045]}>
                            <planeGeometry args={[0.38, 0.12]} />
                            <meshBasicMaterial color={white} />
                        </mesh>
                        <mesh position={[-0.16, -0.06, 0.045]}>
                            <planeGeometry args={[0.06, 0.06]} />
                            <meshBasicMaterial color={'#43D7C5'} />
                        </mesh>
                        <mesh position={[0.16, -0.06, 0.045]}>
                            <planeGeometry args={[0.06, 0.06]} />
                            <meshBasicMaterial color={'#FFC83D'} />
                        </mesh>
                    </group>
                );
            case 'tablet': // Officer
                return (
                    <group position={basePos}>
                        <mesh>
                            <boxGeometry args={[0.5, 0.35, 0.04]} />
                            <meshStandardMaterial color={'#dfe5ee'} />
                        </mesh>
                        <mesh position={[0, 0, 0.025]}>
                            <planeGeometry args={[0.42, 0.26]} />
                            <meshBasicMaterial color={secondary} />
                        </mesh>
                    </group>
                );
            case 'gun': // Guard (simple sci-fi pistol)
                return (
                    <group position={[0.6, 0.95, 0.18]} rotation={[0, -Math.PI / 10, 0]}>
                        <mesh>
                            <boxGeometry args={[0.34, 0.16, 0.12]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        <mesh position={[-0.08, -0.18, 0]}>
                            <boxGeometry args={[0.12, 0.24, 0.1]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        <mesh position={[0.12, 0, 0]}>
                            <boxGeometry args={[0.16, 0.06, 0.1]} />
                            <meshStandardMaterial color={shadeHex(secondary, -30)} />
                        </mesh>
                    </group>
                );
            case 'backpack': // Food Supplier (hand-carried pack)
                return (
                    <group position={[0.6, 0.9, 0.2]}>
                        <mesh>
                            <boxGeometry args={[0.55, 0.6, 0.35]} />
                            <meshStandardMaterial color={secondary} />
                        </mesh>
                        {/* top handle */}
                        <mesh position={[0, 0.35, 0]}>
                            <torusGeometry args={[0.16, 0.04, 8, 16]} />
                            <meshStandardMaterial color={shadeHex(secondary, -30)} />
                        </mesh>
                        {/* food emblem */}
                        <mesh position={[0, 0.06, 0.18]}>
                            <planeGeometry args={[0.24, 0.24]} />
                            <meshBasicMaterial color={'#F8FAFC'} />
                        </mesh>
                    </group>
                );
            default:
                return null;
        }
    };

    return (
        <group>
            {/* body (tinted) */}
            <mesh position={[0, 0.75, 0]}>
                <boxGeometry args={[0.9, 1.1, 0.45]} />
                <meshStandardMaterial color={suit} />
            </mesh>
            {/* belt / panel (secondary for contrast) */}
            <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[0.92, 0.12, 0.48]} />
                <meshStandardMaterial color={secondary} />
            </mesh>
            {/* legs (tinted) */}
            <mesh position={[-0.22, 0.2, 0]}>
                <boxGeometry args={[0.34, 0.4, 0.44]} />
                <meshStandardMaterial color={suit} />
            </mesh>
            <mesh position={[0.22, 0.2, 0]}>
                <boxGeometry args={[0.34, 0.4, 0.44]} />
                <meshStandardMaterial color={suit} />
            </mesh>
            {/* stripes (secondary) */}
            <mesh position={[-0.22, 0.3, 0.23]}>
                <boxGeometry args={[0.32, 0.04, 0.02]} />
                <meshStandardMaterial color={secondary} />
            </mesh>
            <mesh position={[0.22, 0.3, 0.23]}>
                <boxGeometry args={[0.32, 0.04, 0.02]} />
                <meshStandardMaterial color={secondary} />
            </mesh>

            {/* head (helmet tinted) */}
            <mesh position={[0, 1.45, 0]}>
                <boxGeometry args={[1.0, 0.7, 0.7]} />
                <meshStandardMaterial color={suit} />
            </mesh>
            {/* visor (dark) */}
            <mesh position={[0, 1.45, 0.36]}>
                <planeGeometry args={[0.8, 0.42]} />
                <meshBasicMaterial color={visor} />
            </mesh>
            {/* ear pods (secondary) */}
            <mesh position={[-0.56, 1.45, 0]}>
                <boxGeometry args={[0.18, 0.28, 0.28]} />
                <meshStandardMaterial color={secondary} />
            </mesh>
            <mesh position={[0.56, 1.45, 0]}>
                <boxGeometry args={[0.18, 0.28, 0.28]} />
                <meshStandardMaterial color={secondary} />
            </mesh>

            {/* arms (tinted) */}
            <mesh position={[-0.6, 0.95, 0]}>
                <boxGeometry args={[0.22, 0.36, 0.36]} />
                <meshStandardMaterial color={suit} />
            </mesh>
            <mesh position={[0.6, 0.95, 0]}>
                <boxGeometry args={[0.22, 0.36, 0.36]} />
                <meshStandardMaterial color={suit} />
            </mesh>

            {/* prop in right hand */}
            <RightProp />

            {/* name tag uses secondary for text accent */}
            {showName && <NameTag name={name} role={role} accent={secondary} position={[0, 2.25, 0]} />}
        </group>
    );
}

/* ---------------- Floor, zones, walls ---------------- */
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

/* ---------------- Collision vs walls ---------------- */
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

/* ---------------- Local controller + yaw sync ---------------- */
function LocalMover() {
    const keys = useRef({});
    const [pos, setPos] = useState(() => getMyPos());
    const yawRef = useRef(0);
    const dragging = useRef(false);
    const lastX = useRef(0);

    useEffect(() => {
        const down = e => (keys.current[e.key.toLowerCase()] = true);
        const up = e => (keys.current[e.key.toLowerCase()] = false);
        const md = (e) => { if (e.button === 2) { dragging.current = true; lastX.current = e.clientX; } };
        const mu = (e) => { if (e.button === 2) dragging.current = false; };
        const mm = (e) => {
            if (!dragging.current) return;
            const dx = e.clientX - lastX.current;
            lastX.current = e.clientX;
            yawRef.current -= dx * 0.003;
        };
        const cm = (e) => { if (dragging.current) e.preventDefault(); };
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

        if (keys.current['q']) yawRef.current += 1.5 * dt;
        if (keys.current['e']) yawRef.current -= 1.5 * dt;

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
            const m = WALL_THICKNESS + PLAYER_RADIUS + 0.05;
            next.x = Math.max(-FLOOR.w / 2 + m, Math.min(FLOOR.w / 2 - m, next.x));
            next.z = Math.max(-FLOOR.d / 2 + m, Math.min(FLOOR.d / 2 - m, next.z));

            setPos(next);
            setMyPos(next.x, next.y, next.z);

            const targetYaw = Math.atan2(move.x, move.z);
            const a = yawRef.current, b = targetYaw;
            const shortest = Math.atan2(Math.sin(b - a), Math.cos(b - a));
            yawRef.current = a + shortest * 0.25;
        }

        myPlayer().setState('yaw', yawRef.current, false);
    });

    return null;
}

/* ---------------- Third-person camera ---------------- */
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

        const height = 3.0;
        const distance = 6.0;

        const behind = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(distance);
        const desired = new THREE.Vector3(x, y + 1.2 + height, z).add(behind);

        curPos.current.lerp(desired, 0.12);
        camera.position.copy(curPos.current);

        lookAt.current.set(x, y + 1.2, z);
        camera.lookAt(lookAt.current);
    });
    return null;
}

/* ---------------- Players renderer ---------------- */
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

                const profileName = p.getProfile().name || ('Player ' + p.id.slice(0, 4));
                const role = String(p.getState('role') || 'Crew');
                const { suit, prop } = ROLE_STYLE[role] || DEFAULT_STYLE;

                return (
                    <group key={p.id} position={[x, y, z]} rotation={[0, yaw, 0]}>
                        <Astronaut3D
                            suit={suit}
                            prop={prop}
                            name={profileName}
                            role={role}
                            showName={true}
                        />
                    </group>
                );
            })}
        </>
    );
}

/* ---------------- Root canvas ---------------- */
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
