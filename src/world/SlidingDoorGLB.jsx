import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

/**
 * SlidingDoorGLB
 * - Loads three GLBs: frame, left panel, right panel
 * - When the player comes within triggerRadius (XZ distance), the door opens.
 * - Panels slide along X and tilt around Z ("/" feel).
 *
 * Props:
 *  - position: [x,y,z]
 *  - rotationY: radians
 *  - frameUrl, leftUrl, rightUrl: GLB paths
 *  - doorWidth: opening width between frame uprights (default 2.4)
 *  - doorHeight: opening height (default 2.1)
 *  - thickness: visual depth used for auto-fitting panels (default 0.3)
 *  - triggerRadius: open distance in meters (default 3)
 *  - openTime: seconds to fully open (default 0.6)
 *  - closeTime: seconds to fully close (default 0.6)
 *  - slideFactor: how far each panel slides relative to half-width (default 1.0)
 *  - tiltDeg: diagonal tilt while opening (default 5)
 *  - playerPosition: [x,y,z] world coords of the local player (required)
 */
export default function SlidingDoorGLB({
  position = [0, 0, 0],
  rotationY = 0,
  frameUrl = "/models/door frame.glb",
  leftUrl  = "/models/door panel l.glb",
  rightUrl = "/models/door panel r.glb",
  doorWidth = 2.4,
  doorHeight = 2.1,
  thickness = 0.3,
  triggerRadius = 3,
  openTime = 0.6,
  closeTime = 0.6,
  slideFactor = 1.0,
  tiltDeg = 5,
  playerPosition = null,
  castShadow = true,
  receiveShadow = true,
}) {
  const groupRef = useRef();
  const leftPivotRef = useRef();
  const rightPivotRef = useRef();

  // Load GLBs (scenes)
  const frameGLB = useGLTF(frameUrl);
  const leftGLB  = useGLTF(leftUrl);
  const rightGLB = useGLTF(rightUrl);

  // Clone scenes so we can safely reparent/scale
  const frameScene = useMemo(() => frameGLB.scene.clone(true), [frameGLB]);
  const leftScene  = useMemo(() => leftGLB.scene.clone(true), [leftGLB]);
  const rightScene = useMemo(() => rightGLB.scene.clone(true), [rightGLB]);

  // Utility: compute AABB and scale object non-uniformly to target size (W,H,T)
  function fitToSize(root, targetW, targetH, targetT) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Avoid div-by-zero
    const sx = size.x > 1e-6 ? targetW / size.x : 1;
    const sy = size.y > 1e-6 ? targetH / size.y : 1;
    const sz = size.z > 1e-6 ? targetT / size.z : 1;
    root.scale.set(sx, sy, sz);

    // Re-center around local origin so pivots behave predictably
    const box2 = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    root.position.sub(center); // move so local origin is the visual center
  }

  // Prepare nodes (once)
  const prepared = useMemo(() => {
    // Frame: scale to "outer" size close to door opening (slightly bigger looks fine)
    const frameClone = frameScene;
    fitToSize(frameClone, doorWidth + 0.1, doorHeight + 0.1, thickness);

    // Panels: each is half the opening width
    const panelW = doorWidth / 2;
    const panelH = doorHeight;
    const panelT = thickness;

    const leftClone = leftScene;
    const rightClone = rightScene;
    fitToSize(leftClone, panelW, panelH, panelT);
    fitToSize(rightClone, panelW, panelH, panelT);

    // Shadows
    [frameClone, leftClone, rightClone].forEach((r) => {
      r.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = castShadow;
          n.receiveShadow = receiveShadow;
        }
      });
    });

    return { frameClone, leftClone, rightClone, panelW, panelH, panelT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameScene, leftScene, rightScene, doorWidth, doorHeight, thickness, castShadow, receiveShadow]);

  // Animation state
  const openAmt = useRef(0);   // 0 = closed, 1 = open
  const targetOpen = useRef(0);

  // Distance check each frame, animate toward target
  const tmpDoorPos = useRef(new THREE.Vector3());
  const tmpPlayer = useRef(new THREE.Vector3());
  const tiltRad = (tiltDeg * Math.PI) / 180;

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    // 1) decide target open/close
    if (playerPosition) {
      groupRef.current.getWorldPosition(tmpDoorPos.current);
      tmpPlayer.current.set(playerPosition[0], playerPosition[1], playerPosition[2]);

      // horizontal distance only (XZ)
      const dx = tmpDoorPos.current.x - tmpPlayer.current.x;
      const dz = tmpDoorPos.current.z - tmpPlayer.current.z;
      const dist = Math.hypot(dx, dz);

      targetOpen.current = dist <= triggerRadius ? 1 : 0;
    }

    // 2) ease openAmt toward target
    const speed = (targetOpen.current > openAmt.current ? 1 / openTime : 1 / closeTime);
    const next = THREE.MathUtils.clamp(
      openAmt.current + (targetOpen.current - openAmt.current) * Math.min(1, dt * speed * 4),
      0, 1
    );
    openAmt.current = next;

    // 3) apply transforms to pivots
    if (leftPivotRef.current && rightPivotRef.current) {
      const slide = (prepared.panelW) * slideFactor; // each panel travels about its own half-width
      leftPivotRef.current.position.x  = -next * slide;
      rightPivotRef.current.position.x =  next * slide;

      // add the subtle diagonal tilt ("/" look)
      leftPivotRef.current.rotation.z  =  next *  tiltRad;
      rightPivotRef.current.rotation.z = -next *  tiltRad;
    }
  });

  // Layout:
  // group
  //  ├─ frame (centered)
  //  ├─ LeftPivot  (origin at seam x=0)
  //  │   └─ leftPanel (offset -panelW/2)
  //  └─ RightPivot (origin at seam x=0)
  //      └─ rightPanel (offset +panelW/2)
  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} name="SlidingDoorGLB">
      <primitive object={prepared.frameClone} name="Door_Frame" />

      <group ref={leftPivotRef} name="LeftPivot">
        <group position={[-prepared.panelW / 2, 0, 0]} name="LeftPanel">
          <primitive object={prepared.leftClone} />
        </group>
      </group>

      <group ref={rightPivotRef} name="RightPivot">
        <group position={[ prepared.panelW / 2, 0, 0]} name="RightPanel">
          <primitive object={prepared.rightClone} />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload("/models/door frame.glb");
useGLTF.preload("/models/door panel l.glb");
useGLTF.preload("/models/door panel r.glb");
