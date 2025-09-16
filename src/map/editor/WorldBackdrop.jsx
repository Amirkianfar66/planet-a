import React, { useMemo, useRef, useState, useEffect } from "react";
import { useGLTF, TransformControls, Html } from "@react-three/drei";
import * as THREE from "three";

const LS_KEY = "editor_glb_transform_v1";
const DEFAULT = { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };

function toFixed(v, n = 3) {
    return Array.isArray(v) ? v.map((x) => +(+x).toFixed(n)) : +(+v).toFixed(n);
}

export default function WorldBackdrop({
    url = "/models/world.glb",
    show = true,
    colorize = false,       // set true if you want a flat tint to check overlaps
}) {
    const { scene } = useGLTF(url);
    const cloned = useMemo(() => scene.clone(true), [scene]);

    // persisted transform
    const [t, setT] = useState(() => {
        try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(LS_KEY)) || {}) }; }
        catch { return DEFAULT; }
    });
    useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(toFixedAll(t))); }, [t]);

    // control mode (translate/rotate/scale)
    const [mode, setMode] = useState("translate");

    const groupRef = useRef();

    // optional tint to make it clear it's just a backdrop in editor
    useEffect(() => {
        if (!colorize) return;
        cloned.traverse((o) => {
            if (o.isMesh) {
                const mat = o.material;
                // keep original material but dim it a bit
                o.material = mat.clone();
                o.material.color = new THREE.Color("#9aa3ad");
                o.material.roughness = 1.0;
                o.material.metalness = 0.0;
                o.material.opacity = 0.7;
                o.material.transparent = true;
            }
        });
    }, [cloned, colorize]);

    const onObjectChange = () => {
        const g = groupRef.current;
        if (!g) return;
        setT({
            position: [g.position.x, g.position.y, g.position.z],
            rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
            scale: g.scale.x, // uniform scale via TransformControls
        });
    };

    if (!show) return null;

    const nice = toFixedAll(t);
    const snippet =
        `<WorldGLB url="/models/world.glb"\n` +
        `  position={[${nice.position.join(", ")}]}\n` +
        `  rotation={[${nice.rotation.join(", ")}]}\n` +
        `  scale={${nice.scale}} />`;

    return (
        <>
            {/* Gizmo + model */}
            <TransformControls mode={mode} onObjectChange={onObjectChange}>
                <group
                    ref={groupRef}
                    position={t.position}
                    rotation={t.rotation}
                    scale={t.scale}
                >
                    <primitive object={cloned} />
                </group>
            </TransformControls>

            {/* Tiny overlay with buttons + copy snippet */}
            <Html position={[0, 0, 0]} transform={false} wrapperClass="glb-overlay" zIndexRange={[10, 0]}>
                <div style={panelStyle}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>GLB Backdrop</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button onClick={() => setMode("translate")}>Move</button>
                        <button onClick={() => setMode("rotate")}>Rotate</button>
                        <button onClick={() => setMode("scale")}>Scale</button>
                    </div>
                    <div style={rowStyle}>pos: [{nice.position.join(", ")}]</div>
                    <div style={rowStyle}>rot: [{nice.rotation.join(", ")}]</div>
                    <div style={rowStyle}>scale: {nice.scale}</div>
                    <textarea
                        readOnly
                        value={snippet}
                        onFocus={(e) => e.target.select()}
                        style={{ width: 300, height: 94, fontFamily: "monospace", fontSize: 12, marginTop: 8 }}
                    />
                </div>
            </Html>
        </>
    );
}

function toFixedAll(t) {
    return {
        position: toFixed(t.position),
        rotation: toFixed(t.rotation),
        scale: toFixed(t.scale),
    };
}

const panelStyle = {
    position: "absolute",
    top: 12,
    left: 12,
    background: "rgba(20,22,28,0.85)",
    color: "#e6eefc",
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(4px)",
};

const rowStyle = { fontFamily: "monospace", fontSize: 12, opacity: 0.9, marginTop: 2 };

// Preload asset for snappier editor load
useGLTF.preload("/models/world.glb");
