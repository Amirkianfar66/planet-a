// src/components/characters3d/Astronaut3DBase.jsx
import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GUN_OFFSETS } from "../../game/gunOffsets";

/* ---------- color utils ---------- */
function parseHex(hex) {
    const s = (hex || "#777").replace("#", "");
    const full = s.length === 3 ? s.split("").map(c => c + c).join("") : s;
    const n = parseInt(full, 16) || 0x777777;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shadeHex(hex, amt = -40) {
    const { r, g, b } = parseHex(hex);
    const clamp = (v) => Math.min(255, Math.max(0, v + amt));
    const toHex = (v) => v.toString(16).padStart(2, "0");
    return "#" + toHex(clamp(r)) + toHex(clamp(g)) + toHex(clamp(b));
}
function luminance({ r, g, b }) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function secondaryFromSuit(hex) {
    const lum = luminance(parseHex(hex));
    return lum > 170 ? shadeHex(hex, -70) : shadeHex(hex, +70);
}

/* ---------- billboard helper ---------- */
function Billboard({ position = [0, 0, 0], children }) {
    const ref = useRef();
    const { camera } = useThree();
    useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
    return <group ref={ref} position={position}>{children}</group>;
}

/* ---------- floating name/role tag ---------- */
function NameTag({ name = "Anon", role = "Crew", accent = "#68c7ff", position = [0, 2.2, 0] }) {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 192;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "rgba(20,26,34,0.85)";
        const r = 26, w = canvas.width - 8, h = 120, x = 4, y = 36;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.fill();

        ctx.font = "700 56px ui-sans-serif, system-ui";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(name, canvas.width / 2, 92);

        ctx.font = "500 40px ui-sans-serif, system-ui";
        ctx.fillStyle = accent;
        ctx.fillText(role, canvas.width / 2, 140);

        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(44, 44, 10, 0, Math.PI * 2); ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }, [name, role, accent]);

    return (
        <Billboard position={position}>
            <mesh>
                <planeGeometry args={[1.8, 0.7]} />
                <meshBasicMaterial map={texture} transparent />
            </mesh>
        </Billboard>
    );
}

