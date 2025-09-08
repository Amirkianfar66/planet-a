// Simple demo set — adjust positions/types to your map
export const INITIAL_ITEMS = [
  { id: "food1",  type: "food",   x: -6, y: 0, z: -2, holder: null, vx: 0, vy: 0, vz: 0 },
  { id: "bat1",   type: "battery",x:  2, y: 0, z:  3, holder: null, vx: 0, vy: 0, vz: 0 },
  { id: "o2c1",   type: "o2can",  x:  5, y: 0, z: -1, holder: null, vx: 0, vy: 0, vz: 0 },
  { id: "fuel1",  type: "fuel",   x: -1, y: 0, z:  5, holder: null, vx: 0, vy: 0, vz: 0 },
];

export const DEVICES = [
  { id: "o2tank1",  type: "o2tank",  x:  4, y: 0, z:  2, radius: 1.3, label: "O₂ Tank" },
  { id: "reactor1", type: "reactor", x:  0, y: 0, z:  0, radius: 1.3, label: "Reactor" },
  { id: "cctv1",    type: "cctv",    x: -2, y: 0, z:  4, radius: 1.3, label: "CCTV Console" },
];

// device ← item effect mapping (applied by host)
export const USE_EFFECTS = {
  // itemType: { deviceType: [meter, delta] }
  o2can:  { o2tank:  ["oxygen", +15] },
  fuel:   { reactor: ["power",  +15] },
  battery:{ cctv:    ["cctv",   +20] },
  // eat locally if no device nearby
  food:   { __eat:   ["", 0]  },
};

// Helpers
export function dist2(a,b){ const dx=a.x-b.x, dz=a.z-b.z; return dx*dx+dz*dz; }
export function clamp01(v){ return Math.max(0, Math.min(100, v)); }
