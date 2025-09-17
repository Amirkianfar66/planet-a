// src/dev/SlidingDoorPreview.jsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";

/**
 * SlidingDoor (enhanced)
 *
 * Two modes:
 *  A) Single animated GLB (glbUrl): scrubs clip time by `open` (0..1).
 *  B) Fallback "code-driven" sliding panels (optionally using frame/left/right GLBs).
 *
 * Common props:
 *   position=[0,0,0], rotationY=0
 *   doorWidth=2.4, doorHeight=2.4, thickness=0.3
 *   panels=2
 *   playerPosition=[x,y,z] (auto-open by proximity if provided)
 *   triggerRadius=3
 *   open=0..1 (used when playerPosition is not provided)
 *   openSpeed=6, closeSpeed=4 (smoothing for both modes)
 *
 * Animated GLB mode:
 *   glbUrl="/models/door.glb"   // single model (frame+panels+animation)
 *   clipName="Open"             // optional; if omitted tries "Open", then first clip
 *
 * Fallback panel mode (when glbUrl is null):
 *   frameUrl, leftUrl, rightUrl // optional GLBs; falls back to boxes if missing
 *   slideSlope=0                // diagonal slide "/" like: vertical rise per meter of horizontal slide
 *   seam=0.02                   // visible gap line between panels when closed
 *   colorPanel="#c9d6f0", colorFrame="#5e748f"
 *   frameDepth=0.08, trackHeight=0.06
 */

