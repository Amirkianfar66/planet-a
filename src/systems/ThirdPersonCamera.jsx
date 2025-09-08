import React, { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer } from "playroomkit";

export default function ThirdPersonCamera() {
  const { camera } = useThree();
  const curPos = useRef(new THREE.Vector3(0, 5, 8));
  const lookAt = useRef(new THREE.Vector3());
  useFrame(() => {
    const p = myPlayer();
    const x = Number(p.getState("x") ?? 0);
    const y = Number(p.getState("y") ?? 0);
    const z = Number(p.getState("z") ?? 0);
    const yaw = Number(p.getState("yaw") ?? 0);

    const height = 3.0, distance = 6.0;
    const behind = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(distance);
    const desired = new THREE.Vector3(x, y + 1.2 + height, z).add(behind);

    curPos.current.lerp(desired, 0.12);
    camera.position.copy(curPos.current);

    lookAt.current.set(x, y + 1.2, z);
    camera.lookAt(lookAt.current);
  });
  return null;
}
