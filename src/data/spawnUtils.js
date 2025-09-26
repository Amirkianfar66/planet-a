// src/data/spawnUtils.js
import { OUTSIDE_AREA, pointInRect, clampToRect } from "../map/deckA.js";

export const RANDOM_OUTDOOR_TYPES = new Set(["food", "poison_food", "cure_red", "cure_blue"]);

const OUT_MARGIN = 1.0;
const dist2 = (a, b) => {
    const dx = a.x - b.x, dz = a.z - b.z;
    return dx * dx + dz * dz;
};

function ensureOutdoorPos(x = 0, z = 0) {
    if (pointInRect(OUTSIDE_AREA, x, z, OUT_MARGIN)) return { x, z };
    const c = clampToRect(OUTSIDE_AREA, x, z, OUT_MARGIN);
    return { x: c.x, z: c.z };
}

// Deterministic RNG (mulberry32) so a given seed gives the same layout
function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Compute outdoor positions ≥ minDist apart for the given items (order matters).
 * Returns a Map<item.id, {x,z}>.
 */
export function computeOutdoorSpread(items, { minDist = 10, seed = Date.now() } = {}) {
    const rnd = mulberry32(Number(seed) >>> 0);
    const result = new Map();
    const placed = [];
    const minD2 = minDist * minDist;

    // precompute usable rect (minus margin)
    const w = Math.max(0, Number(OUTSIDE_AREA.w || 0) - OUT_MARGIN * 2);
    const d = Math.max(0, Number(OUTSIDE_AREA.d || 0) - OUT_MARGIN * 2);
    const originX = (OUTSIDE_AREA.x || 0) - w / 2;
    const originZ = (OUTSIDE_AREA.z || 0) - d / 2;

    for (const it of items) {
        let chosen = null;
        for (let tries = 0; tries < 300; tries++) {
            const x = originX + rnd() * w;
            const z = originZ + rnd() * d;
            const p = ensureOutdoorPos(x, z);
            let ok = true;
            for (const q of placed) {
                if (dist2(p, q) < minD2) { ok = false; break; }
            }
            if (ok) { chosen = p; break; }
        }
        if (!chosen) {
            // last-ditch: clamp whatever coords the item had
            chosen = ensureOutdoorPos(Number(it.x || 0), Number(it.z || 0));
        }
        placed.push(chosen);
        result.set(it.id, chosen);
    }
    return result;
}
