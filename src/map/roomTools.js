// ==========================================
// src/map/roomTools.js
// Helpers for declarative rooms + auto walls
// ==========================================


export const WALL_THICKNESS = 0.6; // keep in sync with deckA


export function makeRoom({ key, name, x, z, w, d, door = {} }) {
    return {
        key,
        name,
        x: Number(x) || 0,
        z: Number(z) || 0,
        w: Math.max(0.5, Number(w) || 1),
        d: Math.max(0.5, Number(d) || 1),
        door: {
            side: door.side || "E", // 'N'|'S'|'E'|'W'
            width: Math.max(0.4, Number(door.width) || 1.2),
            offset: Number(door.offset) || 0, // shift along wall axis
        },
    };
}


export function wallsForRoom(room, t = WALL_THICKNESS) {
    const { x, z, w, d, door = {} } = room;
    const side = door.side || "E";
    const width = Math.max(0.4, Math.min(side === "N" || side === "S" ? w - 0.2 : d - 0.2, Number(door.width) || 1.2));
    const offset = Number(door.offset) || 0;


    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const seg = (total, gap) => Math.max(0, (total - gap) / 2);


    const walls = [];


    // Horizontal runs (North/South)
    if (side === "N" || side === "S") {
        const zc = side === "N" ? z - d / 2 : z + d / 2;
        const halfSeg = seg(w, width);
        const shift = clamp(offset, -(w - width) / 2, (w - width) / 2);


        if (halfSeg > 0.0001)
            walls.push({ x: x - (width / 2 + halfSeg / 2) + shift, z: zc, w: halfSeg, d: t });
        if (halfSeg > 0.0001)
            walls.push({ x: x + (width / 2 + halfSeg / 2) + shift, z: zc, w: halfSeg, d: t });
    } else {
        walls.push({ x, z: z - d / 2, w, d: t });
        walls.push({ x, z: z + d / 2, w, d: t });
    }


    // Vertical runs (East/West)
    if (side === "E" || side === "W") {
        const xc = side === "W" ? x - w / 2 : x + w / 2;
        const halfSeg = seg(d, width);
        const shift = clamp(offset, -(d - width) / 2, (d - width) / 2);


        if (halfSeg > 0.0001)
            walls.push({ x: xc, z: z - (width / 2 + halfSeg / 2) + shift, w: t, d: halfSeg });
        if (halfSeg > 0.0001)
            walls.push({ x: xc, z: z + (width / 2 + halfSeg / 2) + shift, w: t, d: halfSeg });
    } else {
        walls.push({ x: x - w / 2, z, w: t, d });
        walls.push({ x: x + w / 2, z, w: t, d });
    }


    return walls;
}


export function packMap(rooms) {
    const walls = rooms.flatMap((r) => wallsForRoom(r));
    const wallAABBs = walls.map((w) => ({
        minX: w.x - w.w / 2,
        maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2,
        maxZ: w.z + w.d / 2,
    }));
    return { rooms, walls, wallAABBs };
}


// --- persistence ---
const LS_KEY = "mapEditorDraft";
export function saveDraft(rooms) {
    localStorage.setItem(LS_KEY, JSON.stringify(rooms));
}
export function loadDraft() {
}