import React, { useEffect, useMemo, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** ----------------------------------------------------------
 *  SimplePickupDemo
 *  - Renders ONE item at ITEM_POS.
 *  - Pick up by pressing "P" or clicking the item.
 *  - No networking, no external stores — purely local state.
 *  - If you want distance gating, flip USE_DISTANCE_CHECK to true.
 * --------------------------------------------------------- */

const ITEM_POS = [2, 0, 0];         // x, y, z
const USE_DISTANCE_CHECK = false;    // set true to require proximity
const PICKUP_RADIUS = 3.5;           // used only if USE_DISTANCE_CHECK=true

function Billboard({ children, position = [0, 0, 0] }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

function TextSprite({ text = "", width = 0.95, bg = "rgba(20,26,34,0.92)", fg = "#ffffff" }) {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const x = 6, y = 50, w = canvas.width - 12, h = 92, r = 20;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        ctx.fillStyle = fg;
        ctx.font = "600 48px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, y + h / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
        return tex;
    }, [text, bg, fg]);

    const aspect = 512 / 192;
    return (
        <mesh>
            <planeGeometry args={[width, width / aspect]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
    );
}

function ItemMesh() {
    // a simple “battery-like” shape
    return (
        <group>
            <mesh><cylinderGeometry args={[0.15, 0.15, 0.35, 12]} /><meshStandardMaterial color="#2dd4bf" /></mesh>
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.06, 0.06, 0.1, 12]} /><meshStandardMaterial color="#0f172a" /></mesh>
        </group>
    );
}

export default function SimplePickupDemo() {
    const [picked, setPicked] = useState(false);
    const [dist, setDist] = useState(Infinity);
    const [inRange, setInRange] = useState(false);

    // Track camera distance as an easy proxy for "player" proximity
    const { camera } = useThree();
    useFrame(() => {
        if (!USE_DISTANCE_CHECK) return;
        const dx = camera.position.x - ITEM_POS[0];
        const dz = camera.position.z - ITEM_POS[2];
        const d = Math.hypot(dx, dz);
        setDist(d);
        setInRange(d <= PICKUP_RADIUS);
    });

    // Key: press "P" to pick up
    useEffect(() => {
        function onKeyDown(e) {
            if ((e.key || "").toLowerCase() !== "p") return;
            if (picked) return;
            if (USE_DISTANCE_CHECK && !inRange) return;
            console.log("[DEMO] Picked up via keyboard");
            setPicked(true); // ✅ hide mesh
        }
        window.addEventListener("keydown", onKeyDown, { passive: true });
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [picked, inRange]);

    // Mouse: click the item to pick up
    const handleClick = () => {
        if (picked) return;
        if (USE_DISTANCE_CHECK && !inRange) return;
        console.log("[DEMO] Picked up via click");
        setPicked(true); // ✅ hide mesh
    };

    if (picked) return null; // floor copy disappears entirely

    const label = USE_DISTANCE_CHECK
        ? (inRange ? `Press P or Click to pick up (d=${dist.toFixed(2)})` : `Get closer (d=${dist.toFixed(2)})`)
        : "Press P or Click to pick up";

    return (
        <group
            position={[ITEM_POS[0], ITEM_POS[1] + 0.25, ITEM_POS[2]]}
            onPointerDown={(e) => { e.stopPropagation(); handleClick(); }}
            onPointerOver={() => { document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = ""; }}
        >
            <ItemMesh />
            {/* ring */}
            <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.35, 0.42, 24]} />
                <meshBasicMaterial color={"#86efac"} transparent opacity={0.85} />
            </mesh>
            {/* floating label */}
            <Billboard position={[0, 0.85, 0]}>
                <TextSprite text={label} />
            </Billboard>
        </group>
    );
}
