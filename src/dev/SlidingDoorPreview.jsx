import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";

/**
 * SlidingDoor (enhanced)
 *
 * Modes:
 *  A) Single animated GLB (glbUrl): scrubs one or many clips by an 'open' (0..1).
 *  B) Fallback code panels (optional frame/left/right GLBs or simple boxes).
 *
 * Proximity:
 *   playerRef={ref.current=[x,y,z]}  (preferred) OR playerPosition=[x,y,z]
 *   triggerRadius=3, dwellSeconds=1, closeDelaySeconds=0.15
 *   openSpeed=6, closeSpeed=4
 *
 * Colliders:
 *   Publishes an AABB for closed doors into window.__doorAABBs (Map).
 *   LocalController should merge these into its colliders list.
 */

// ---------------- Collider helpers ----------------
function ensureDoorColliderStore() {
    if (typeof window === "undefined") return null;
    if (!window.__doorAABBs) window.__doorAABBs = new Map();
    return window.__doorAABBs;
}

// AABB for a rotated rectangle centered at (cx,cz) with half-extents hx (along width), hz (depth) rotated by yaw.
function makeDoorAABB(cx, cz, hx, hz, yaw) {
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const ex = c * hx + s * hz;
    const ez = s * hx + c * hz;
    return {
        minX: cx - ex,
        maxX: cx + ex,
        minZ: cz - ez,
        maxZ: cz + ez,
    };
}

