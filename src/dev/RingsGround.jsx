import * as THREE from "three";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Animated ring scan on a ground plane (inspired by r3f plane-rings example).
 * Props:
 *  - size: plane size in meters (square)
 *  - speed: ring scroll speed
 *  - density: rings per unit distance
 *  - fade: alpha falloff to the edges
 *  - colorA / colorB: inner/outer color (hex or css)
 */
export default function RingsGround({
    size = 300,
    speed = 0.25,
    density = 40.0,
    fade = 1.2,
    colorA = "#3aa0ff",
    colorB = "#0b1220",
    opacity = 0.65,
}) {
    const matRef = useRef();

    const uniforms = useMemo(
        () => ({
            uTime: { value: 0 },
            uSpeed: { value: speed },
            uDensity: { value: density },
            uFade: { value: fade },
            uColorA: { value: new THREE.Color(colorA) },
            uColorB: { value: new THREE.Color(colorB) },
            uOpacity: { value: opacity },
        }),
        [speed, density, fade, colorA, colorB, opacity]
    );

    useFrame((_, dt) => {
        if (matRef.current) {
            matRef.current.uniforms.uTime.value += dt;
        }
    });

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <planeGeometry args={[size, size, 1, 1]} />
            <shaderMaterial
                ref={matRef}
                transparent
                depthWrite={false}
                uniforms={uniforms}
                vertexShader={/* glsl */`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
                fragmentShader={/* glsl */`
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uSpeed;
          uniform float uDensity;
          uniform float uFade;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform float uOpacity;

          // simple ring pattern using polar distance
          void main() {
            // remap uv to -1..1 with center at 0,0
            vec2 p = vUv * 2.0 - 1.0;
            float dist = length(p);                 // 0 at center, ~1.414 at corners

            // scroll rings over time by subtracting time from distance
            float bands = sin((dist - uTime * uSpeed) * uDensity);

            // thin crisp lines
            float ring = smoothstep(0.02, 0.0, abs(bands));

            // fade to edges
            float falloff = smoothstep(1.2, 0.2, dist) * uFade;

            // color mix by distance for subtle gradient
            vec3 col = mix(uColorA, uColorB, clamp(dist, 0.0, 1.0));

            float alpha = ring * falloff * uOpacity;
            gl_FragColor = vec4(col, alpha);
          }
        `}
            />
        </mesh>
    );
}
