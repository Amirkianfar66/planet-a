import React, { useEffect, useRef, useState } from "react";
import { Line } from "@react-three/drei";
import { myPlayer } from "playroomkit";

export default function LocalGunTracer() {
    const [segments, setSegments] = useState([]); // {a:[x,y,z],b:[x,y,z], until:number}[]
    const meRef = useRef(null);

    useEffect(() => { meRef.current = myPlayer(); }, []);

    // listen to local key (same as ability key) just to draw tracer
    useEffect(() => {
        const onKey = (e) => {
            if (e.code !== 'KeyF') return;
            const me = meRef.current;
            const x = Number(me?.getState?.('x') || 0);
            const z = Number(me?.getState?.('z') || 0);
            const ry = Number(me?.getState?.('ry') || me?.getState?.('yaw') || 0);
            const dx = Math.sin(ry), dz = Math.cos(ry);
            const a = [x, 1.2, z];
            const b = [x + dx * 6, 1.2, z + dz * 6];
            const until = performance.now() + 120;
            setSegments(s => [...s, { a, b, until }]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        let raf;
        const tick = () => {
            const now = performance.now();
            setSegments(segs => segs.filter(s => s.until > now));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <>
            {segments.map((s, i) => (
                <Line key={i} points={[s.a, s.b]} lineWidth={2} opacity={0.9} transparent />
            ))}
        </>
    );
}
