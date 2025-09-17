// src/dev/SlidingDoorBasic.jsx
import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";

// Minimal “sci-fi” sliding door
export function SlidingDoor({
    width = 1.8,
    height = 2.1,
    thickness = 0.06,
    panels = 2,
    open = 0,           // 0..1
    colorPanel = "#c9d6f0",
    colorFrame = "#5e748f",
    frameDepth = 0.08,
    trackHeight = 0.06,
}) {
    const gL = useRef(), gR = useRef(), gOpen = useRef({ v: open });

    // damp movement
    useFrame((_, dt) => {
        gOpen.current.v += (open - gOpen.current.v) * Math.min(1, dt * 10);
        const curr = gOpen.current.v;

        const half = width / 2;
        const panelW = panels === 2 ? half : width;

        const leftX = -panelW * curr;
        const rightX = panelW * curr;

        if (gL.current) gL.current.position.set(leftX, 0, 0);
        if (gR.current) gR.current.position.set(panels === 2 ? rightX : 0, 0, 0);
    });

    return (
        <group>
            {/* header + sill */}
            <mesh position={[0, height + trackHeight / 2, 0]}>
                <boxGeometry args={[width + 0.04, trackHeight, frameDepth]} />
                <meshStandardMaterial color={colorFrame} roughness={0.9} metalness={0.1} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[width + 0.02, 0.04, frameDepth]} />
                <meshStandardMaterial color={colorFrame} roughness={0.9} metalness={0.1} />
            </mesh>

            {/* sliding panels */}
            <group position={[0, height / 2, 0]} ref={gL}>
                <mesh>
                    <boxGeometry args={[panels === 2 ? width / 2 : width, height, thickness]} />
                    <meshStandardMaterial color={colorPanel} metalness={0.15} roughness={0.6} />
                </mesh>
            </group>

            {panels === 2 && (
                <group position={[0, height / 2, 0]} ref={gR}>
                    <mesh>
                        <boxGeometry args={[width / 2, height, thickness]} />
                        <meshStandardMaterial color={colorPanel} metalness={0.15} roughness={0.6} />
                    </mesh>
                </group>
            )}
        </group>
    );
}
