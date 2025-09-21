// src/world/WorldGLB.jsx
import React, { useLayoutEffect, useMemo, useEffect, Suspense } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { setStaticAABBs } from "../systems/collision";

export const WORLD_GLB = {
    enabled: true,
    url: "/models/world.glb",
    position: [0, 0, 0],
    rotation: [0, 0, 0],     // radians: [x, y, z]
    scale: 1,
    showColliderDebug: false,
    // NEW (optional): bake colliders from "all" meshes or only "tagged" blockers
    bakeColliders: "all",     // "all" | "tagged"
    // NEW (optional): also place cam blockers on a dedicated layer for fast raycasts
    blockerLayer: 2
};

export default function WorldGLB(props) {
    return (
        <Suspense fallback={null}>
            <WorldGLBInner {...WORLD_GLB} {...props} />
        </Suspense>
    );
}

function WorldGLBInner({
    url = "/models/world.glb",
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
    receiveShadows = true,
    castShadows = true,
    showColliderDebug = false,
    bakeColliders = "all",  // "all" | "tagged"
    blockerLayer = 2,
    ...rest
}) {
    const gltf = useLoader(
        GLTFLoader,
        url,
        (loader) => {
            const draco = new DRACOLoader();
            draco.setDecoderPath("/draco/");
            loader.setDRACOLoader(draco);
            loader.setMeshoptDecoder(MeshoptDecoder);
        }
    );

    // Clone once so we can mutate flags safely
    const cloned = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

    // Tag camera blockers on the GLB meshes
    useLayoutEffect(() => {
        const nameIsBlocker = (name) => {
            const n = (name || "").toLowerCase();
            // Tweak this list to your naming scheme
            return (
                n.includes("wall") ||
                n.includes("floor") ||
                n.includes("door") ||        // covers doorframe / door_panel names
                n.includes("frame") ||
                n.includes("roof") ||
                n.includes("ceiling") ||
                n.includes("column") ||
                n.includes("pillar")
            );
        };

        cloned.traverse((o) => {
            if (!(o.isMesh || o.isSkinnedMesh)) return;

            // Render flags
            o.castShadow = castShadows;
            o.receiveShadow = receiveShadows;
            o.frustumCulled = true;

            // Keep author-tagged blockers (from Blender → glTF extras → userData)
            const authored = o.userData?.camBlocker === true;

            // Heuristic by name if not authored
            if (authored || nameIsBlocker(o.name)) {
                o.userData.camBlocker = true;
                // Optional: put blockers on a dedicated layer
                if (typeof blockerLayer === "number" && blockerLayer >= 0) {
                    o.layers?.set?.(blockerLayer);
                }
            }
        });
    }, [cloned, castShadows, receiveShadows, blockerLayer]);

    // 🔒 Bake AABBs for movement collision
    // - "all":  from every mesh (original behavior)
    // - "tagged": only from meshes flagged camBlocker (or authored staticCollider)
    const aabbs = useMemo(() => {
        if (!cloned) return [];
        const groupMatrix = new THREE.Matrix4();
        const pos = new THREE.Vector3(...position);
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
        const scl = new THREE.Vector3(scale, scale, scale);
        groupMatrix.compose(pos, quat, scl);

        const boxes = [];
        const tmp = new THREE.Box3();

        cloned.updateMatrixWorld(true);
        cloned.traverse((obj) => {
            if (!(obj.isMesh || obj.isSkinnedMesh)) return;

            if (bakeColliders === "tagged") {
                const isTagged = obj.userData?.camBlocker === true || obj.userData?.staticCollider === true;
                if (!isTagged) return;
            }
            tmp.setFromObject(obj);
            if (tmp.isEmpty()) return;

            const worldBox = tmp.clone().applyMatrix4(groupMatrix);
            const eps = 0.01;
            boxes.push({
                minX: worldBox.min.x - eps,
                maxX: worldBox.max.x + eps,
                minZ: worldBox.min.z - eps,
                maxZ: worldBox.max.z + eps,
            });
        });
        return boxes;
    }, [cloned, position, rotation, scale, bakeColliders]);

    // Publish to collision registry
    useEffect(() => {
        setStaticAABBs(aabbs);
        // console.log("[WorldGLB] baked boxes:", aabbs.length);
    }, [aabbs]);

    return (
        <group position={position} rotation={rotation} scale={scale} {...rest}>
            <primitive object={cloned} />
            {showColliderDebug &&
                aabbs.map((b, i) => (
                    <mesh key={i} position={[(b.minX + b.maxX) / 2, 0.02, (b.minZ + b.maxZ) / 2]}>
                        <boxGeometry args={[b.maxX - b.minX, 0.06, b.maxZ - b.minZ]} />
                        <meshBasicMaterial wireframe transparent opacity={0.6} />
                    </mesh>
                ))}
        </group>
    );
}
