import React, { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { myPlayer } from "playroomkit";

export default function ThirdPersonCamera({
    height = 3.0,
    distance = 7,
    shoulder = 0.3,
    lerp = 0.12,
    camRadius = 0.35,
    ignoreNear = 0.6,
    lookAhead = 1,  // NEW: look this many meters ahead of the player
    fov = 40,         // NEW: narrower FOV (default three.js is 50)
}) {
    const { camera, scene } = useThree();
    const curPos = useRef(new THREE.Vector3(0, 5, 8));
    const lookAt = useRef(new THREE.Vector3());
    const ray = useRef(new THREE.Raycaster());
    const blockers = useRef([]);

    // Apply FOV once (and whenever prop changes)
    useEffect(() => {
        if (camera.isPerspectiveCamera && camera.fov !== fov) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
    }, [camera, fov]);

    // Collect meshes explicitly tagged as camera blockers
    useEffect(() => {
        const collect = () => {
            const arr = [];
            scene.traverse((o) => {
                if (o?.isMesh && o.userData?.camBlocker === true) arr.push(o);
            });
            blockers.current = arr;
        };
        collect();
        const iv = setInterval(collect, 1500);
        return () => clearInterval(iv);
    }, [scene]);

    useFrame(() => {
        const p = myPlayer();
        const x = Number(p.getState("x") ?? 0);
        const y = Number(p.getState("y") ?? 0);
        const z = Number(p.getState("z") ?? 0);
        const yaw = Number(p.getState("yaw") ?? 0);

        // Player anchor (head)
        const head = new THREE.Vector3(x, y + 1.2, z);
        const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

        // Desired camera spot (behind+above+shoulder)
        const desired = head
            .clone()
            .add(new THREE.Vector3(0, height, 0))
            .add(fwd.clone().multiplyScalar(-distance))
            .add(right.clone().multiplyScalar(shoulder));

        // Raycast to avoid walls behind player
        const dir = desired.clone().sub(head);
        const len = Math.max(0.001, dir.length());
        dir.normalize();

        const rc = ray.current;
        rc.ray.origin.copy(head.clone().add(dir.clone().multiplyScalar(ignoreNear)));
        rc.ray.direction.copy(dir);
        rc.far = len;

        let camPos = desired;
        const hits = rc.intersectObjects(blockers.current, true);
        const hit = hits.find((h) => h.distance > ignoreNear + 0.01);
        if (hit) {
            const safeDist = Math.max(ignoreNear, hit.distance - camRadius);
            camPos = head.clone().add(dir.clone().multiplyScalar(safeDist));
        }

        // Smooth camera movement
        curPos.current.lerp(camPos, lerp);
        camera.position.copy(curPos.current);

        // Aim slightly ahead so you see more forward
        const aim = head.clone()
            .add(fwd.clone().multiplyScalar(lookAhead)); // forward lead
        lookAt.current.copy(aim);
        camera.lookAt(lookAt.current);
    });

    return null;
}
