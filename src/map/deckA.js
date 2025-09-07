// src/map/deckA.js

// Map constants
export const FLOOR = { w: 36, d: 24 };          // width (X) × depth (Z)
export const WALL_THICKNESS = 0.6;
export const WALL_HEIGHT = 2.4;

// Axis-aligned wall segments (centered at x,z)
export const walls = [
  // --- Outer boundary ---
  { x: 0,            z: -FLOOR.d / 2, w: FLOOR.w,        d: WALL_THICKNESS }, // North
  { x: 0,            z:  FLOOR.d / 2, w: FLOOR.w,        d: WALL_THICKNESS }, // South
  { x: -FLOOR.w / 2, z: 0,            w: WALL_THICKNESS, d: FLOOR.d        }, // West
  { x:  FLOOR.w / 2, z: 0,            w: WALL_THICKNESS, d: FLOOR.d        }, // East

  // --- Inner partitions (leave gaps for "doors") ---
  // Horizontal wall across the middle, with a central gap (two segments)
  { x: -9.5, z: 0, w: 13, d: WALL_THICKNESS },  // left segment
  { x:  9.5, z: 0, w: 13, d: WALL_THICKNESS },  // right segment

  // Vertical partitions forming rooms (with small gaps)
  { x: -6, z: -6,  w: WALL_THICKNESS, d: 10 },  // left vertical (gap below)
  { x:  6, z:  6,  w: WALL_THICKNESS, d: 10 },  // right vertical (gap above)

  // Short interior wall creating a tiny corridor
  { x:  0, z:  8,  w: 10, d: WALL_THICKNESS },
];

// Convenience AABBs for collision (precompute)
export const wallAABBs = walls.map(w => ({
  minX: w.x - w.w / 2,
  maxX: w.x + w.w / 2,
  minZ: w.z - w.d / 2,
  maxZ: w.z + w.d / 2,
}));
