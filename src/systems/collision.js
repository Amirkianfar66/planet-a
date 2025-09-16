//src/systems/collision.js
// Simple global registry for extra (dynamic) AABBs, e.g. baked from GLB.
// Each AABB is { minX, maxX, minZ, maxZ } in world coords.
const EXTRA_AABBS = [];

// Replace all current extra AABBs in one shot
export function setStaticAABBs(aabbs = []) {
    EXTRA_AABBS.length = 0;
    for (const b of (Array.isArray(aabbs) ? aabbs : [])) {
        if (
            Number.isFinite(b.minX) && Number.isFinite(b.maxX) &&
            Number.isFinite(b.minZ) && Number.isFinite(b.maxZ)
        ) EXTRA_AABBS.push(b);
    }
}

// Append one box
export function addStaticAABB(box) {
    if (
        box && Number.isFinite(box.minX) && Number.isFinite(box.maxX) &&
        Number.isFinite(box.minZ) && Number.isFinite(box.maxZ)
    ) EXTRA_AABBS.push(box);
}

// Snapshot (read-only)
export function getStaticAABBs() {
    return EXTRA_AABBS;
}
