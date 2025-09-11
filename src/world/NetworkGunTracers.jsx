import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { usePlayersList } from "playroomkit";

function Tracer({ a, b, life }) {
    const { pos, quat, len } = useMemo(() => {
        const A = new THREE.Vector3(...a);
        const B = new THREE.Vector3(...b);
        const mid = A.clone().add(B).multiplyScalar(0.5);
        const dir = B.clone().sub(A);
        const length = Math.max(0.0001, dir.length());
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        return { pos: mid.toArray(), quat: q, len: length };
    }, [a, b]);

    const width = 0.04; // thickness
    const opacity = Math.max(0.15, life); // fade a bit

    return (
        <mesh position={pos} quaternion={quat}>
            <cylinderGeometry args={[width, width, len, 8, 1, true]} />
            <meshBasicMaterial
                transparent
                opacity={opacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

function ImpactFlash({ p, life }) {
    const s = 0.1 + 0.25 * (1 - life);
    return (
        <mesh position={p} scale={[s, s, s]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
                transparent
                opacity={life}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

export default function NetworkGunTracers() {
    const players = usePlayersList(true);
    const [segs, setSegs] = useState([]); // {id,a,b,until}
    const seen = useRef(new Map());
    const DURATION = 140; // ms on screen

    // poll players' shotFxId at a light rate
    useEffect(() => {
        const iv = setInterval(() => {
            const now = performance.now();
            const additions = [];
            for (const p of players) {
                const fxId = Number(p.getState?.("shotFxId") || 0);
                if (!fxId) continue;
                const last = seen.current.get(p.id) || 0;
                if (fxId !== last) {
                    const a = p.getState?.("shotFxA");
                    const b = p.getState?.("shotFxB");
                    if (Array.isArray(a) && Array.isArray(b)) {
                        additions.push({ id: `${p.id}:${fxId}`, a, b, until: now + DURATION });
                    }
                    seen.current.set(p.id, fxId);
                }
            }
            if (additions.length) setSegs(prev => [...prev, ...additions].slice(-64));
        }, 80);
        return () => clearInterval(iv);
    }, [players]);

    // prune expired and force a light re-render
    useFrame(() => {
        const now = performance.now();
        setSegs(prev => prev.filter(s => s.until > now));
    });

    const now = performance.now();
    return (
        <>
            {segs.map(s => {
                const life = Math.max(0, (s.until - now) / DURATION);
                return (
                    <React.Fragment key={s.id}>
                        <Tracer a={s.a} b={s.b} life={life} />
                        <ImpactFlash p={s.b} life={life} />
                    </React.Fragment>
                );
            })}
        </>
    );
}
