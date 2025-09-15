// src/map/deckA.js
// Exports: FLOOR, WALL_THICKNESS, WALL_HEIGHT, OUTSIDE_AREA, STATION_AREA,
//          ROOMS, walls, wallAABBs, MEETING_ROOM_AABB

import * as RT from "./roomTools";
import authored from "./defaultMap.json";

// --- constants (re-exported values expected by the rest of the game)
export const WALL_THICKNESS = RT.WALL_THICKNESS ?? 0.6;
export const WALL_HEIGHT    = RT.DEFAULT_WALL_HEIGHT ?? 2.4;

// Keep legacy FLOOR dims so existing code doesn't break.
// (Change these if you want FLOOR to match your authored map bounds.)
export const FLOOR = { w: 40, d: 24 };

// Legacy convenience areas (optional; safe to keep)
export const OUTSIDE_AREA = { x: -FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };
export const STATION_AREA = { x: FLOOR.w / 4,  z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };

// --- utils
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
  return map;
}

// Prefer a local draft (Save Draft in editor) during dev, else use the checked-in JSON
function getAuthoredMap() {
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("mapEditorDraft_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.rooms)) {
          return normalizeMap(parsed);
        }
      }
    }
  } catch { /* ignore */ }
  return normalizeMap(authored);
}

const MAP = getAuthoredMap();

// If you want hard outer boundary walls, add them here; left empty by default.
const baseWalls = [];

// --- main exports used by the game ---
export const ROOMS = MAP.rooms;
export const walls = [...baseWalls, ...MAP.walls];
export const wallAABBs = (MAP.wallAABBs && MAP.wallAABBs.length === MAP.walls.length)
  ? MAP.wallAABBs
  : computeAABBs(walls);

// --- meeting room helpers ---
function findMeetingRoom(rooms) {
  const lower = (s) => (s || "").toLowerCase();
  return rooms.find((r) =>
    lower(r.key) === "meeting_room" ||
    lower(r.type) === "meeting_room" ||
    lower(r.name).includes("meeting")
  ) || null;
}

// AABB for a (possibly rotated) room rectangle
function aabbForRoom(room) {
  if (!room) return null;
  const ang = ((room.rotDeg || 0) * Math.PI) / 180;
  const hx = (room.w || 0) / 2;
  const hz = (room.d || 0) / 2;
  const ex = Math.abs(hx * Math.cos(ang)) + Math.abs(hz * Math.sin(ang));
  const ez = Math.abs(hx * Math.sin(ang)) + Math.abs(hz * Math.cos(ang));
  return {
    minX: room.x - ex,
    maxX: room.x + ex,
    minZ: room.z - ez,
    maxZ: room.z + ez,
  };
}

export const MEETING_ROOM_AABB = aabbForRoom(findMeetingRoom(ROOMS));
