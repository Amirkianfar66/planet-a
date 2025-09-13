// src/map/deckA.js

// Whole play area (centered at 0,0)
export const FLOOR = { w: 40, d: 24 };          // width (X) × depth (Z)
export const WALL_THICKNESS = 0.6;
export const WALL_HEIGHT = 2.4;

// Two big zones: OUTSIDE (left) and STATION (right)
export const OUTSIDE_AREA = { x: -FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };
export const STATION_AREA = { x: FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };

// Grid helpers for the Station (2×2)
const sx = STATION_AREA.x, sz = STATION_AREA.z;
const sw = STATION_AREA.w, sd = STATION_AREA.d;
const cellW = (sw - WALL_THICKNESS) / 2;
const cellD = (sd - WALL_THICKNESS) / 2;

// Base 4 rooms (2×2)
const baseRooms = [
    { key: 'base', name: 'Base', x: sx - (cellW / 2), z: sz - (cellD / 2), w: cellW, d: cellD },
    { key: 'kitchen', name: 'Kitchen', x: sx + (cellW / 2), z: sz - (cellD / 2), w: cellW, d: cellD },
    { key: 'lab', name: 'Lab', x: sx - (cellW / 2), z: sz + (cellD / 2), w: cellW, d: cellD },
    { key: 'control_room', name: 'Control Room', x: sx + (cellW / 2), z: sz + (cellD / 2), w: cellW, d: cellD },
];

// --- Lockdown room (inside Control Room) ---
const ctrlCx = sx + (cellW / 2);
const ctrlCz = sz + (cellD / 2);

const LOCK_W = Math.min(6, Math.max(3.2, cellW * 0.55));
const LOCK_D = Math.min(5, Math.max(2.6, cellD * 0.45));
const MARGIN = 0.6;   // gap from Control Room walls
const DOOR_GAP = 1.2; // west-side door gap

const lockX = ctrlCx + (cellW / 2 - LOCK_W / 2 - MARGIN);
const lockZ = ctrlCz + (cellD / 2 - LOCK_D / 2 - MARGIN);

// --- Meeting Room (in OUTSIDE area, near the Station side) ---
const meetWBase = OUTSIDE_AREA.w * 0.35;
const meetDBase = OUTSIDE_AREA.d * 0.28;
const MEET_W = Math.min(8, Math.max(4, meetWBase));
const MEET_D = Math.min(8, Math.max(4, meetDBase));
const MEET_MARGIN = 0.8;
const MEET_DOOR = 1.4; // east-side door (faces Station)

// place it toward the east edge of OUTSIDE, centered vertically
const meetX = (OUTSIDE_AREA.x + OUTSIDE_AREA.w / 2) - (MEET_W / 2 + MEET_MARGIN);
const meetZ = OUTSIDE_AREA.z;

export const ROOMS = [
    ...baseRooms,
    { key: 'lockdown', name: 'Lockdown', x: lockX, z: lockZ, w: LOCK_W, d: LOCK_D },
    { key: 'meeting_room', name: 'Meeting Room', x: meetX, z: meetZ, w: MEET_W, d: MEET_D },
];

// --- Walls: outer boundary + station partitions ---
const baseWalls = [
    // Outer boundary (rectangle)
    { x: 0, z: -FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS }, // North
    { x: 0, z: FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS }, // South
    { x: -FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d }, // West
    { x: FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d }, // East

    // Station internal partitions (2×2 grid) with central gaps
    // Vertical through station (gap ~2 units)
    { x: sx, z: sz - (cellD / 2) - 1.0, w: WALL_THICKNESS, d: cellD - 1.0 }, // upper
    { x: sx, z: sz + (cellD / 2) + 1.0, w: WALL_THICKNESS, d: cellD - 1.0 }, // lower

    // Horizontal through station (gap ~2 units)
    { x: sx - (cellW / 2) - 1.0, z: sz, w: cellW - 1.0, d: WALL_THICKNESS }, // left
    { x: sx + (cellW / 2) + 1.0, z: sz, w: cellW - 1.0, d: WALL_THICKNESS }, // right
];

// Lockdown room walls (west door)
const lockMinZ = lockZ - LOCK_D / 2;
const lockMaxZ = lockZ + LOCK_D / 2;
const lockMinX = lockX - LOCK_W / 2;
const lockMaxX = lockX + LOCK_W / 2;
const lockSeg = Math.max(0, (LOCK_D - DOOR_GAP) / 2);
const westLowerZ = lockMinZ + lockSeg / 2;
const westUpperZ = lockMaxZ - lockSeg / 2;

const lockdownWalls = [
    // North & South
    { x: lockX, z: lockMinZ, w: LOCK_W, d: WALL_THICKNESS },
    { x: lockX, z: lockMaxZ, w: LOCK_W, d: WALL_THICKNESS },
    // East (full)
    { x: lockMaxX, z: lockZ, w: WALL_THICKNESS, d: LOCK_D },
    // West split (door gap centered)
    { x: lockMinX, z: westLowerZ, w: WALL_THICKNESS, d: lockSeg },
    { x: lockMinX, z: westUpperZ, w: WALL_THICKNESS, d: lockSeg },
];

// Meeting Room walls (east door)
const meetMinZ = meetZ - MEET_D / 2;
const meetMaxZ = meetZ + MEET_D / 2;
const meetMinX = meetX - MEET_W / 2;
const meetMaxX = meetX + MEET_W / 2;
const meetSeg = Math.max(0, (MEET_D - MEET_DOOR) / 2);
const eastLowerZ = meetMinZ + meetSeg / 2;
const eastUpperZ = meetMaxZ - meetSeg / 2;

const meetingWalls = [
    // North & South
    { x: meetX, z: meetMinZ, w: MEET_W, d: WALL_THICKNESS },
    { x: meetX, z: meetMaxZ, w: MEET_W, d: WALL_THICKNESS },
    // West (full)
    { x: meetMinX, z: meetZ, w: WALL_THICKNESS, d: MEET_D },
    // East split (door gap centered, faces Station)
    { x: meetMaxX, z: eastLowerZ, w: WALL_THICKNESS, d: meetSeg },
    { x: meetMaxX, z: eastUpperZ, w: WALL_THICKNESS, d: meetSeg },
];

export const walls = [...baseWalls, ...lockdownWalls, ...meetingWalls];

// Precomputed AABBs for collision
export const wallAABBs = walls.map(w => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
}));

// ---------- NEW: room AABB helpers ----------
export const roomAABB = (key) => {
    const r = ROOMS.find(r => r.key === key);
    if (!r) return null;
    return {
        minX: r.x - r.w / 2,
        maxX: r.x + r.w / 2,
        minZ: r.z - r.d / 2,
        maxZ: r.z + r.d / 2,
    };
};

// Named AABB for Meeting Room (re-used by UI / logic)
export const MEETING_ROOM_AABB = roomAABB('meeting_room');