/* ---------- base character with animation ---------- */
export default function Astronaut3DBase({
    suit, prop, name, role, showName,
    bob, speed = 0, airborne = false,
    carry, isLocal, onClickCarry, onContextMenuCarry,
    ...props // ← world transform from parent lives here
}) {
    const visor = "#0f1216";
    const secondary = useMemo(() => secondaryFromSuit(suit), [suit]);

    // refs for animation
    const worldRef = useRef();     // ← world (position/rotation from parent)
    const bobRef = useRef();     // ← inner group that actually bobs/tilts
    const lLeg = useRef(); const rLeg = useRef();
    const lLegMesh = useRef(); const rLegMesh = useRef();
    const lArm = useRef(); const rArm = useRef();
    const lArmMesh = useRef(); const rArmMesh = useRef();

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        const moving = Number(speed) > 0.2;
        const inAir = Boolean(airborne);

        // idle bob (on inner group, NOT the world group)
        if (!moving && !inAir && bob && bobRef.current) {
            const y = Math.sin(t * 2.0) * 0.05;   // 5cm vertical bob
            const tilt = Math.sin(t * 1.5) * 0.04;
            bobRef.current.position.y = y;
            bobRef.current.rotation.z = tilt;
        } else if (bobRef.current) {
            bobRef.current.position.y = 0;
            bobRef.current.rotation.z = 0;
        }

        // walking cycle
        if (moving && !inAir) {
            const w = THREE.MathUtils.clamp(3.5 + speed * 0.8, 3.5, 9.5);
            const phase = t * w;
            const legAmp = 0.6;
            const armAmp = 0.35;
            if (lLeg.current && rLeg.current) {
                lLeg.current.rotation.x = Math.sin(phase) * legAmp;
                rLeg.current.rotation.x = Math.sin(phase + Math.PI) * legAmp;
            }
            if (lArm.current && rArm.current) {
                lArm.current.rotation.x = Math.sin(phase + Math.PI) * armAmp;
                rArm.current.rotation.x = Math.sin(phase) * armAmp;
            }
        } else if (!inAir) {
            if (lLeg?.current) lLeg.current.rotation.x = 0;
            if (rLeg?.current) rLeg.current.rotation.x = 0;
            if (lArm?.current) lArm.current.rotation.x = 0;
            if (rArm?.current) rArm.current.rotation.x = 0;
        }

        // jump/fall pose (simple) — lean the inner group slightly
        if (inAir) {
            if (lLeg?.current) lLeg.current.rotation.x = -0.25;
            if (rLeg?.current) rLeg.current.rotation.x = 0.25;
            if (lArm?.current) lArm.current.rotation.x = -0.15;
            if (rArm?.current) rArm.current.rotation.x = 0.35;
            if (bobRef.current) bobRef.current.rotation.x = 0.05;
        } else {
            if (bobRef.current) bobRef.current.rotation.x = 0;
        }
    });

    /* right-hand prop (simple shapes) */
    const RightProp = () => {
        const basePos = [0.6, 1.0, 0.18];
        switch (prop) {
            case "wrench":
                return (
                    <group position={[0.6, 1.0, 0.2]} rotation={[0, -Math.PI / 10, 0]}>
                        <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5, 12]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.22, 0.12, 0.08]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0.08, 0.25, 0]}><boxGeometry args={[0.1, 0.18, 0.08]} /><meshStandardMaterial color={secondary} /></mesh>
                    </group>
                );
            case "syringe":
                return (
                    <group position={basePos} rotation={[0, -Math.PI / 18, 0]}>
                        <mesh><cylinderGeometry args={[0.06, 0.06, 0.42, 12]} /><meshStandardMaterial color="#ffffff" /></mesh>
                        <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.055, 0.055, 0.34, 12]} /><meshStandardMaterial color="#d62828" /></mesh>
                        <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.07, 0.07, 0.06, 12]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0, -0.24, 0]}><cylinderGeometry args={[0.01, 0.005, 0.18, 8]} /><meshStandardMaterial color={secondary} /></mesh>
                    </group>
                );
            case "controller":
                return (
                    <group position={basePos}>
                        <mesh><boxGeometry args={[0.5, 0.24, 0.08]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0, 0.02, 0.045]}><planeGeometry args={[0.38, 0.12]} /><meshBasicMaterial color="#ffffff" /></mesh>
                        <mesh position={[-0.16, -0.06, 0.045]}><planeGeometry args={[0.06, 0.06]} /><meshBasicMaterial color="#43D7C5" /></mesh>
                        <mesh position={[0.16, -0.06, 0.045]}><planeGeometry args={[0.06, 0.06]} /><meshBasicMaterial color="#FFC83D" /></mesh>
                    </group>
                );
            case "tablet":
                return (
                    <group position={basePos}>
                        <mesh><boxGeometry args={[0.5, 0.35, 0.04]} /><meshStandardMaterial color="#dfe5ee" /></mesh>
                        <mesh position={[0, 0, 0.025]}><planeGeometry args={[0.42, 0.26]} /><meshBasicMaterial color={secondary} /></mesh>
                    </group>
                );
            case "gun":
                return (
                    <group position={[GUN_OFFSETS.right, GUN_OFFSETS.up, GUN_OFFSETS.forward]} rotation={[0, 0, 0]}>
                        <mesh><boxGeometry args={[0.12, 0.16, 0.34]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0, 0.06, 0.05]}><boxGeometry args={[0.10, 0.06, 0.16]} /><meshStandardMaterial color={shadeHex(secondary, -30)} /></mesh>
                        <mesh position={[0, -0.18, -0.04]}><boxGeometry args={[0.10, 0.24, 0.12]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0, 0, GUN_OFFSETS.barrelZ]} rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.012, 0.012, 0.08, 12]} />
                            <meshStandardMaterial color={shadeHex(secondary, -30)} emissive="#ef4444" emissiveIntensity={2} metalness={0.1} roughness={0.6} />
                        </mesh>
                    </group>
                );
            case "backpack":
                return (
                    <group position={[0.6, 0.9, 0.2]}>
                        <mesh><boxGeometry args={[0.55, 0.6, 0.35]} /><meshStandardMaterial color={secondary} /></mesh>
                        <mesh position={[0, 0.35, 0]}><torusGeometry args={[0.16, 0.04, 8, 16]} /><meshStandardMaterial color={shadeHex(secondary, -30)} /></mesh>
                        <mesh position={[0, 0.06, 0.18]}><planeGeometry args={[0.24, 0.24]} /><meshBasicMaterial color="#F8FAFC" /></mesh>
                    </group>
                );
            default:
                return null;
        }
    };

    function CarryProp({ type }) {
        if (!type) return null;
        switch (type) {
            case "food": return <mesh><boxGeometry args={[0.28, 0.22, 0.28]} /><meshStandardMaterial color="#ff9f43" /></mesh>;
            case "battery": return <mesh><cylinderGeometry args={[0.14, 0.14, 0.32, 12]} /><meshStandardMaterial color="#22c5b4" /></mesh>;
            case "o2can": return <mesh><cylinderGeometry args={[0.18, 0.18, 0.44, 14]} /><meshStandardMaterial color="#9bd1ff" /></mesh>;
            case "fuel": return <mesh><boxGeometry args={[0.1, 0.52, 0.1]} /><meshStandardMaterial color="#a78bfa" /></mesh>;
            default: return null;
        }
    }

    return (
        // OUTER: world transform (controlled by parent)
        <group ref={worldRef} {...props}>
            {/* INNER: animated body (bobbing/tilt applied here) */}
            <group ref={bobRef}>
                {/* body (tinted suit) */}
                <mesh position={[0, 0.75, 0]}>
                    <boxGeometry args={[0.9, 1.1, 0.45]} />
                    <meshStandardMaterial color={suit} />
                </mesh>

                {/* belt / panel (secondary) */}
                <mesh position={[0, 0.4, 0]}>
                    <boxGeometry args={[0.92, 0.12, 0.48]} />
                    <meshStandardMaterial color={secondary} />
                </mesh>

                {/* LEGS (pivot at hip) */}
                <group ref={lLeg} position={[-0.22, 0.4, 0]}>
                    <mesh ref={lLegMesh} position={[0, -0.2, 0]}>
                        <boxGeometry args={[0.34, 0.4, 0.44]} />
                        <meshStandardMaterial color={suit} />
                    </mesh>
                    <mesh position={[0, -0.1, 0.23]}>
                        <boxGeometry args={[0.32, 0.04, 0.02]} />
                        <meshStandardMaterial color={secondary} />
                    </mesh>
                </group>

                <group ref={rLeg} position={[0.22, 0.4, 0]}>
                    <mesh ref={rLegMesh} position={[0, -0.2, 0]}>
                        <boxGeometry args={[0.34, 0.4, 0.44]} />
                        <meshStandardMaterial color={suit} />
                    </mesh>
                    <mesh position={[0, -0.1, 0.23]}>
                        <boxGeometry args={[0.32, 0.04, 0.02]} />
                        <meshStandardMaterial color={secondary} />
                    </mesh>
                </group>

                {/* HEAD + VISOR */}
                <mesh position={[0, 1.45, 0]}>
                    <boxGeometry args={[1.0, 0.7, 0.7]} />
                    <meshStandardMaterial color={suit} />
                </mesh>
                <mesh position={[0, 1.45, 0.36]}>
                    <planeGeometry args={[0.8, 0.42]} />
                    <meshBasicMaterial color={visor} />
                </mesh>
                {/* ear pods */}
                <mesh position={[-0.56, 1.45, 0]}>
                    <boxGeometry args={[0.18, 0.28, 0.28]} />
                    <meshStandardMaterial color={secondary} />
                </mesh>
                <mesh position={[0.56, 1.45, 0]}>
                    <boxGeometry args={[0.18, 0.28, 0.28]} />
                    <meshStandardMaterial color={secondary} />
                </mesh>

                {/* ARMS (pivot at shoulder) */}
                <group ref={lArm} position={[-0.6, 1.13, 0]}>
                    <mesh ref={lArmMesh} position={[0, -0.18, 0]}>
                        <boxGeometry args={[0.22, 0.36, 0.36]} />
                        <meshStandardMaterial color={suit} />
                    </mesh>
                </group>

                <group ref={rArm} position={[0.6, 1.13, 0]}>
                    <mesh ref={rArmMesh} position={[0, -0.18, 0]}>
                        <boxGeometry args={[0.22, 0.36, 0.36]} />
                        <meshStandardMaterial color={suit} />
                    </mesh>
                </group>

                {/* left hand carry mount */}
                <group position={[-0.6, 1.0, 0]}>
                    <group
                        position={[0, -0.12, 0.18]}
                        onClick={(e) => {
                            if (!isLocal) return;
                            e.stopPropagation();
                            if (carry && onClickCarry) onClickCarry();
                        }}
                        onContextMenu={(e) => {
                            if (!isLocal) return;
                            e.stopPropagation();
                            e.preventDefault();
                            if (carry && onContextMenuCarry) onContextMenuCarry();
                        }}
                        onPointerOver={() => { if (isLocal && carry) document.body.style.cursor = "pointer"; }}
                        onPointerOut={() => { if (isLocal) document.body.style.cursor = ""; }}
                    >
                        <CarryProp type={carry || ""} />
                    </group>
                </group>

                {/* prop in right hand */}
                <RightProp />

                {/* name tag */}
                {showName && <NameTag name={name} role={role} accent={secondary} position={[0, 2.25, 0]} />}
            </group>
        </group>
    );
}
