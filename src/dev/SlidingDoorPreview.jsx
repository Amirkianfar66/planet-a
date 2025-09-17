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
 * New:
 *  - playerRef: a ref whose .current = [x,y,z] is updated every frame.
 *  - dwellSeconds and closeDelaySeconds for robust re-open behavior.
 *  - elevation to raise the whole door if your map puts y=0 at floor.
 *
 * Common props:
 *   position=[0,0,0], rotationY=0, elevation=0
 *   doorWidth=4.5, doorHeight=3, thickness=0.3
 *   panels=2
 *   playerRef (preferred), or playerPosition (static array), or window.__playerPos
 *   triggerRadius=3, dwellSeconds=1, closeDelaySeconds=0.15
 *   open=0..1 (when no proximity control)
 *   openSpeed=6, closeSpeed=4
 *
 * Animated GLB mode:
 *   glbUrl="/models/door.glb"
 *   clipName="Open"  // optional; defaults to /open/i or first clip
 */

export function SlidingDoor({
    // placement
    position = [0, 0, 0],
    rotationY = 0,
    elevation = 0,          // << raise entire door (e.g. 1.5)

    // dimensions / behavior
    doorWidth = 4.5,
    doorHeight = 3,
    thickness = 0.3,
    panels = 2,

    // animation control (shared)
    playerRef = null,       // prefer this: a ref whose current is [x,y,z] (updates each frame)
    playerPosition = null,  // fallback static array [x,y,z]
    triggerRadius = 3,
    dwellSeconds = 1,
    closeDelaySeconds = 0.15,
    open = 0,               // used when no proximity source is available
    openSpeed = 6,
    closeSpeed = 4,

    // ---------- Mode A: SINGLE animated GLB ----------
    glbUrl = null,
    clipName = null,

    // ---------- Mode B: panel fallback ----------
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

    // Shared open smoothing target (0..1)
    const openRef = useRef(0);

    // --- PROXIMITY CONTROL (works for both modes) ---
    const insideTimeRef = useRef(0);   // seconds accumulated while inside radius
    const outsideTimeRef = useRef(0);  // seconds accumulated while outside radius

    const getLivePlayerPos = () => {
        if (playerRef && Array.isArray(playerRef.current)) return playerRef.current;
        if (Array.isArray(playerPosition)) return playerPosition;
        if (typeof window !== "undefined" && Array.isArray(window.__playerPos)) return window.__playerPos;
        return null;
    };

    // Computes a stable targetOpen in [0..1] with dwell + close delay
    const computeTargetOpen = (dt) => {
        const pp = getLivePlayerPos();
        if (!pp) {
            // No proximity source -> use controlled prop
            return THREE.MathUtils.clamp(open, 0, 1);
        }
        const dx = (position?.[0] || 0) - pp[0];
        const dz = (position?.[2] || 0) - pp[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        const inside = dist <= triggerRadius;

        if (inside) {
            insideTimeRef.current += dt;
            outsideTimeRef.current = 0;
            // open only after dwell time
            if (insideTimeRef.current >= dwellSeconds) return 1;
            // not yet dwelled enough -> stay as we are
            return openRef.current;
        } else {
            insideTimeRef.current = 0;
            outsideTimeRef.current += dt;
            // close after a small delay to avoid flicker at the edge
            if (outsideTimeRef.current >= closeDelaySeconds) return 0;
            return openRef.current;
        }
    };

    // =====================================================================================
    // MODE A: Single animated GLB (preferred) – scrub animation clip based on openRef.v
    // =====================================================================================
    if (glbUrl) {
        return (
            <AnimatedDoorSingleGLB
                position={[position[0], position[1] + elevation, position[2]]}
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

    // Smooth open state & panel transforms using proximity dwell
    useFrame((_, dt) => {
        const target = computeTargetOpen(dt || 0.016);
        const speed = target > openRef.current ? openSpeed : closeSpeed;
        const k = Math.min(1, (dt || 0.016) * speed);
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
        <group ref={root} position={[position[0], position[1] + elevation, position[2]]} rotation={[0, rotationY || 0, 0]}>
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
 * ======================================================================================= */
function AnimatedDoorSingleGLB({
    position,
    rotationY,
    glbUrl,
    clipName,                 // "all" | "Open" | "Left,Right" | undefined
    width = 4.5,
    height = 3,
    depth = 0.3,
    openRef,
    computeTargetOpen,
    openSpeed,
    closeSpeed,
}) {
    const root = useRef();
    const holder = useRef();
    const gltf = useGLTF(glbUrl);
    const sceneClone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

    // Center & scale the model to target dims
    useEffect(() => {
        if (!holder.current || !sceneClone) return;
        while (holder.current.children.length) holder.current.remove(holder.current.children[0]);

        const obj = sceneClone.clone(true);
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        obj.position.sub(center); // center on origin

        const sx = size.x > 0 ? width / size.x : 1;
        const sy = size.y > 0 ? height / size.y : sx;
        const sz = size.z > 0 ? (depth > 0 ? depth / size.z : sx) : sx;

        const container = new THREE.Group();
        container.add(obj);
        container.scale.set(sx, sy, sz);

        holder.current.add(container);
    }, [sceneClone, width, height, depth]);

    // Prepare multi-clip scrubbing
    const { mixer, clips } = useAnimations(gltf.animations || [], holder);

    const actionsRef = useRef([]);      // [{ action, duration }]
    useEffect(() => {
        if (!mixer || !holder.current) return;
        actionsRef.current.forEach(({ action }) => action.stop());
        actionsRef.current = [];

        const allClips = gltf.animations || [];

        // Choose clips:
        let selected = [];
        if (clipName) {
            const names = Array.isArray(clipName)
                ? clipName
                : String(clipName).split(",").map(s => s.trim()).filter(Boolean);

            if (names.length === 1 && names[0].toLowerCase() === "all") {
                selected = allClips;
            } else if (names.length > 0) {
                selected = allClips.filter(c => names.includes(c.name));
            }
        }
        // Fallback: any clip with "open" in its name (case-insensitive)
        if (selected.length === 0) {
            selected = allClips.filter(c => /open/i.test(c.name));
        }
        // Final fallback: first clip only
        if (selected.length === 0 && allClips.length) {
            selected = [allClips[0]];
        }

        // Create paused actions for each selected clip
        selected.forEach((clip) => {
            const action = mixer.clipAction(clip, holder.current);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.paused = true;   // we scrub manually
            action.play();
            actionsRef.current.push({ action, duration: clip.duration || 1 });
        });
    }, [mixer, clips, gltf.animations, clipName]);

    // Smooth open value and scrub ALL selected clips
    useFrame((_, dt) => {
        const target = computeTargetOpen(dt || 0.016);
        const speed = target > openRef.current ? openSpeed : closeSpeed;
        const k = Math.min(1, (dt || 0.016) * speed);
        openRef.current += (target - openRef.current) * k;

        const v = THREE.MathUtils.clamp(openRef.current, 0, 1);
        // Set each action's time to its own duration * v
        actionsRef.current.forEach(({ action, duration }) => {
            action.time = v * duration;
        });
        mixer.update(0); // apply immediately
    });

    return (
        <group ref={root} position={position} rotation={[0, rotationY || 0, 0]}>
            <group ref={holder} />
        </group>
    );
}


export default SlidingDoor;

try {
    if (typeof useGLTF.preload === "function") {
        useGLTF.preload("/models/door.glb"); // ✅ only this one
        // remove the others to avoid 404s:
        // useGLTF.preload("/models/door_panel_l.glb");
        // useGLTF.preload("/models/door_panel_r.glb");
        // useGLTF.preload("/models/door_frame.glb");
    }
} catch { }
