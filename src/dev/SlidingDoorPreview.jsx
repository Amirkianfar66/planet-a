// src/dev/SlidingDoorPreview.jsx
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Enhanced SlidingDoor
 * - Loads optional GLB assets for frame + left/right panels
 * - Falls back to simple box geometry if assets aren't provided
 * - Can auto-open by player proximity OR be controlled via `open` prop
 *
 * Props (most useful):
 *   position=[0,0,0], rotationY=0
 *   doorWidth=2.4, doorHeight=2.4, thickness=0.3, panels=2
 *   frameUrl, leftUrl, rightUrl   (GLB files placed in /public/models)
 *   playerPosition=[x,y,z]        (if set, proximity auto-opens the door)
 *   triggerRadius=3               (meters)
 *   open=0..1                     (controlled; ignored if playerPosition provided)
 *   openSpeed=6, closeSpeed=4     (smoothing)
 *   slideSlope=0                  (set >0 for a slightly diagonal slide path, e.g. 0.1)
 *   seam=0.02                     (visible gap between panels when closed)
 */
export function SlidingDoor({
    // placement
    position = [0, 0, 0],
    rotationY = 0,

    // dimensions / behavior
    doorWidth = 2.4,
    doorHeight = 2.4,
    thickness = 0.3,
    panels = 2, // 1 or 2

    // animation control
    playerPosition = null,   // [x,y,z]; if provided, we auto-open by distance
    triggerRadius = 3,
    open = 0,                // used when playerPosition is not provided
    openSpeed = 6,           // smoothing factor when opening
    closeSpeed = 4,          // smoothing factor when closing
    slideSlope = 0,          // vertical rise per meter of horizontal slide ("/" feel)
    seam = 0.02,             // small visible line between panels

    // assets (optional)
    frameUrl = null,
    leftUrl = null,
    rightUrl = null,

    // fallback colors when no GLB is used
    colorPanel = "#c9d6f0",
    colorFrame = "#5e748f",
    frameDepth = 0.08,  // fallback frame thickness (Z)
    trackHeight = 0.06, // fallback header bar
}) {
    const root = useRef();
    const gL = useRef();   // left panel mover
    const gR = useRef();   // right panel mover (if panels === 2)
    const gOpen = useRef({ v: 0 });

    // ---------- Load GLBs (optional) ----------
    const frameGltf = useGLTF.preload && frameUrl ? useGLTF(frameUrl) : (frameUrl ? useGLTF(frameUrl) : null);
    const leftGltf = useGLTF.preload && leftUrl ? useGLTF(leftUrl) : (leftUrl ? useGLTF(leftUrl) : null);
    const rightGltf = useGLTF.preload && rightUrl ? useGLTF(rightUrl) : (rightUrl ? useGLTF(rightUrl) : null);

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

        // Group to hold cloned scene; re-center bottom at y=0, center on X/Z
        const holder = new THREE.Group();
        holder.add(clone);
        // move so that (0,0,0) is bottom-center:
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

    // ---------- Auto-open by proximity OR controlled open ----------
    const targetOpen = useMemo(() => {
        if (!playerPosition) return THREE.MathUtils.clamp(open, 0, 1);
        // distance check in XZ plane (ignore Y)
        const dx = (position?.[0] || 0) - playerPosition[0];
        const dz = (position?.[2] || 0) - playerPosition[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        return dist <= triggerRadius ? 1 : 0;
    }, [playerPosition, position, triggerRadius, open]);

    useFrame((_, dt) => {
        const speed = targetOpen > gOpen.current.v ? openSpeed : closeSpeed;
        const k = Math.min(1, dt * speed);
        gOpen.current.v += (targetOpen - gOpen.current.v) * k;

        const curr = gOpen.current.v;
        const slide = panelWidth * curr;
        const yRise = slideSlope * slide;

        // base seam offsets (keep a small visible line in the middle when closed)
        const seamHalf = panels === 2 ? seam / 2 : 0;

        if (gL.current) {
            gL.current.position.set(-(seamHalf + slide), doorHeight / 2 + yRise, 0);
        }
        if (panels === 2 && gR.current) {
            gR.current.position.set((seamHalf + slide), doorHeight / 2 + yRise, 0);
        } else if (gR.current) {
            gR.current.position.set(0, doorHeight / 2 + yRise, 0);
        }
    });

    return (
        <group ref={root} position={position} rotation={[0, rotationY || 0, 0]}>
            {/* ----- Frame ----- */}
            {frameNode ? (
                <primitive object={frameNode} />
            ) : (
                <>
                    {/* Fallback simple header / sill frame */}
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

export default SlidingDoor;
