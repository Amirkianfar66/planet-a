// src/dev/ImageUnderlay.jsx
import * as THREE from "three";
import React, { useEffect, useMemo, useRef, useState } from "react";

export default function ImageUnderlay({
    url = "/refs/plan.png",
    scale = 0.01,   // world units per pixel
    x = 0,
    z = 0,
    opacity = 0.6,
    tint = "#ffffff",
}) {
    const meshRef = useRef();
    const [size, setSize] = useState({ w: 0, h: 0 });

    const tex = useMemo(() => {
        if (!url) return null;
        const loader = new THREE.TextureLoader();
        const t = loader.load(
            url,
            (tLoaded) => {
                const img = tLoaded.image;
                if (img && img.width && img.height) {
                    setSize({ w: img.width, h: img.height });
                }
            },
            undefined,
            (err) => {
                console.error("[ImageUnderlay] failed to load:", url, err);
            }
        );
        // color space & sampling
        // (r139+) colorSpace is preferred, fallback to encoding if needed
        if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
        else t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 8;
        t.needsUpdate = true;
        return t;
    }, [url]);

    const geomArgs = useMemo(() => {
        const w = Math.max(1, size.w) * scale;
        const h = Math.max(1, size.h) * scale;
        return [w, h];
    }, [size.w, size.h, scale]);

    // keep this very slightly above y=0 to avoid z-fighting with grid
    const y = 0.001;

    return (
        <group position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh ref={meshRef} renderOrder={-10}>
                <planeGeometry args={geomArgs} />
                <meshBasicMaterial
                    map={tex || null}
                    color={tint}
                    transparent
                    opacity={opacity}
                    depthWrite={false}   // don't occlude other things
                    depthTest={false}    // draw on top so you can see it
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
}
