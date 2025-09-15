// src/map/roomTools.js (v2: edges + rotation + heights)

export const WALL_THICKNESS = 0.6;
export const DEFAULT_WALL_HEIGHT = 2.4;

const SIDES = ["N", "E", "S", "W"];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const segLen = (total, gap) => Math.max(0, (total - gap) / 2);

export function makeRoom({ key, name, x, z, w, d, rotDeg = 0, h = DEFAULT_WALL_HEIGHT, edges } = {}) {
    const base = {
        key: key || `room_${Math.random().toString(36).slice(2, 7)}`,
        name: name || "Room",
        x: Number(x) || 0,
        z: Number(z) || 0,
        w: Math.max(0.5, Number(w) || 4),
        d: Math.max(0.5, Number(d) || 3),
        rotDeg: Number(rotDeg) || 0,           // rotation (preview)
        h: Math.max(0.5, Number(h) || DEFAULT_WALL_HEIGHT),
        edges: edges && Array.isArray(edges)
            ? edges
            : SIDES.map((s) => ({
                id: `${key || "room"}_${s}`,
                side: s,          // 'N'|'E'|'S'|'W'
                present: true,    // wall exists?
                door: null,       // { width, offset } or null
                h: null,          // per-edge height override
            })),
    };
    base.edges = base.edges.map((e, i) => ({ ...e, id: e.id || `${base.key}_${e.side}_${i}` }));
    return base;
}

// Build wall segments in LOCAL room space for preview/handles.
export function wallsForRoomLocal(room, t = WALL_THICKNESS) {
    const { w, d } = room;
    const out = [];

    for (const e of room.edges) {
        if (!e.present) continue;
        const side = e.side;
        const useH = Math.max(0.1, Number(e.h || room.h || DEFAULT_WALL_HEIGHT));
        const doorW = clamp(Number(e.door?.width) || 0, 0, (side === "N" || side === "S") ? w - 0.2 : d - 0.2);
        const offsetLimit = (side === "N" || side === "S") ? (w - doorW) / 2 : (d - doorW) / 2;
        const offset = clamp(Number(e.door?.offset) || 0, -offsetLimit, offsetLimit);

        if (side === "N" || side === "S") {
            const zc = side === "N" ? -d / 2 : d / 2;
            if (doorW > 0.001) {
                const half = segLen(w, doorW);
                if (half > 0.0001) {
                    out.push({ x: -(doorW / 2 + half / 2) + offset, z: zc, w: half, d: t, h: useH, side, id: e.id });
                    out.push({ x: (doorW / 2 + half / 2) + offset, z: zc, w: half, d: t, h: useH, side, id: e.id });
                }
            } else {
                out.push({ x: 0, z: zc, w, d: t, h: useH, side, id: e.id });
            }
        } else {
            const xc = side === "W" ? -w / 2 : w / 2;
            if (doorW > 0.001) {
                const half = segLen(d, doorW);
                if (half > 0.0001) {
                    out.push({ x: xc, z: -(doorW / 2 + half / 2) + offset, w: t, d: half, h: useH, side, id: e.id });
                    out.push({ x: xc, z: (doorW / 2 + half / 2) + offset, w: t, d: half, h: useH, side, id: e.id });
                }
            } else {
                out.push({ x: xc, z: 0, w: t, d, h: useH, side, id: e.id });
            }
        }
    }
    return out;
}

// Rotate a local (x,z) by radians
function rot2D(x, z, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return { x: x * c - z * s, z: x * s + z * c };
}

// Bake to WORLD coordinates for export/runtime
export function wallsForRoomWorld(room, t = WALL_THICKNESS) {
    const local = wallsForRoomLocal(room, t);
    const ang = (Number(room.rotDeg) || 0) * Math.PI / 180;
    return local.map((w) => {
        const p = rot2D(w.x, w.z, ang);
        return { x: room.x + p.x, z: room.z + p.z, w: w.w, d: w.d, h: w.h, side: w.side, id: w.id, room: room.key, rotDeg: room.rotDeg };
    });
}

// Back-compat: if any old code imports wallsForRoom, give them world baked walls
export const wallsForRoom = wallsForRoomWorld;

export function packMap(rooms) {
    const walls = rooms.flatMap((r) => wallsForRoomWorld(r));
    const wallAABBs = walls.map((w) => ({
        minX: w.x - w.w / 2,
        maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2,
        maxZ: w.z + w.d / 2,
    }));
    return { rooms, walls, wallAABBs };
}

// persistence
const LS_KEY = "mapEditorDraft_v2";
export function saveDraft(rooms) {
    localStorage.setItem(LS_KEY, JSON.stringify(rooms));
}
export function loadDraft() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.map((r) => makeRoom(r));
    } catch { }
    return null;
}
