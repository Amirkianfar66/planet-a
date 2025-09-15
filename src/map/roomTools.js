// src/map/roomTools.js
// Utilities for rooms, walls, doors and export packing.

export const WALL_THICKNESS = 0.6;
export const DEFAULT_WALL_HEIGHT = 2.4;
export const DEFAULT_SLAB_THICKNESS = 0.12;

// ---- helpers
const sides4 = ["N", "E", "S", "W"];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rad2deg(r) { return (r * 180) / Math.PI; }
function deg2rad(d) { return (d * Math.PI) / 180; }

// Ensure a room has all required fields
export function makeRoom(init = {}) {
    const r = {
        key: init.key || "",
        name: init.name || "Room",
        type: init.type || "",
        x: Number(init.x ?? 0),
        z: Number(init.z ?? 0),
        w: Math.max(0.1, Number(init.w ?? 4)),
        d: Math.max(0.1, Number(init.d ?? 3)),
        rotDeg: Number(init.rotDeg ?? 0),
        h: Math.max(0.5, Number(init.h ?? DEFAULT_WALL_HEIGHT)),
        floorY: Number(init.floorY ?? 0),
        roofT: Math.max(0.01, Number(init.roofT ?? DEFAULT_SLAB_THICKNESS)),
        hasFloor: init.hasFloor !== false,
        hasRoof: init.hasRoof !== false,
        // in makeRoom:
        wallT: init.wallT != null ? Math.max(0.01, Number(init.wallT)) : null,

        exported: init.exported !== false,
        wallMat: init.wallMat || null,
        floorMat: init.floorMat || null,
        roofMat: init.roofMat || null,
        edges: Array.isArray(init.edges) ? init.edges.map(e => ({
            id: e.id || `${init.key || "room"}_${e.side || "?"}`,
            side: e.side,
            present: e.present !== false,
            door: e.door ? {
                width: Math.max(0, Number(e.door.width || 0)),
                offset: Number(e.door.offset || 0),
                height: Math.max(0, Number(e.door.height || 2.1)),
                panels: Math.max(1, Math.min(2, Number(e.door.panels || 2))),
                type: e.door.type || "sliding",
                open: clamp(Number(e.door.open ?? 0), 0, 1),
            } : null,
            h: e.h ? Math.max(0.5, Number(e.h)) : null,
            t: e.t ? Math.max(0.01, Number(e.t)) : null,
            mat: e.mat || null,
        })) : sides4.map((s) => ({
            id: `${init.key || "room"}_${s}`,
            side: s, present: true, door: null, h: null, mat: null
        })),
    };
    return r;
}

/**
 * Local walls (room space, before applying room rotation).
 * Returns segments like:
 *  { x, z, rotY, len, thickness, h, side, mat } for solid wall
 *  { ... , doorSlot: { width, height, panels, type, open } } for the opening marker
 */
// --- edge helpers ---
const SIDES = ["N", "E", "S", "W"];

function makeBlankEdge(room, side) {
    return {
        id: `${(room.key || room.name || "room")}_${side}`,
        side,
        present: true,
        door: null,   // { width, offset, type, panels, open } optional
        h: null,      // edge height override
        t: null,      // edge thickness override
        mat: null,    // { color } optional
    };
}

/**
 * Ensure we always have exactly one edge for each side (N/E/S/W).
 * Preserves any provided fields on existing edges.
 */
function ensureEdges(room) {
    const bySide = new Map((room.edges || []).map(e => [e.side, { ...e }]));
    const edges = SIDES.map(side => {
        const e = bySide.get(side) || makeBlankEdge(room, side);
        e.side = side;
        e.present = e.present !== false;             // default present = true
        return e;
    });
    return edges;
}

