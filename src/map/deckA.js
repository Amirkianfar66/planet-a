// src/map/deckA.js
// Exports: FLOOR, WALL_THICKNESS, WALL_HEIGHT, OUTSIDE_AREA, STATION_AREA,
//          ROOMS, walls, wallAABBs, FLOORS, ROOFS, ROOM_BY_KEY, MEETING_ROOM_AABB

import * as RT from "./roomTools";
import authored from "./defaultMap.json"; // ensure this exists

// ---- constants (fallbacks if roomTools doesn't export them)
export const WALL_THICKNESS = RT.WALL_THICKNESS ?? 0.6;
export const WALL_HEIGHT = RT.DEFAULT_WALL_HEIGHT ?? 2.4;
const DEFAULT_SLAB_THICKNESS = RT.DEFAULT_SLAB_THICKNESS ?? 0.12;

// Keep legacy floor bounds if other code relies on them.
export const FLOOR = { w: 40, d: 24 };

// Optional legacy areas for tinting etc.
export const OUTSIDE_AREA = { x: -FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };
export const STATION_AREA = { x: FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };

// ---------- utils ----------
function computeAABBs(arr) {
    return (arr || []).map((w) => ({
        minX: w.x - w.w / 2,
        maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2,
        maxZ: w.z + w.d / 2,
    }));
}

function normalizeMap(m) {
    const map = m && typeof m === "object" ? m : {};
    map.rooms = Array.isArray(map.rooms) ? map.rooms : [];
    map.walls = Array.isArray(map.walls) ? map.walls : [];
    map.wallAABBs = Array.isArray(map.wallAABBs) ? map.wallAABBs : [];

    // generate missing AABBs for walls
    if (map.wallAABBs.length !== map.walls.length) {
        map.wallAABBs = computeAABBs(map.walls);
    }

    // normalize floors/roofs (may be absent in your JSON)
    map.floors = Array.isArray(map.floors) ? map.floors : [];
    map.roofs = Array.isArray(map.roofs) ? map.roofs : [];
    return map;
}

// Prefer localStorage draft during dev (from the editor), else use checked-in JSON.
function getAuthoredMap() {
    try {
        if (typeof window !== "undefined") {
            const raw = localStorage.getItem("mapEditorDraft_v2");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.rooms)) return normalizeMap(parsed);
            }
        }
    } catch { /* ignore */ }
    return normalizeMap(authored);
}

const MAP = getAuthoredMap();

// If you still want hard outer boundary walls, add them here:
const baseWalls = [];

// ---------- base exports ----------
export const ROOMS = MAP.rooms;
export const walls = [...baseWalls, ...MAP.walls];
export const wallAABBs = (MAP.wallAABBs && MAP.wallAABBs.length === MAP.walls.length)
    ? MAP.wallAABBs
    : computeAABBs(walls);

// ---------- generate FLOORS / ROOFS if not provided ----------
function synthesizeSlabs(rooms) {
    const floors = [];
    const roofs = [];
    for (const r of rooms) {
        const t = Math.max(0.01, r.roofT ?? DEFAULT_SLAB_THICKNESS);
        const floorY = Number.isFinite(r.floorY) ? r.floorY : 0;
        const wallH = Number.isFinite(r.h) ? r.h : WALL_HEIGHT;

        // floor centered at (x, floorY + t/2, z)
        floors.push({ x: r.x, y: floorY + t / 2, z: r.z, w: r.w, d: r.d, t });

        // roof centered at (x, floorY + wallH - t/2, z)
        roofs.push({ x: r.x, y: floorY + wallH - t / 2, z: r.z, w: r.w, d: r.d, t });
    }
    return { floors, roofs };
}

const synthesized = synthesizeSlabs(ROOMS);
export const FLOORS = (MAP.floors && MAP.floors.length) ? MAP.floors : synthesized.floors;
export const ROOFS = (MAP.roofs && MAP.roofs.length) ? MAP.roofs : synthesized.roofs;

// Handy lookups
export const ROOM_BY_KEY = Object.fromEntries(ROOMS.map((r) => [r.key, r]));

// Rotation-aware AABB for a room rectangle (uses rotDeg)
function aabbForRoom(room) {
    if (!room) return null;
    const ang = ((room.rotDeg || 0) * Math.PI) / 180;
    const hx = (room.w || 0) / 2;
    const hz = (room.d || 0) / 2;
    const ex = Math.abs(hx * Math.cos(ang)) + Math.abs(hz * Math.sin(ang));
    const ez = Math.abs(hx * Math.sin(ang)) + Math.abs(hz * Math.cos(ang));
    return { minX: room.x - ex, maxX: room.x + ex, minZ: room.z - ez, maxZ: room.z + ez };
}

// Meeting room by key/type/name
function findMeetingRoom(rooms) {
    const lower = (s) => (s || "").toLowerCase();
    return rooms.find((r) =>
        lower(r.key) === "meeting_room" ||
        lower(r.type) === "meeting_room" ||
        lower(r.name).includes("meeting")
    ) || null;
}

export const MEETING_ROOM_AABB =
    aabbForRoom(ROOM_BY_KEY["meeting_room"] || findMeetingRoom(ROOMS));
