// src/map/deckA.js
// Map packer + runtime exports. Now door entries also carry glbUrl/clipName so
// <SlidingDoor> can load the animated model (/models/door.glb) directly.

import * as RT from "./roomTools";
import authored from "./defaultMap.json";

// Optional: export a door component for GameCanvas if you want to render directly from here
export { SlidingDoor as Door3D } from "../dev/SlidingDoorPreview";

export const WALL_THICKNESS = RT.WALL_THICKNESS ?? 0.6;
export const WALL_HEIGHT = RT.DEFAULT_WALL_HEIGHT ?? 3;
const DEFAULT_SLAB_THICKNESS = RT.DEFAULT_SLAB_THICKNESS ?? 0.12;

const DEFAULT_DOOR_WIDTH = 4.5;     // ← requested
const DEFAULT_DOOR_THICKNESS = 0.3; // ← requested
export const DEFAULT_DOOR_GLB = { url: "/models/door.glb", clipName: "Open" };

export const FLOOR = { w: 200, d: 200 };
export const OUTSIDE_AREA = { x: -FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };
export const STATION_AREA = { x: FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };

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
    if (map.wallAABBs.length !== map.walls.length) map.wallAABBs = computeAABBs(map.walls);
    map.floors = Array.isArray(map.floors) ? map.floors : [];
    map.roofs = Array.isArray(map.roofs) ? map.roofs : [];
    map.doors = Array.isArray(map.doors) ? map.doors : []; // editor-baked door centers
    return map;
}

function getAuthoredMap() {
    try {
        if (typeof window !== "undefined") {
            const raw3 = localStorage.getItem("mapEditorDraft_v3");
            if (raw3) {
                const p3 = JSON.parse(raw3);
                if (p3 && Array.isArray(p3.rooms)) return normalizeMap(p3);
            }
            const raw2 = localStorage.getItem("mapEditorDraft_v2");
            if (raw2) {
                const p2 = JSON.parse(raw2);
                if (p2 && Array.isArray(p2.rooms)) return normalizeMap(p2);
            }
        }
    } catch { }
    return normalizeMap(authored);
}
const MAP = getAuthoredMap();

// Rooms
export const ROOMS = (MAP.rooms || []).map((r) => RT.makeRoom(r));
export const ROOM_BY_KEY = Object.fromEntries(ROOMS.map((r) => [r.key, r]));
// ADD:
export const ROOM_KEYS = Object.freeze(Object.keys(ROOM_BY_KEY || {}));

export function isValidRoomKey(key) {
    return ROOM_KEYS.includes(String(key));
}

export function roomCenter(roomKey) {
    const r = ROOM_BY_KEY[roomKey];
    return r ? { x: r.x, y: Number(r.floorY ?? 0), z: r.z } : null;
}

export function roomKeyAt(x, z) {
    const r = findRoomAtPoint(x, z);
    return r?.key ?? null;
}

// Handy for randomized spawns within a rotated rect room:
export function randomPointInRoom(roomKey, margin = 0.5) {
    const r = ROOM_BY_KEY[roomKey];
    if (!r) return null;

    const rad = ((r.rotDeg || 0) * Math.PI) / 180;
    const hx = Math.max(0, (r.w / 2) - margin);
    const hz = Math.max(0, (r.d / 2) - margin);

    const lx = (Math.random() * 2 - 1) * hx;
    const lz = (Math.random() * 2 - 1) * hz;

    const wx = r.x + (lx * Math.cos(rad) - lz * Math.sin(rad));
    const wz = r.z + (lx * Math.sin(rad) + lz * Math.cos(rad));
    const wy = Number(r.floorY ?? 0);

    return { x: wx, y: wy, z: wz };
}
/// ----------------- Door normalization -----------------
const DEG = Math.PI / 180;
const yawFromSide = (side) => {
    switch ((side || "").toUpperCase()) {
        case "N": return 0;
        case "E": return Math.PI / 2;
        case "S": return Math.PI;
        case "W": return -Math.PI / 2;
        default: return 0;
    }
};

