// src/components/GameCanvas.jsx
import { Canvas, useFrame } from '@react-three/fiber';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { myPlayer, usePlayersList } from 'playroomkit';
import { getMyPos, setMyPos } from '../network/playroom';
import { FLOOR, WALL_THICKNESS, WALL_HEIGHT, walls, wallAABBs } from '../map/deckA';

const SPEED = 4;           // m/s
const PLAYER_RADIUS = 0.35;

function SimpleAstronaut({ color = 'deepskyblue' }) {
  // Body (cylinder) + head (sphere)
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
      {/* Facing indicator (small nose) */}
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
      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR.w, FLOOR.d]} />
        <meshStandardMaterial color="#1a1f29" />
      </mesh>

      {/* Room hints (light grid lines) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <planeGeometry args={[FLOOR.w, FLOOR.d, 18, 12]} />
        <meshBasicMaterial wireframe transparent opacity={0.15} />
      </mesh>

      {/* Walls */}
      {walls.map((w, i) => (
        <mesh key={i} position={[w.x, WALL_HEIGHT / 2, w.z]}>
          <boxGeometry args={[w.w, WALL_HEIGHT, w.d]} />
          <meshStandardMaterial color="#3b4a61" />
        </mesh>
      ))}
    </group>
  );
}

// Simple AABB collision resolve against wall boxes
function resolveCollisions(next) {
  // We'll run two passes for corners
  for (let pass = 0; pass < 2; pass++) {
    for (const b of wallAABBs) {
      const insideX = next.x > (b.minX - PLAYER_RADIUS) && next.x < (b.maxX + PLAYER_RADIUS);
      const insideZ = next.z > (b.minZ - PLAYER_RADIUS) && next.z < (b.maxZ + PLAYER_RADIUS);
      if (!(insideX && insideZ)) continue;

      // Compute overlap on each axis
      const dxLeft   = (next.x - (b.minX - PLAYER_RADIUS));
      const dxRight  = ((b.maxX + PLAYER_RADIUS) - next.x);
      const dzTop    = (next.z - (b.minZ - PLAYER_RADIUS));
      const dzBottom = ((b.maxZ + PLAYER_RADIUS) - next.z);

      // Choose the shallowest axis to push out
      const minXPen = Math.min(dxLeft, dxRight);
      const minZPen = Math.min(dzTop, dzBottom);
      if (minXPen < minZPen) {
        // push along X
        if (dxLeft < dxRight) next.x = (b.minX - PLAYER_RADIUS);
        else                   next.x = (b.maxX + PLAYER_RADIUS);
      } else {
        // push along Z
        if (dzTop < dzBottom) next.z = (b.minZ - PLAYER_RADIUS);
        else                  next.z = (b.maxZ + PLAYER_RADIUS);
      }
    }
  }
  return next;
}

function LocalMover() {
  const keys = useRef({});
  const [pos, setPos] = useState(() => getMyPos());
  const yawRef = useRef(0); // radians

  useEffect(() => {
    const down = e => (keys.current[e.key.toLowerCase()] = true);
    const up   = e => (keys.current[e.key.toLowerCase()] = false);
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

      // Rotate to face movement direction
      yawRef.current = Math.atan2(nx, nz); // y-rotation (radians)
    }

    // Wall collisions
    next = resolveCollisions(next);

    // Keep inside floor bounds (little margin so we don't clip outer wall)
    const m = WALL_THICKNESS + PLAYER_RADIUS + 0.05;
    next.x = Math.max(-FLOOR.w / 2 + m, Math.min(FLOOR.w / 2 - m, next.x));
    next.z = Math.max(-FLOOR.d / 2 + m, Math.min(FLOOR.d / 2 - m, next.z));

    // Commit locally + sync
    if (next.x !== pos.x || next.z !== pos.z) {
      setPos(next);
      setMyPos(next.x, next.y, next.z);
      // send yaw (unreliable is fine)
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
