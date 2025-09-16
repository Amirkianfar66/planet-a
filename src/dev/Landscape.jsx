// src/dev/Landscape.jsx
import * as THREE from "three";
import React, { useMemo, useRef } from "react";
import { useFrame, extend } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";

/**
 * Landscape (terrain) for your editor scene.
 * - Uses a heightmap if provided, otherwise procedural noise.
 * - Textured with a tiling albedo map.
 * - Lives slightly below y=0 and ignores raycasting so it won't block the editor's drag plane.
 *
 * Props:
 *   size        : side length of the square terrain (meters)
 *   segments    : grid resolution (more = smoother, heavier)
 *   heightScale : vertical exaggeration (meters)
 *   texScale    : texture tiling (repeats across surface)
 *   albedoUrl   : URL to albedo/diffuse texture (e.g. "/textures/mars/mars_albedo.jpg")
 *   heightMapUrl: URL to grayscale heightmap image (optional)
 *   colorLow    : base color for low elevations (multiplies with albedo)
 *   colorHigh   : base color for high elevations (multiplies with albedo)
 *   fadeEdge    : soften alpha towards edges (0..2), 0 disables
 */
export default function Landscape({
    size = 800,
    segments = 256,
    heightScale = 4.0,
    texScale = 12.0,
    albedoUrl = "/textures/mars/mars_albedo.jpg",
    heightMapUrl = null,
    colorLow = "#9a4c2f",   // rusty sand
    colorHigh = "#caa07e",  // dustier highlands
    fadeEdge = 1.0,
    animate = false,        // tiny heat shimmer if true
}) {
    const matRef = useRef();

    // TEXTURES
    const albedo = useTexture(albedoUrl || null);
    useMemo(() => {
        if (albedo) {
            albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
            albedo.repeat.set(texScale, texScale);
            albedo.anisotropy = 8;
            albedo.needsUpdate = true;
        }
    }, [albedo, texScale]);

    const heightMap = useTexture(heightMapUrl || null);
    useMemo(() => {
        if (heightMap) {
            heightMap.wrapS = heightMap.wrapT = THREE.ClampToEdgeWrapping;
            heightMap.needsUpdate = true;
        }
    }, [heightMap]);

    const uniforms = useMemo(
        () => ({
            uTime: { value: 0 },
            uHeightScale: { value: heightScale },
            uTexScale: { value: texScale },
            uColorLow: { value: new THREE.Color(colorLow) },
            uColorHigh: { value: new THREE.Color(colorHigh) },
            uFadeEdge: { value: fadeEdge },
            uAlbedo: { value: albedo || null },
            uHeightMap: { value: heightMap || null },
        }),
        [heightScale, texScale, colorLow, colorHigh, fadeEdge, albedo, heightMap]
    );

    useFrame((_, dt) => {
        if (!animate) return;
        if (matRef.current) {
            matRef.current.uniforms.uTime.value += dt;
        }
    });

    return (
        <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.12, 0]}
            raycast={null /* 👉 don't block editor picking */}
            receiveShadow
        >
            <planeGeometry args={[size, size, segments, segments]} />
            <shaderMaterial
                ref={matRef}
                transparent
                depthWrite={true}
                side={THREE.FrontSide}
                uniforms={uniforms}
                vertexShader={/* glsl */`
          varying vec2 vUv;
          varying float vHeight;
          uniform float uHeightScale;
          uniform sampler2D uHeightMap;
          uniform float uTime;

          // Simple 2D noise (value noise-ish). Kept short for clarity.
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
          float noise(vec2 p){
            vec2 i=floor(p), f=fract(p);
            float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
            vec2 u=f*f*(3.0-2.0*f);
            return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
          }

          void main(){
            vUv = uv;
            float h = 0.0;

            if (uHeightMap != sampler2D(0)) {
              // sample heightmap if given
              h = texture2D(uHeightMap, uv).r;
            } else {
              // fallback: procedural dunes
              vec2 p = uv * 40.0;
              h = noise(p) * 0.6 + noise(p*2.0) * 0.25 + noise(p*4.0) * 0.15;
              // optional tiny shimmer
              h += 0.02 * sin(uv.x*30.0 + uTime*0.8) * sin(uv.y*30.0 + uTime*0.7);
            }

            vHeight = h;
            vec3 displaced = position + normal * (h * uHeightScale);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
          }
        `}
                fragmentShader={/* glsl */`
          precision highp float;
          varying vec2 vUv;
          varying float vHeight;

          uniform sampler2D uAlbedo;
          uniform float uTexScale;
          uniform vec3 uColorLow;
          uniform vec3 uColorHigh;
          uniform float uFadeEdge;

          void main(){
            // tile albedo
            vec3 base = vec3(1.0);
            if (uAlbedo != sampler2D(0)) {
              base = texture2D(uAlbedo, vUv * uTexScale).rgb;
            }

            // simple elevation tint
            float t = smoothstep(0.15, 0.85, vHeight);
            vec3 tint = mix(uColorLow, uColorHigh, t);
            vec3 col = base * tint;

            // gentle edge fade so the square blends out
            float distCenter = length(vUv * 2.0 - 1.0); // 0..~1.414
            float fade = 1.0;
            if (uFadeEdge > 0.0) {
              fade = smoothstep(1.4, 0.8, distCenter); // soft toward corners
              fade = pow(fade, uFadeEdge);
            }

            gl_FragColor = vec4(col, fade);
            if (gl_FragColor.a < 0.01) discard;
          }
        `}
            />
        </mesh>
    );
}
