// src/components/Pets3D.jsx
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import useItemsSync from "../systems/useItemsSync.js";
import RobotDog from "./RobotDog.jsx";

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

// Renders one pet with smoothing + walk + idle actions
function PetFollower({ pet }) {
    const group = useRef();
    const inner = useRef(); // child group to apply bob/tilt

    // local visual state (smoothed & anim)
    const state = useMemo(() => ({
        // transform
        x: Number(pet.x || 0),
        y: Number(pet.y ?? 0),
        z: Number(pet.z || 0),
        yaw: Number(pet.yaw || 0),

        // for speed calc
        prevX: Number(pet.x || 0),
        prevZ: Number(pet.z || 0),

        // motion
        visSpeed: 0,          // m/s approx
        walkPhase: 0,         // radians

        // idle logic
        stillTime: 0,         // seconds of being ~still
        idleAction: null,     // "tail","head","paw","shake"
        idleT: 0,             // 0..1 normalized progress
        idleDur: 0,           // seconds
        idleCooldown: 0,      // seconds before next action
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

        // instantaneous visual speed (m/s) from smoothed motion
        const dx = state.x - prevX;
        const dz = state.z - prevZ;
        const frameDist = Math.hypot(dx, dz);
        const speed = (dt > 0) ? frameDist / dt : 0;

        // low-pass filter the speed a bit
        state.visSpeed = lerp(state.visSpeed, speed, 0.25);

       // Use a floor for animation when seeking so it "walks" even if moving slowly
        const isSeek = String(pet.mode || "").toLowerCase() === "seekcure";
        const moving = state.visSpeed > 0.03;
        const ANIM_WALK_FLOOR = 1.1;  // ~normal walk m/s for animation only
        const animSpeed = isSeek && moving ? Math.max(state.visSpeed, ANIM_WALK_FLOOR) : state.visSpeed;
       // advance walk phase based on *animSpeed* (not real speed)
        state.walkPhase += animSpeed * 4.5 * dt;

        if (group.current) {
            group.current.position.set(state.x, state.y, state.z);
            group.current.rotation.set(0, state.yaw, 0);
        }

        // --- bob/tilt on inner
        const bobAmp = clamp(animSpeed * 0.02, 0, 0.08);
        const bob = Math.sin(state.walkPhase * 2) * bobAmp;
        const tiltPitch = clamp(animSpeed * 0.03, 0, 0.12) * Math.sin(state.walkPhase + Math.PI * 0.5);
        const tiltRoll = clamp(animSpeed * 0.02, 0, 0.08) * Math.sin(state.walkPhase);

        if (inner.current) {
            inner.current.position.y = bob;
            inner.current.rotation.set(tiltPitch, 0, tiltRoll);
        }

        // ---------- IDLE ACTION LOGIC ----------
        const moving = state.visSpeed > 0.03; // threshold for "moving"
        if (moving) {
            state.stillTime = 0;
            state.idleCooldown = Math.max(0, state.idleCooldown - dt);
            // cancel idle action if we start moving
            state.idleAction = null;
            state.idleT = 0;
            state.idleDur = 0;
        } else {
            state.stillTime += dt;
            state.idleCooldown = Math.max(0, state.idleCooldown - dt);

            // if idle > 1s and not currently animating and off cooldown → pick one
            if (state.stillTime > 1 && !state.idleAction && state.idleCooldown === 0) {
                state.idleAction = pick(["tail", "head", "paw", "shake"]);
                // random duration per action
                state.idleDur = ({
                    tail: 0.9,
                    head: 0.7,
                    paw: 0.8,
                    shake: 0.6,
                })[state.idleAction] || 0.8;

                // small variation ±15%
                state.idleDur *= 0.85 + Math.random() * 0.3;
                state.idleT = 0;
            }

            // advance current idle action
            if (state.idleAction) {
                state.idleT += dt / state.idleDur;
                if (state.idleT >= 1) {
                    // done → cooldown
                    state.idleAction = null;
                    state.idleT = 0;
                    state.idleDur = 0;
                    state.idleCooldown = 1.2 + Math.random() * 0.8; // wait a bit before next
                }
            }
        }

        // expose (passes to RobotDog as props)
    });

    return (
        <group ref={group}>
            <group ref={inner}>
                <RobotDog walkPhase={state.walkPhase} walkSpeed={animSpeed}
             idleAction={state.idleAction} idleT={state.idleT} />
            </group>
        </group>
    );
}

export default function Pets3D() {
    const { items } = useItemsSync();
    const pets = (items || []).filter(i => String(i.type).toLowerCase() === "pet");
    if (!pets.length) return null;

    return (
        <group>
            {pets.map(pet => (
                <PetFollower key={pet.id} pet={pet} />
            ))}
        </group>
    );
}
