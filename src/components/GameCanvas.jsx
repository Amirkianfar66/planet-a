import { Canvas, useFrame } from '@react-three/fiber';
import React, { useEffect, useRef, useState } from 'react';
import { myPlayer, usePlayersList } from 'playroomkit';
import { getMyPos, setMyPos } from '../network/playroom';

const SPEED = 4;

function LocalMover() {
  const keys = useRef({});
  const [pos, setPos] = useState(() => getMyPos());

  useEffect(() => {
    const down = e => (keys.current[e.key.toLowerCase()] = true);
    const up   = e => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useFrame((_, dt) => {
    if (!dt) return;
    const d = { x: 0, z: 0 };
    if (keys.current['w']) d.z -= 1;
    if (keys.current['s']) d.z += 1;
    if (keys.current['a']) d.x -= 1;
    if (keys.current['d']) d.x += 1;
    if (d.x || d.z) {
      const len = Math.hypot(d.x, d.z) || 1;
      const nx = d.x / len, nz = d.z / len;
      const next = { x: pos.x + nx * SPEED * dt, y: pos.y, z: pos.z + nz * SPEED * dt };
      setPos(next);
      setMyPos(next.x, next.y, next.z);
    }
  });
  return null;
}

function Players({ dead = [] }) {
  const players = usePlayersList(true);
  return (
    <>
      {players.map(p => {
        if (dead.includes(p.id)) return null;
        const x = Number(p.getState('x') ?? 0);
        const y = Number(p.getState('y') ?? 0);
        const z = Number(p.getState('z') ?? 0);
        const color = myPlayer().id === p.id ? 'hotpink' : 'deepskyblue';
        return (
          <mesh key={p.id} position={[x, y, z]}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
    </>
  );
}

export default function GameCanvas({ dead = [] }) {
  return (
    <Canvas camera={{ position: [6, 6, 6], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 3]} intensity={1} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <Players dead={dead} />
      <LocalMover />
    </Canvas>
  );
}