export function SlidingDoor({
    // placement
    position = [0, 0, 0],
    rotationY = 0,
    elevation = 0,
    // dimensions / behavior
    doorWidth = 2.4,
    doorHeight = 2.4,
    thickness = 0.3,
    panels = 2,

    // animation control (shared)
    playerPosition = null,
    triggerRadius = 3,
    open = 0,
    openSpeed = 6,
    closeSpeed = 4,

    // NEW: dwell/hold timings
    dwellOpenSec = 1.0,     // must be inside radius for this long to open
    holdOpenSec = 0.4,     // keep it open this long after leaving

    // Mode A: single animated GLB
    glbUrl = null,
    clipName = null,
    // Mode B: panel fallback
    frameUrl = null,
    leftUrl = null,
    rightUrl = null,
    slideSlope = 0,
    seam = 0.02,
    colorPanel = "#c9d6f0",
    colorFrame = "#5e748f",
    frameDepth = 0.08,
    trackHeight = 0.06,
}) {

    const root = useRef();
    const openRef = useRef(0); // smoothed 0..1

    // -------------------- Shared open (auto vs controlled) --------------------
    // -------------------- Shared open with dwell/hold --------------------
    const timeRef = useRef(typeof performance !== "undefined" ? performance.now() * 0.001 : 0);
    const stateRef = useRef({ dwell: 0, sinceExit: 999, lastIn: false });

    const computeTargetOpen = () => {
        // If no proximity control, just use the controlled 'open' prop
        if (!playerPosition) return THREE.MathUtils.clamp(open, 0, 1);

        // Compute dt (seconds) using high-resolution clock
        const now = (typeof performance !== "undefined" ? performance.now() * 0.001 : 0);
        const dt = Math.max(0, Math.min(0.1, now - timeRef.current)); // clamp dt
        timeRef.current = now;

        // Distance in XZ plane
        const dx = (position?.[0] || 0) - playerPosition[0];
        const dz = (position?.[2] || 0) - playerPosition[2];
        const inRange = Math.hypot(dx, dz) <= triggerRadius;

        // Update dwell / hold timers
        const S = stateRef.current;
        if (inRange) {
            S.dwell += dt;     // time spent inside radius
            S.sinceExit = 0;   // reset exit timer
        } else {
            S.dwell = 0;       // reset dwell
            S.sinceExit += dt; // how long since we left
        }
        S.lastIn = inRange;

        // Logic:
        // - Open only after being inside for dwellOpenSec
        // - If we just left, keep it open for holdOpenSec
        if (inRange && S.dwell >= dwellOpenSec) return 1;
        if (!inRange && S.sinceExit <= holdOpenSec) return 1;

        return 0;
    };


    // =====================================================================================
    // MODE A: Single animated GLB (preferred) – scrub animation clip based on openRef.v
    // =====================================================================================
    if (glbUrl) {
        return (
            <AnimatedDoorSingleGLB
                position={position}
                elevation={elevation}
                rotationY={rotationY}
                glbUrl={glbUrl}
                clipName={clipName}
                width={doorWidth}
                height={doorHeight}
                depth={thickness}
                openRef={openRef}
                computeTargetOpen={computeTargetOpen}
                openSpeed={openSpeed}
                closeSpeed={closeSpeed}
            />
        );
    }

    // =====================================================================================
    // MODE B: Panel fallback (legacy / editor preview) – code-moves panels
    // =====================================================================================

    const gL = useRef();   // left panel mover
    const gR = useRef();   // right panel mover

    // ---------- Load GLBs (optional) ----------
    const frameGltf = frameUrl ? useGLTF(frameUrl) : null;
    const leftGltf = leftUrl ? useGLTF(leftUrl) : null;
    const rightGltf = rightUrl ? useGLTF(rightUrl) : null;

    // Fit & center a glTF scene to target dims (non-uniform scale: X=width, Y=height, Z=depth)
    const fitScene = (scene, targetW, targetH, targetD) => {
        const clone = scene.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const eps = 1e-6;
        const sx = targetW / Math.max(size.x, eps);
        const sy = targetH / Math.max(size.y, eps);
        const sz = targetD / Math.max(size.z, eps);

        const holder = new THREE.Group();
        holder.add(clone);
        // Place bottom at y=0, centered on X/Z:
        const bottomY = box.min.y;
        clone.position.set(-center.x, -bottomY, -center.z);
        holder.scale.set(sx, sy, sz);
        return holder;
    };

    const panelWidth = panels === 2 ? doorWidth / 2 : doorWidth;

    const frameNode = useMemo(() => {
        if (!frameGltf?.scene) return null;
        return fitScene(frameGltf.scene, doorWidth + 0.04, doorHeight + trackHeight, Math.max(thickness, frameDepth));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameGltf, doorWidth, doorHeight, thickness, frameDepth, trackHeight]);

    const leftNode = useMemo(() => {
        if (!leftGltf?.scene) return null;
        return fitScene(leftGltf.scene, panelWidth, doorHeight, thickness);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leftGltf, panelWidth, doorHeight, thickness]);

    const rightNode = useMemo(() => {
        if (!rightGltf?.scene) return null;
        return fitScene(rightGltf.scene, panelWidth, doorHeight, thickness);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rightGltf, panelWidth, doorHeight, thickness]);

    // Smooth open state & panel transforms
    useFrame((_, dt) => {
        const target = computeTargetOpen();
        const speed = target > openRef.current ? openSpeed : closeSpeed;
        const k = Math.min(1, dt * speed);
        openRef.current += (target - openRef.current) * k;

        const curr = openRef.current;
        const slide = panelWidth * curr;
        const yRise = slideSlope * slide;

        const seamHalf = panels === 2 ? seam / 2 : 0;

        if (gL.current) gL.current.position.set(-(seamHalf + slide), doorHeight / 2 + yRise, 0);
        if (gR.current) {
            if (panels === 2) gR.current.position.set((seamHalf + slide), doorHeight / 2 + yRise, 0);
            else gR.current.position.set(0, doorHeight / 2 + yRise, 0);
        }
    });

    return (
        <group ref={root} position={[position[0], position[1] + elevation, position[2]]}
 rotation= { [0, rotationY || 0, 0]} >
            {/* ----- Frame ----- */}
            {frameNode ? (
                <primitive object={frameNode} />
            ) : (
                <>
                    {/* Header / sill */}
                    <mesh position={[0, doorHeight + trackHeight / 2, 0]}>
                        <boxGeometry args={[doorWidth + 0.04, trackHeight, frameDepth]} />
                        <meshStandardMaterial color={colorFrame} roughness={0.9} metalness={0.1} />
                    </mesh>
                    <mesh position={[0, 0.02, 0]}>
                        <boxGeometry args={[doorWidth + 0.02, 0.04, frameDepth]} />
                        <meshStandardMaterial color={colorFrame} roughness={0.9} metalness={0.1} />
                    </mesh>
                </>
            )}

            {/* ----- Left panel ----- */}
            <group ref={gL}>
                {leftNode ? (
                    <primitive object={leftNode} />
                ) : (
                    <mesh>
                        <boxGeometry args={[panelWidth, doorHeight, thickness]} />
                        <meshStandardMaterial color={colorPanel} metalness={0.15} roughness={0.6} />
                    </mesh>
                )}
            </group>

            {/* ----- Right / single panel ----- */}
            <group ref={gR}>
                {panels === 2 ? (
                    rightNode ? (
                        <primitive object={rightNode} />
                    ) : (
                        <mesh>
                            <boxGeometry args={[panelWidth, doorHeight, thickness]} />
                            <meshStandardMaterial color={colorPanel} metalness={0.15} roughness={0.6} />
                        </mesh>
                    )
                ) : null}
            </group>
        </group>
    );
}