function normalizeDoors(rawDoors, rooms) {
    const byKey = Object.fromEntries(rooms.map((r) => [r.key, r]));
    const out = [];
    for (const d of (rawDoors || [])) {
        const r = d.roomKey ? byKey[d.roomKey] : null;

        const roomRot = Number(r?.rotDeg) ? (r.rotDeg * DEG) : 0;
        const wallH = Number.isFinite(r?.h) ? r.h : WALL_HEIGHT;
        const wallT = Number.isFinite(r?.wallT) ? r.wallT : WALL_THICKNESS;

        // Use side if rotY is 0
        const sideYaw = yawFromSide(d.side);
        const rotY = Number.isFinite(d.rotY)
            ? (Math.abs(d.rotY) > 1e-6 ? d.rotY : sideYaw + roomRot)
            : (sideYaw + roomRot);

        // Door default dims (width default was set to 4.5 elsewhere in your file)
        const width = (Number(d.width) && Number(d.width) > 0) ? Number(d.width) : DEFAULT_DOOR_WIDTH;
        const height = (Number(d.height) && Number(d.height) > 0) ? Number(d.height) : wallH;
        const thickness = Number.isFinite(d.thickness) ? Math.min(0.06, Math.max(0.01, d.thickness)) : Math.min(0.06, wallT * 0.9);
        const panels = Number.isFinite(d.panels) ? Math.max(1, Math.min(2, d.panels | 0)) : 2;
        const open = Number.isFinite(d.open) ? Math.max(0, Math.min(1, Number(d.open))) : 0;

        // >>> IMPORTANT: raise to top of floor slab <<<
        const floorY = Number.isFinite(d.y) ? Number(d.y) : Number(r?.floorY ?? 0);
        const floorT = Math.max(0.01, Number.isFinite(r?.roofT) ? r.roofT : DEFAULT_SLAB_THICKNESS);
        const yTop = floorY + floorT + 1e-4; // tiny epsilon to avoid z-fighting

        out.push({
            id: d.id || `${d.roomKey || "room"}_${d.side || "edge"}_${out.length}`,
            roomKey: r?.key || d.roomKey || null,
            side: d.side || null,
            x: Number(d.x) || 0,
            y: yTop,                // << now sits on top of the floor slab
            z: Number(d.z) || 0,
            rotY,
            width, height, thickness, panels, open,
            offset: Number(d.offset) || 0,
            panelMat: d.panelMat || null,
            frameMat: d.frameMat || null,
            label: d.label || null,
            labelColor: d.labelColor || null,
        });
    }
    return out;
}

export const DOORS = normalizeDoors(MAP.doors, ROOMS);

// ---- Walls (baked or synthesized) ----
let packedWalls = { walls: MAP.walls || [], wallAABBs: MAP.wallAABBs || [] };
if (!packedWalls.walls.length && typeof RT.packMap === "function") {
    try {
        const p = RT.packMap(ROOMS);
        if (p && Array.isArray(p.walls)) {
            packedWalls = { walls: p.walls, wallAABBs: p.wallAABBs || computeAABBs(p.walls) };
        }
    } catch (e) {
        console.warn("packMap failed; using empty walls", e);
    }
}

// ---- Split walls around a single door per edge ----
function splitWallsByDoors(wallsIn, doors, rooms) {
    const byRoomSide = new Map();
    for (const d of (doors || [])) byRoomSide.set(`${d.roomKey}_${(d.side || "").toUpperCase()}`, d);

    const out = [];
    for (const w of (wallsIn || [])) {
        const sideKey = `${w.room}_${(w.side || "").toUpperCase()}`;
        const d = byRoomSide.get(sideKey);

        // Base dims/orientation
        const isH = (w.side === "N" || w.side === "S"); // N/S along X
        const len = isH ? w.w : w.d;
        const thick = isH ? w.d : w.w;
        const half = len / 2;
        const h = Number.isFinite(w.h) ? w.h : WALL_HEIGHT;

        if (!d) {
            out.push({ ...w, w: isH ? len : thick, d: isH ? thick : len, h });
            continue;
        }

        // Door slot (offset along wall axis)
        const slotW = Number.isFinite(d.width) && d.width > 0 ? Number(d.width) : DEFAULT_DOOR_WIDTH;
        const offs = Number.isFinite(d.offset)
            ? Number(d.offset)
            : (isH ? (d.x - w.x) : (d.z - w.z)); // project world to local axis (export is axis-aligned)

        const leftLen = Math.max(0, offs + half - slotW / 2);
        const rightLen = Math.max(0, half - offs - slotW / 2);

        const base = { ...w, h, rotY: w.rotY || 0 };

        // LEFT piece
        if (leftLen > 0.005) {
            out.push({
                ...base,
                id: `${w.id || `${w.room}_${w.side}`}_L`,
                x: isH ? (w.x - (half - leftLen / 2)) : w.x,
                z: isH ? w.z : (w.z - (half - leftLen / 2)),
                w: isH ? leftLen : thick,
                d: isH ? thick : leftLen,
            });
        }
        // RIGHT piece
        if (rightLen > 0.005) {
            out.push({
                ...base,
                id: `${w.id || `${w.room}_${w.side}`}_R`,
                x: isH ? (w.x + (half - rightLen / 2)) : w.x,
                z: isH ? w.z : (w.z + (half - rightLen / 2)),
                w: isH ? rightLen : thick,
                d: isH ? thick : rightLen,
            });
        }
    }
    return out;
}

