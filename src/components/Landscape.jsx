// src/world/Landscape.jsx
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FLOOR } from "../map/deckA"; // so the size matches your map

function useRadialGroundTexture({
    inner = "#1a202c",
    mid = "#202a38",
    outer = "#2b3442",
} = {}) {
    return useMemo(() => {
        const size = 1024;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const ctx = c.getContext("2d");

        const g = ctx.createRadialGradient(
            size / 2, size / 2, size * 0.05,
            size / 2, size / 2, size * 0.52
        );
        g.addColorStop(0.0, inner);
        g.addColorStop(0.5, mid);
        g.addColorStop(1.0, outer);

        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);

        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 8;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    }, [inner, mid, outer]);
}

export default function Landscape({
    // make it a bit larger than the station floor
    width = FLOOR.w * 1.8,
    depth = FLOOR.d * 1.8,
    // ring styling
    rings = 18,
    ringGap = 4.0,
    ringStartRadius = Math.max(FLOOR.w, FLOOR.d) * 0.45,
}) {
    const groundTex = useRadialGroundTexture({
        inner: "#161c28",
        mid: "#1d2431",
        outer: "#252e3c",
    });

    const groupRef = useRef();
    useFrame((_, dt) => {
        // tiny drift to avoid looking static
        if (groupRef.current) groupRef.current.rotation.y += dt * 0.02;
    });

    const ringMeshes = useMemo(() => {
        const arr = [];
        for (let i = 0; i < rings; i++) {
            const rInner = ringStartRadius + i * ringGap;
            const rOuter = rInner + 0.25; // thin band
            const opacity = Math.max(0, 0.4 - i * (0.35 / rings)); // fade out
            const geo = new THREE.RingGeometry(rInner, rOuter, 64);
            // orient UVs so the gradient looks clean
            geo.rotateX(-Math.PI / 2);

            const mat = new THREE.MeshBasicMaterial({
                color: "#6c7a91",
                transparent: true,
                opacity,
                depthWrite: false,
                toneMapped: false,
            });
            const mesh = new THREE.Mesh(geo, mat);
            // lift slightly to avoid z-fighting with ground
            mesh.position.y = 0.003 + i * 0.0001;
            arr.push(mesh);
        }
        return arr;
    }, [rings, ringGap, ringStartRadius]);

    return (
        <group ref={groupRef}>
            {/* Landscape ground (very slightly below to avoid z-fighting with your station planes) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
                <planeGeometry args={[width, depth, 1, 1]} />
                <meshStandardMaterial
                    map={groundTex}
                    roughness={1}
                    metalness={0}
                    toneMapped={true}
                />
            </mesh>

            {/* Concentric ring accents */}
            <group>
                {ringMeshes.map((m, i) => (
                    <primitive key={i} object={m} />
                ))}
            </group>
        </group>
    );
}
