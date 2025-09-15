// src/map/materials.js
import * as THREE from "three";

// sensible defaults
const defaults = {
    wall: { color: "#3b4a61", roughness: 0.9, metalness: 0.0 },
    floor: { color: "#212833", roughness: 1.0, metalness: 0.0 },
    roof: { color: "#1a2029", roughness: 0.9, metalness: 0.0 },
};

const cache = new Map();

export function getMaterial(kind, spec) {
    const base = defaults[kind] || {};
    const opt = { ...base, ...(spec || {}) }; // spec can come from JSON/editor

    const key = JSON.stringify({ kind, ...opt });
    if (cache.has(key)) return cache.get(key);

    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(opt.color ?? base.color ?? "#ffffff"),
        roughness: opt.roughness ?? base.roughness ?? 1,
        metalness: opt.metalness ?? base.metalness ?? 0,
        emissive: new THREE.Color(opt.emissive ?? 0x000000),
        opacity: opt.opacity ?? 1,
        transparent: opt.transparent ?? (opt.opacity != null && opt.opacity < 1),
        wireframe: !!opt.wireframe,
    });

    cache.set(key, mat);
    return mat;
}