const wallsWithCuts = splitWallsByDoors(packedWalls.walls, DOORS, ROOMS);
export const walls = wallsWithCuts;
export const wallAABBs = computeAABBs(wallsWithCuts);

// ---- Floors/Roofs (fallback synthesis when not provided) ----
function synthesizeSlabs(rooms) {
    const floors = [], roofs = [];
    for (const r of rooms) {
        const t = Math.max(0.01, r.roofT ?? DEFAULT_SLAB_THICKNESS);
        const floorY = Number.isFinite(r.floorY) ? r.floorY : 0;
        const wallH = Number.isFinite(r.h) ? r.h : WALL_HEIGHT;

        floors.push({ x: r.x, y: floorY + t / 2, z: r.z, w: r.w, d: r.d, t, mat: r.floorMat || null });

        if (r.hasRoof !== false) {
            roofs.push({ x: r.x, y: floorY + wallH - t / 2, z: r.z, w: r.w, d: r.d, t, mat: r.roofMat || null, _roomKey: r.key });
        }
    }
    return { floors, roofs };
}
const synth = synthesizeSlabs(ROOMS);
export const FLOORS = (MAP.floors && MAP.floors.length) ? MAP.floors : synth.floors;
export const ROOFS = (MAP.roofs && MAP.roofs.length) ? MAP.roofs : synth.roofs;

// ---- Queries ----
export function aabbForRoom(room) {
    if (!room) return null;
    const ang = ((room.rotDeg || 0) * Math.PI) / 180, hx = (room.w || 0) / 2, hz = (room.d || 0) / 2;
    const ex = Math.abs(hx * Math.cos(ang)) + Math.abs(hz * Math.sin(ang));
    const ez = Math.abs(hx * Math.sin(ang)) + Math.abs(hz * Math.cos(ang));
    return { minX: room.x - ex, maxX: room.x + ex, minZ: room.z - ez, maxZ: room.z + ez };
}

export function pointInRoom(room, x, z) {
    if (!room) return false;
    const ang = ((room.rotDeg || 0) * Math.PI) / 180, cos = Math.cos(ang), sin = Math.sin(ang);
    const dx = x - room.x, dz = z - room.z;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    return Math.abs(lx) <= room.w / 2 && Math.abs(lz) <= room.d / 2;
}

export function findRoomAtPoint(x, z) { for (const r of ROOMS) if (pointInRoom(r, x, z)) return r; return null; }
export function isPointInsideRoofedRoom(x, z) { const r = findRoomAtPoint(x, z); return !!r && r.hasRoof !== false; }
export function isOutsideByRoof(x, z) { return !isPointInsideRoofedRoom(x, z); }

// Meeting room helper
function findMeetingRoom(rooms) {
    const lower = (s) => (s || "").toLowerCase();
    return rooms.find((r) =>
        lower(r.key) === "meeting_room" ||
        lower(r.type) === "meeting_room" ||
        lower(r.name).includes("meeting")
    ) || null;
}
export const MEETING_ROOM_AABB = aabbForRoom(ROOM_BY_KEY["meeting_room"] || findMeetingRoom(ROOMS));
// --- Rect utils for OUTSIDE_AREA ---
export function pointInRect(rect, x, z, margin = 0) {
    if (!rect) return false;
    return (
        x >= rect.x - rect.w / 2 + margin &&
        x <= rect.x + rect.w / 2 - margin &&
        z >= rect.z - rect.d / 2 + margin &&
        z <= rect.z + rect.d / 2 - margin
    );
}

export function clampToRect(rect, x, z, margin = 0) {
    const minX = rect.x - rect.w / 2 + margin;
    const maxX = rect.x + rect.w / 2 - margin;
    const minZ = rect.z - rect.d / 2 + margin;
    const maxZ = rect.z + rect.d / 2 - margin;
    return { x: Math.min(maxX, Math.max(minX, x)), z: Math.min(maxZ, Math.max(minZ, z)) };
}

export function randomPointInRect(rect, margin = 0.5) {
    const minX = rect.x - rect.w / 2 + margin;
    const maxX = rect.x + rect.w / 2 - margin;
    const minZ = rect.z - rect.d / 2 + margin;
    const maxZ = rect.z + rect.d / 2 - margin;
    return {
        x: minX + Math.random() * (maxX - minX),
        z: minZ + Math.random() * (maxZ - minZ),
    };
}
