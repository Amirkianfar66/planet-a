// src/dev/EditorScreen.jsx
import React from "react";
import { Canvas } from "@react-three/fiber";
import { MapEditorProvider, MapEditor3D, MapEditorUI } from "./MapEditor.jsx";

export default function EditorScreen() {
    return (
        <MapEditorProvider enabled>
            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 8, 12], fov: 50 }}>
                <color attach="background" args={["#0b1220"]} />
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 3]} intensity={1} />
                <MapEditor3D />
            </Canvas>
            <MapEditorUI />
        </MapEditorProvider>
    );
}
