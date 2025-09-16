// src/main.jsx (or src/index.jsx)
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import App from "./App.jsx";
import { GameStateProvider } from "./game/GameStateProvider";

// Editor-only bits
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MapEditorProvider, MapEditor3D, MapEditorUI } from "./dev/MapEditor";
import Landscape from "./dev/Landscape"; // ⬅️ add this

const isEditor = new URLSearchParams(location.search).get("editor") === "1";

function EditorOnly() {
    return (
        <MapEditorProvider enabled={true}>
            <div style={{ position: "fixed", inset: 0 }}>
                <Canvas camera={{ position: [0, 18, 18], fov: 40 }}>
                    {/* background instead of a big opaque plane */}
                    <color attach="background" args={["#0b0f14"]} />

                    <ambientLight intensity={0.6} />
                    <directionalLight position={[10, 15, 5]} intensity={1} castShadow />

                    {/* 🌄 Mars-like landscape (lives slightly below y=0, ignores raycasts) */}
                    <Suspense fallback={null}>
                        <Landscape
                            size={900}
                            segments={256}
                            heightScale={5}
                            texScale={10}
                            albedoUrl="/textures/mars/mars_albedo.jpg"   // put files in public/textures/mars/
                            heightMapUrl="/textures/mars/height.png"     // optional; remove to use procedural dunes
                            colorLow="#9a4c2f"
                            colorHigh="#d2a67e"
                            fadeEdge={1.2}
                            animate={false}
                        />
                    </Suspense>

                    {/* your editor (includes its own invisible capture plane at y=0) */}
                    <MapEditor3D />
                    <OrbitControls makeDefault enablePan enableRotate enableZoom />
                </Canvas>
            </div>
            <MapEditorUI />
        </MapEditorProvider>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(
    isEditor ? (
        <EditorOnly />
    ) : (
        <GameStateProvider>
            <App />
        </GameStateProvider>
    )
);
