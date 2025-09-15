import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import App from "./App.jsx";
import { GameStateProvider } from "./game/GameStateProvider";

// Editor-only bits
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MapEditorProvider, MapEditor3D, MapEditorUI } from "./dev/MapEditor";

const isEditor = new URLSearchParams(location.search).get("editor") === "1";

function EditorOnly() {
    return (
        <MapEditorProvider enabled={true}>
            <div style={{ position: "fixed", inset: 0 }}>
                <Canvas camera={{ position: [0, 18, 18], fov: 40 }}>
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[10, 15, 5]} intensity={1} />
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                        <planeGeometry args={[120, 120]} />
                        <meshBasicMaterial color="#0b0f14" />
                    </mesh>

                    <MapEditor3D />
                    <OrbitControls makeDefault enablePan enableRotate enableZoom />
                </Canvas>
            </div>
            <MapEditorUI />
        </MapEditorProvider>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(
    isEditor
        ? <EditorOnly />
        : (
            <GameStateProvider>
                <App />
            </GameStateProvider>
        )
);
