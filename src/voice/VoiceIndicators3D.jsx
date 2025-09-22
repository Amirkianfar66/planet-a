// src/voice/VoiceIndicators3D.jsx
import React, { useMemo } from "react";
import { usePlayersList } from "playroomkit";
import { Billboard, Text } from "@react-three/drei";

// Height above head where the icon floats
const HEAD_Y = 2.1;

function TalkIcon({ pos = [0, 0, 0], label = "🔊" }) {
    // subtle pulsing scale
    const t = performance.now() / 1000;
    const s = 1 + 0.12 * Math.sin(t * 8);
    return (
        <Billboard position={pos} follow={true} lockX={false} lockY={false} lockZ={false}>
            <Text
                fontSize={0.36}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="black"
                scale={[s, s, s]}
            >
                {label}
            </Text>
        </Billboard>
    );
}

export default function VoiceIndicators3D() {
    const players = usePlayersList(true); // includes me; we’ll show for everyone

    const items = useMemo(() => {
        return players.map((p) => {
            const talking = Number(p?.getState?.("isTalking") || 0) > 0;
            if (!talking) return null;
            const x = Number(p?.getState?.("x") || 0);
            const z = Number(p?.getState?.("z") || 0);
            return <TalkIcon key={p.id} pos={[x, HEAD_Y, z]} />;
        }).filter(Boolean);
    }, [players]);

    return <group>{items}</group>;
}