/* =======================================================================================
 * Internal: AnimatedDoorSingleGLB
 * Loads a single GLB and scrubs its animation based on openRef (0..1).
 * Scales to (width, height, depth).
 * =======================================================================================
 */
function AnimatedDoorSingleGLB({
    position,
    rotationY,
    elevation = 0,
    glbUrl,
    clipName,
    width = 2.4,
    height = 2.4,
    depth = 0.3,
    openRef,
    computeTargetOpen,
    openSpeed,
    closeSpeed,
}) {
    const root = useRef();
    const holder = useRef();   // where we put the centered & scaled clone
    const gltf = useGLTF(glbUrl);
    const sceneClone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

    // Center & scale model to target dims
    useEffect(() => {
        if (!holder.current || !sceneClone) return;
        // Clear previous
        while (holder.current.children.length) holder.current.remove(holder.current.children[0]);

        const obj = sceneClone;
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const bottomY = box.min.y;
        obj.position.set(-center.x, -bottomY, -center.z);

        const sx = size.x > 0 ? width / size.x : 1;
        const sy = size.y > 0 ? height / size.y : sx;
        const sz = size.z > 0 ? (depth > 0 ? depth / size.z : sx) : sx;

        const container = new THREE.Group();
        container.add(obj);
        container.scale.set(sx, sy, sz);

        holder.current.add(container);
    }, [sceneClone, width, height, depth]);

    // Prepare animation scrubbing
    const { actions, mixer, clips } = useAnimations(gltf.animations || [], holder);
    const actionRef = useRef(null);
    const durationRef = useRef(1);

    useEffect(() => {
        if (!mixer || !holder.current) return;
        // Choose clip
        const clip =
            (clipName && (gltf.animations || []).find((a) => a.name === clipName)) ||
            (gltf.animations || []).find((a) => /open/i.test(a.name)) ||
            (gltf.animations || [])[0];

        if (!clip) return;

        if (actionRef.current) actionRef.current.stop();
        const act = mixer.clipAction(clip, holder.current);
        act.clampWhenFinished = true;
        act.enabled = true;
        act.paused = true;      // we scrub manually
        act.play();

        actionRef.current = act;
        durationRef.current = clip.duration || 1;
    }, [mixer, clips, gltf.animations, clipName]);

    // Smooth open value and scrub
    useFrame((_, dt) => {
        const target = computeTargetOpen();
        const speed = target > openRef.current ? openSpeed : closeSpeed;
        const k = Math.min(1, dt * speed);
        openRef.current += (target - openRef.current) * k;

        if (actionRef.current) {
            const dur = durationRef.current || 1;
            const t = THREE.MathUtils.clamp(openRef.current, 0, 1) * dur;
            actionRef.current.time = t;
            mixer.update(0); // force apply at this exact time
        }
    });

    return (
        <group ref={root} position={[position[0], position[1] + elevation, position[2]]}
 rotation= { [0, rotationY || 0, 0]} >
            <group ref={holder} />
        </group>
    );
}

export default SlidingDoor;

// Optional preloads for most common paths (won't error if paths don't exist at build time)
try {
    if (typeof useGLTF.preload === "function") {
        useGLTF.preload("/models/door.glb");
        useGLTF.preload("/models/door_frame.glb");
        useGLTF.preload("/models/door_panel_l.glb");
        useGLTF.preload("/models/door_panel_r.glb");
    }
} catch { }