export function wallsForRoomLocal(r, fallbackT = WALL_THICKNESS) {
    const edges = ensureEdges(r);
    const H = r.h ?? DEFAULT_WALL_HEIGHT;
    const roomT = r.wallT ?? fallbackT;

    const out = [];
    const Lx = r.w;
    const Lz = r.d;

    for (const e of edges) {
        if (!e.present) continue;

        const t = Math.max(0.001, e.t ?? roomT);
        const isNS = e.side === "N" || e.side === "S";
        const L = isNS ? Lx : Lz;        // along-edge length
        const half = L / 2;

        const hasDoor = !!(e.door && e.door.width > 0);
        const W = e.door?.width ?? 0;    // door width along the edge axis
        const off = e.door?.offset ?? 0; // door center offset along the edge axis

        const addSeg = (centerAlong, segLen) => {
            if (segLen <= 0.0001) return;
            if (isNS) {
                // N/S run along X -> width = segLen, depth = t
                out.push({
                    side: e.side,
                    x: centerAlong,
                    z: e.side === "N" ? -Lz / 2 : Lz / 2,
                    w: segLen,
                    d: t,
                    h: e.h ?? H,
                });
            } else {
                // E/W run along Z -> width = t, depth = segLen
                out.push({
                    side: e.side,
                    x: e.side === "W" ? -Lx / 2 : Lx / 2,
                    z: centerAlong,
                    w: t,
                    d: segLen,
                    h: e.h ?? H,
                });
            }
        };

        if (!hasDoor) {
            addSeg(0, L);
        } else {
            const leftLen = Math.max(0, (off - W / 2) - (-half));
            const rightLen = Math.max(0, half - (off + W / 2));
            const leftCtr = -half + leftLen / 2;
            const rightCtr = half - rightLen / 2;
            if (leftLen > 0) addSeg(leftCtr, leftLen);
            if (rightLen > 0) addSeg(rightCtr, rightLen);
        }
    }

    return out; // local coords; your <group rotation=...> handles rotDeg
}




// ---- packing (export)

// ---- packing (export)

function worldFromLocal(room, lx, lz) {
    const a = deg2rad(room.rotDeg || 0);
    const ca = Math.cos(a), sa = Math.sin(a);
    return {
        x: room.x + (lx * ca - lz * sa),
        z: room.z + (lx * sa + lz * ca),
    };
}

/**
 * Build oriented walls (with room.rotDeg) in world space + AABBs.
 * Works with wallsForRoomLocal that returns { x, z, w, d, h, side }.
 */
export function packMap(rooms) {
    const walls = [];
    const wallAABBs = [];

    rooms.forEach((r) => {
        const locals = wallsForRoomLocal(r, WALL_THICKNESS);
        const baseDeg = r.rotDeg || 0;

        locals.forEach((seg, idx) => {
            // local center -> world
            const p = worldFromLocal(r, seg.x, seg.z);

            // Our local segment is axis-aligned in ROOM space:
            // N/S edges: long along local X => len = seg.w, thickness = seg.d
            // E/W edges: long along local Z => len = seg.d, thickness = seg.w
            const isNS = seg.side === "N" || seg.side === "S";
            const len = isNS ? seg.w : seg.d;
            const thickness = isNS ? seg.d : seg.w;

            // World rotation: no per-segment local rotation — just the room’s
            const rotDeg = ((baseDeg % 360) + 360) % 360;

            // Compute world-space AABB of an oriented rectangle (len x thickness) rotated by rotDeg
            const a = deg2rad(rotDeg);
            const ca = Math.cos(a), sa = Math.sin(a);
            const hx = len / 2;
            const hz = thickness / 2;
            const ex = Math.abs(hx * ca) + Math.abs(hz * sa);
            const ez = Math.abs(hx * sa) + Math.abs(hz * ca);

            walls.push({
                x: p.x,
                z: p.z,
                w: isNS ? len : thickness,  // width (X) for your renderer, same as local
                d: isNS ? thickness : len,  // depth (Z)
                h: seg.h,
                side: seg.side,
                rotDeg,
                id: `${r.key || "room"}_${seg.side}_${idx}`,
                room: r.key || "",
                mat: seg.mat || r.wallMat || null,
            });

            wallAABBs.push({
                minX: p.x - ex, maxX: p.x + ex,
                minZ: p.z - ez, maxZ: p.z + ez,
            });
        });
    });

    return { rooms, walls, wallAABBs };
}


// ---- simple local draft helpers (rooms only, legacy)
const LS_KEY_ROOMS = "mapEditorRooms_v1";
export function saveDraft(rooms) {
    try { localStorage.setItem(LS_KEY_ROOMS, JSON.stringify(rooms)); } catch { }
}
export function loadDraft() {
    try {
        const raw = localStorage.getItem(LS_KEY_ROOMS);
        if (!raw) return null;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.map(makeRoom) : null;
    } catch { return null; }
}