export function SlidingDoor({
    // placement
    position = [0, 0, 0],
    rotationY = 0,
    elevation = 0,

    // dimensions / behavior
    doorWidth = 4.5,
    doorHeight = 3,
    thickness = 0.3,
    panels = 2, // 1 or 2

    // proximity control (shared)
    playerRef = null,       // preferred (ref.current = [x,y,z])
    playerPosition = null,  // fallback array
    triggerRadius = 3,
    dwellSeconds = 1,
    closeDelaySeconds = 0.15,
    openSpeed = 6,
    closeSpeed = 4,

    // optional direct control when not using proximity
    open = 0,

    // ---------- Mode A: SINGLE animated GLB ----------
    glbUrl = null,
    clipName = null,        // "all" | "Open" | "Left,Right" (comma list)
    clipNames = null,       // array override, e.g., ["Open_L","Open_R"]

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

    // Colliders
    colliderId = null,             // unique id for this door
    yaw = 0,                       // world yaw (same rotY you give to the group)
    wallThickness = 0.6,           // door “depth” across the wall
    collisionOpenThreshold = 0.2,  // <= this open, we block
}) {
    const root = useRef();
    const openRef = useRef(0);
    const targetRef = useRef(0);
    const dwellRef = useRef(0);
    const farRef = useRef(closeDelaySeconds);

    // ---- proximity + dwell → target open ----
    const updateTargetFromProximity = (dt) => {
        const p = playerRef?.current || playerPosition;
        if (!p) {
            // no proximity provided: controlled mode
            targetRef.current = THREE.MathUtils.clamp(open, 0, 1);
            return;
        }

        // door world position (handles groups/rotation/elevation)
        const wp = new THREE.Vector3();
        root.current?.getWorldPosition(wp);

        const dx = p[0] - wp.x;
        const dz = p[2] - wp.z;
        const near = (dx * dx + dz * dz) <= (triggerRadius * triggerRadius);

        if (near) {
            dwellRef.current += dt;
            farRef.current = 0;
            if (dwellRef.current >= dwellSeconds) targetRef.current = 1;
        } else {
            dwellRef.current = 0;
            farRef.current += dt;
            if (farRef.current >= closeDelaySeconds) targetRef.current = 0;
        }
    };

    // Smooth open → openRef
    useFrame((_, dt) => {
        const step = dt || 0.016;
        updateTargetFromProximity(step);
        const speed = targetRef.current > openRef.current ? openSpeed : closeSpeed;
        const k = Math.min(1, step * speed);
        openRef.current += (targetRef.current - openRef.current) * k;
    });

    // Publish/remove collider each frame based on openRef
    useFrame(() => {
        const store = ensureDoorColliderStore();
        if (!store || !root.current || !colliderId) return;

        if (openRef.current <= collisionOpenThreshold) {
            // mostly closed → block
            const wp = new THREE.Vector3();
            root.current.getWorldPosition(wp);

            const hx = (doorWidth || 4.5) / 2;
            const hz = Math.max((wallThickness || 0.6) / 2, 0.3);
            const aabb = makeDoorAABB(wp.x, wp.z, hx, hz, yaw || rotationY || 0);
            store.set(colliderId, aabb);
        } else {
            store.delete(colliderId);
        }
    });

    // =====================================================================================
    // MODE A: Single animated GLB (preferred)
    // =====================================================================================
    if (glbUrl) {
        return (
            <AnimatedDoorSingleGLB
                position={[position[0], position[1] + elevation, position[2]]}
                rotationY={rotationY}
                glbUrl={glbUrl}
                clipName={clipName}
                clipNames={clipNames}
                width={doorWidth}
                height={doorHeight}
                depth={thickness}
                openRef={openRef}
                rootRef={root}
            />
        );
    }

    // =====================================================================================
    // MODE B: Panel fallback (legacy / editor preview)
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

    // Move panels from smoothed openRef
    useFrame(() => {
        const curr = openRef.current;
        const slide = panelWidth * curr;
        const yRise = slideSlope * slide;
        const seamHalf = panels === 2 ? seam / 2 : 0;

        if (gL.current) gL.current.position.set(-(seamHalf + slide), elevation + doorHeight / 2 + yRise, 0);
        if (gR.current) {
            if (panels === 2) gR.current.position.set((seamHalf + slide), elevation + doorHeight / 2 + yRise, 0);
            else gR.current.position.set(0, elevation + doorHeight / 2 + yRise, 0);
        }
    });

    return (
        <group ref={root} position={position} rotation={[0, rotationY || 0, 0]}>
            {/* Frame (fallback) */}
            {frameNode ? (
                <group position={[0, elevation, 0]}>
                    <primitive object={frameNode} />
                </group>
            ) : (
                <group position={[0, elevation, 0]}>
                    {/* Header / sill */}
                    <mesh position={[0, doorHeight + trackHeight / 2, 0]}>
                        <boxGeometry args={[doorWidth + 0.04, trackHeight, frameDepth]} />
                        <meshStandardMaterial color={colorFrame} roughness={0.9} metalness={0.1} />
                    </mesh>
                    <mesh position={[0, 0.02, 0]}>
                        <boxGeometry args={[doorWidth + 0.02, 0.04, frameDepth]} />
                        <meshStandardMaterial color={colorFrame} roughness={0.9} metalness={0.1} />
                    </mesh>
                </group>
            )}

            {/* Left panel */}
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

            {/* Right / single panel */}
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
 * Loads a single GLB and scrubs its animation(s) based on openRef (0..1).
 * Scales to (width, height, depth). The entire GLB is lifted by `position.y`.
 * ======================================================================================= */
function AnimatedDoorSingleGLB({
    position,
    rotationY,
    glbUrl,
    clipName,
    clipNames = null,
    width = 4.5,
    height = 3,
    depth = 0.3,
    openRef,
    rootRef, // to compute world position for proximity checks
}) {
    const holder = useRef();
    const gltf = useGLTF(glbUrl);
    const sceneClone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

    // Center & scale model to target dims (bottom at y=0 inside holder)
    useEffect(() => {
        if (!holder.current || !sceneClone) return;
        while (holder.current.children.length) holder.current.remove(holder.current.children[0]);

        const obj = sceneClone.clone(true);
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        // shift so origin is bottom-center
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

    // Multi-clip scrubbing (e.g., left + right panel)
    const { mixer } = useAnimations(gltf.animations || [], holder);
    const actionsRef = useRef([]);
    const durationsRef = useRef([]);

    useEffect(() => {
        if (!mixer || !holder.current) return;
        actionsRef.current.forEach(a => a.stop());
        actionsRef.current = [];
        durationsRef.current = [];

        const all = gltf.animations || [];

        let wanted = [];
        if (Array.isArray(clipNames) && clipNames.length) {
            wanted = clipNames.map(n => all.find(a => a.name === n)).filter(Boolean);
        }
        if (!wanted.length && clipName) {
            const names = String(clipName).split(",").map(s => s.trim()).filter(Boolean);
            if (names.length === 1 && names[0].toLowerCase() === "all") {
                wanted = all.slice();
            } else {
                wanted = all.filter(c => names.includes(c.name));
            }
        }
        if (!wanted.length) {
            wanted = all.filter(c => /open/i.test(c.name));
        }
        if (!wanted.length && all.length) {
            wanted = [all[0]];
        }

        wanted.forEach((clip) => {
            const action = mixer.clipAction(clip, holder.current);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.paused = true; // manual scrubbing
            action.play();
            actionsRef.current.push(action);
            durationsRef.current.push(clip.duration || 1);
        });
    }, [mixer, gltf.animations, clipName, clipNames]);

    // Scrub by openRef for all actions
    useFrame(() => {
        const v = THREE.MathUtils.clamp(openRef.current, 0, 1);
        const ds = durationsRef.current;
        const as = actionsRef.current;
        for (let i = 0; i < as.length; i++) {
            as[i].time = v * (ds[i] || 1);
        }
        mixer.update(0);
    });

    return (
        <group ref={rootRef} position={position} rotation={[0, rotationY || 0, 0]}>
            <group ref={holder} />
        </group>
    );
}

export default SlidingDoor;

try {
    if (typeof useGLTF.preload === "function") {
        useGLTF.preload("/models/door.glb");
    }
} catch { }
