// src/components/GameCanvas.jsx
import React from "react";
import { Canvas } from "@react-three/fiber";


export default function GameCanvas() {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 6, 10], fov: 50 }}
                gl={{ powerPreference: "high-performance" }}
            >
                {/* Background + lights */}
                <color attach="background" args={["#0b1220"]} />
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 3]} intensity={1} castShadow />

                {/* Simple floor */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[40, 30]} />
                    <meshStandardMaterial color="#141a22" />
                </mesh>

               
            </Canvas>
        </div>
    );
}
