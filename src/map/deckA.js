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

// --- NEW: Lockdown room (a secured cell inside the Control Room) ---
const ctrlCx = sx + (cellW / 2);
const ctrlCz = sz + (cellD / 2);

// size with sensible clamps
const LOCK_W = Math.min(6, Math.max(3.2, cellW * 0.55));
const LOCK_D = Math.min(5, Math.max(2.6, cellD * 0.45));
const MARGIN = 0.6;          // space from Control Room outer walls
const DOOR_GAP = 1.2;         // opening on the west wall

// place it toward the SE corner of Control Room
const lockX = ctrlCx + (cellW / 2 - LOCK_W / 2 - MARGIN);
const lockZ = ctrlCz + (cellD / 2 - LOCK_D / 2 - MARGIN);

export const ROOMS = [
    ...baseRooms,
    { key: 'lockdown', name: 'Lockdown', x: lockX, z: lockZ, w: LOCK_W, d: LOCK_D },
];

// --- Walls: outer boundary + station partitions ---
const baseWalls = [
    // Outer boundary (rectangle)
    { x: 0, z: -FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS }, // North
    { x: 0, z: FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS }, // South
    { x: -FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d }, // West
    { x: FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d }, // East

    // Station internal partitions (2×2 grid) with central gaps
    // Vertical through station (gap ~2 units for a door)
    { x: sx, z: sz - (cellD / 2) - 1.0, w: WALL_THICKNESS, d: cellD - 1.0 }, // upper segment
    { x: sx, z: sz + (cellD / 2) + 1.0, w: WALL_THICKNESS, d: cellD - 1.0 }, // lower segment

    // Horizontal through station (gap ~2 units for corridor)
    { x: sx - (cellW / 2) - 1.0, z: sz, w: cellW - 1.0, d: WALL_THICKNESS }, // left segment
    { x: sx + (cellW / 2) + 1.0, z: sz, w: cellW - 1.0, d: WALL_THICKNESS }, // right segment
];

// --- NEW: Lockdown room walls (box with a door gap on the west side) ---
const lockMinZ = lockZ - LOCK_D / 2;
const lockMaxZ = lockZ + LOCK_D / 2;
const lockMinX = lockX - LOCK_W / 2;
const lockMaxX = lockX + LOCK_W / 2;

// split west wall into two segments to leave a door gap
const segLen = Math.max(0, (LOCK_D - DOOR_GAP) / 2);
const westLowerZ = lockMinZ + segLen / 2;
const westUpperZ = lockMaxZ - segLen / 2;

const lockdownWalls = [
    // North & South walls
    { x: lockX, z: lockMinZ, w: LOCK_W, d: WALL_THICKNESS },
    { x: lockX, z: lockMaxZ, w: LOCK_W, d: WALL_THICKNESS },
    // East wall (full)
    { x: lockMaxX, z: lockZ, w: WALL_THICKNESS, d: LOCK_D },
    // West wall split (gap centered)
    { x: lockMinX, z: westLowerZ, w: WALL_THICKNESS, d: segLen },
    { x: lockMinX, z: westUpperZ, w: WALL_THICKNESS, d: segLen },
];

export const walls = [...baseWalls, ...lockdownWalls];

// Precomputed AABBs for collision
export const wallAABBs = walls.map(w => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
}));
