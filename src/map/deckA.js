export const FLOOR = { w: 36, d: 24 };
export const WALL_THICKNESS = 0.6;
export const WALL_HEIGHT = 2.4;

export const walls = [
    { x: 0, z: -FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS },
    { x: 0, z: FLOOR.d / 2, w: FLOOR.w, d: WALL_THICKNESS },
    { x: -FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d },
    { x: FLOOR.w / 2, z: 0, w: WALL_THICKNESS, d: FLOOR.d },
    { x: -9.5, z: 0, w: 13, d: WALL_THICKNESS },
    { x: 9.5, z: 0, w: 13, d: WALL_THICKNESS },
    { x: -6, z: -6, w: WALL_THICKNESS, d: 10 },
    { x: 6, z: 6, w: WALL_THICKNESS, d: 10 },
    { x: 0, z: 8, w: 10, d: WALL_THICKNESS },
];

export const wallAABBs = walls.map(w => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
}));
