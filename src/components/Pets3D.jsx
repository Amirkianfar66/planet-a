// src/components/Pets3D.jsx
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import usePetsSync from "../systems/usePetsSync.js";
import RobotDog from "./RobotDog.jsx";

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

function PetFollower({ pet }) {
    const group = useRef();
    const inner = useRef();

    const state = useMemo(() => ({
        x: Number(pet.x || 0),
        y: Number(pet.y ?? 0),
        z: Number(pet.z || 0),
        yaw: Number(pet.yaw || 0),

        prevX: Number(pet.x || 0),
        prevZ: Number(pet.z || 0),

        visSpeed: 0,
        walkPhase: 0,
        animSpeed: 0,

        stillTime: 0,
        idleAction: null,
        idleT: 0,
        idleDur: 0,
        idleCooldown: 0,
    }), [pet.id]);

    useFrame((_, dt) => {
        // targets from network/store
        const tx = Number(pet.x || 0);
        const ty = Number(pet.y ?? 0);
        const tz = Number(pet.z || 0);
        const tyaw = Number(pet.yaw || 0);

        // smooth toward targets
        const posEase = Math.min(1, dt * 12);
        const yawEase = Math.min(1, dt * 10);

        const prevX = state.x, prevZ = state.z;

        state.x = lerp(state.x, tx, posEase);
        state.y = lerp(state.y, ty, posEase);
        state.z = lerp(state.z, tz, posEase);
        state.yaw = lerpAngle(state.yaw, tyaw, yawEase);

        // visual speed from smoothed motion
        const dx = state.x - prevX;
        const dz = state.z - prevZ;
        const frameDist = Math.hypot(dx, dz);
        const speed = (dt > 0) ? frameDist / dt : 0;
        state.visSpeed = lerp(state.visSpeed, speed, 0.25);

        // ----- animation floor when seeking -----
        const isSeek = String(pet.mode || "").toLowerCase() === "seekcure";
        const isMoving = state.visSpeed > 0.03;             // ✅ define once
        const isWalkingHost = Boolean(pet.walking);         // host intent flag
        const shouldWalkAnim = isSeek && (isWalkingHost || isMoving);

        const ANIM_WALK_FLOOR = 1.1; // pretend-walk speed for animation only
        const animSpeed = shouldWalkAnim ? Math.max(state.visSpeed, ANIM_WALK_FLOOR) : state.visSpeed;
        state.animSpeed = animSpeed;

        state.walkPhase += animSpeed * 4.5 * dt;

        if (group.current) {
            group.current.position.set(state.x, state.y, state.z);
            group.current.rotation.set(0, state.yaw, 0);
        }

        // --- flat walk during seek: no Y bob/tilt ---
        const bobAmp = isSeek ? 0 : clamp(animSpeed * 0.02, 0, 0.08);
        const bob = Math.sin(state.walkPhase * 2) * bobAmp;
        const tiltPitch = isSeek ? 0 : clamp(animSpeed * 0.03, 0, 0.12) * Math.sin(state.walkPhase + Math.PI * 0.5);
        const tiltRoll = isSeek ? 0 : clamp(animSpeed * 0.02, 0, 0.08) * Math.sin(state.walkPhase);

        if (inner.current) {
            inner.current.position.y = bob; // 0 in seek
            inner.current.rotation.set(tiltPitch, 0, tiltRoll);
        }

        // ---------- IDLE ACTION LOGIC ----------
        if (isMoving) {
            state.stillTime = 0;
            state.idleCooldown = Math.max(0, state.idleCooldown - dt);
            state.idleAction = null;
            state.idleT = 0;
            state.idleDur = 0;
        } else {
            state.stillTime += dt;
            state.idleCooldown = Math.max(0, state.idleCooldown - dt);

            if (state.stillTime > 1 && !state.idleAction && state.idleCooldown === 0) {
                state.idleAction = pick(["tail", "head", "paw", "shake"]);
                state.idleDur = ({ tail: 0.9, head: 0.7, paw: 0.8, shake: 0.6 })[state.idleAction] || 0.8;
                state.idleDur *= 0.85 + Math.random() * 0.3;
                state.idleT = 0;
            }

            if (state.idleAction) {
                state.idleT += dt / state.idleDur;
                if (state.idleT >= 1) {
                    state.idleAction = null;
                    state.idleT = 0;
                    state.idleDur = 0;
                    state.idleCooldown = 1.2 + Math.random() * 0.8;
                }
            }
        }
    });

    return (
        <group ref={group}>
            <group ref={inner}>
                <RobotDog
                    walkPhase={state.walkPhase}
                    walkSpeed={state.animSpeed}
                    idleAction={state.idleAction}
                    idleT={state.idleT}
                    flatWalk={String(pet.mode || "").toLowerCase() === "seekcure"} // optional: keep head bob off
                />
            </group>
        </group>
    );
}


export default function Pets3D() {
    const { pets } = usePetsSync();

    if (!pets.length) return null;
    return (
        <group>
            {pets.map(pet => <PetFollower key={pet.id} pet={pet} />)}
        </group>
    );
}
