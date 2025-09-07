// src/map/deckA.js

// Whole play area (centered at 0,0)
export const FLOOR = { w: 40, d: 24 };          // width (X) × depth (Z)
export const WALL_THICKNESS = 0.6;
export const WALL_HEIGHT = 2.4;

// Two big zones: OUTSIDE (left) and STATION (right)
export const OUTSIDE_AREA = { x: -FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };
export const STATION_AREA = { x: FLOOR.w / 4, z: 0, w: FLOOR.w / 2 - 1, d: FLOOR.d - 2 };

// Four rooms inside the Station (2×2 grid)
const sx = STATION_AREA.x, sz = STATION_AREA.z;
const sw = STATION_AREA.w, sd = STATION_AREA.d;
const cellW = (sw - WALL_THICKNESS) / 2;
const cellD = (sd - WALL_THICKNESS) / 2;

// Room rectangles (for labels / future logic)
export const ROOMS = [
    { key: 'base', name: 'Base', x: sx - (cellW / 2), z: sz - (cellD / 2), w: cellW, d: cellD },
    { key: 'kitchen', name: 'Kitchen', x: sx + (cellW / 2), z: sz - (cellD / 2), w: cellW, d: cellD },
    { key: 'lab', name: 'Lab', x: sx - (cellW / 2), z: sz + (cellD / 2), w: cellW, d: cellD },
    { key: 'control_room', name: 'Control Room', x: sx + (cellW / 2), z: sz + (cellD / 2), w: cellW, d: cellD },
];

// Walls: outer boundary + station partitions (with small door gaps)
export const walls = [
    // --- Outer boundary (rectangle) ---
    { x: 0, z: -FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS }, // North
    { x: 0, z: FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS }, // South
    { x: -FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d }, // West
    { x: FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d }, // East

    // --- Station internal partitions (2×2 grid) ---
    // Vertical wall through station (gap ~2 units at center for a "door")
    { x: sx, z: sz - (cellD / 2) - 1.0, w: WALL_THICKNESS, d: cellD - 1.0 }, // upper segment
    { x: sx, z: sz + (cellD / 2) + 1.0, w: WALL_THICKNESS, d: cellD - 1.0 }, // lower segment

    // Horizontal wall through station (gap near center for corridor)
    { x: sx - (cellW / 2) - 1.0, z: sz, w: cellW - 1.0, d: WALL_THICKNESS }, // left segment
    { x: sx + (cellW / 2) + 1.0, z: sz, w: cellW - 1.0, d: WALL_THICKNESS }, // right segment
];

// Precomputed AABBs for collision
export const wallAABBs = walls.map(w => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
}));
