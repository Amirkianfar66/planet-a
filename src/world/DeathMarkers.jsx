// src/world/DeathMarkers.jsx
import React from "react";
import { usePlayersList } from "playroomkit";
import { useFrame } from "@react-three/fiber";

function Cross({ p, life }) {
    const s = 0.5 + 0.5 * (1 - life);
    return (
        <group position={p} scale={[s, s, s]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.35, 0.45, 24]} />
                <meshBasicMaterial color="#ff6b6b" transparent opacity={0.85 * life} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <boxGeometry args={[0.6, 0.06, 0.06]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={life} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.01, 0]}>
                <boxGeometry args={[0.6, 0.06, 0.06]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={life} />
            </mesh>
        </group>
    );
}

export default function DeathMarkers() {
    const players = usePlayersList(true);
    const [tick, setTick] = React.useState(0);

    useFrame(() => setTick(t => t + 1)); // keep life values fresh without heavy state

    const now = performance.now();
    const DURATION = 2000;

    return (
        <>
            {players.map(p => {
                if (!p?.getState?.("dead")) return null;
                const ts = Number(p.getState?.("deadTs") || Date.now());
                const px = Number(p.getState?.("x") || 0);
                const py = Number(p.getState?.("y") || 0);
                const pz = Number(p.getState?.("z") || 0);

                const t = Math.min(1, Math.max(0, (now - ts) / DURATION));
                const life = 1 - t;                // fade out
                const sink = -0.4 * t;             // sink slightly
                return <Cross key={`dead:${p.id}`} p={[px, py + sink, pz]} life={life} />;
            })}
        </>
    );
}
