import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MapEditorProvider, MapEditor3D, MapEditorUI } from "../dev/MapEditor";

export default function MapEditorPage() {
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
