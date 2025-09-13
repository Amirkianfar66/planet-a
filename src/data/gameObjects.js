// src/data/gameObjects.js

// Optional: central colors you can re-use in UI (e.g., Backpack icons)
export const ITEM_TYPES = {
    food: { label: "Food", color: "#22c55e" }, // green
    fuel: { label: "Fuel", color: "#a855f7" }, // purple
    protection: { label: "Protection", color: "#f59e0b" }, // orange
    cure_red: { label: "Cure (Red)", color: "#ef4444" }, // red
    cure_blue: { label: "Cure (Blue)", color: "#3b82f6" }, // blue
};

// Simple starter content (positions are just examples)
export const INITIAL_ITEMS = [
    // --- FOOD ×3 ---
    { id: "food1", type: "food", name: "Ration Pack", x: -6, z: -2, color: ITEM_TYPES.food.color },
    { id: "food2", type: "food", name: "Ration Pack", x: -4, z: 1, color: ITEM_TYPES.food.color },
    { id: "food3", type: "food", name: "Ration Pack", x: -5, z: -0.5, color: ITEM_TYPES.food.color },

    // --- FUEL ×3 ---
    { id: "fuel1", type: "fuel", name: "Fuel Rod", x: -1, z: 5, color: ITEM_TYPES.fuel.color },
    { id: "fuel2", type: "fuel", name: "Fuel Rod", x: 0, z: 5, color: ITEM_TYPES.fuel.color },
    { id: "fuel3", type: "fuel", name: "Fuel Rod", x: 1, z: 5, color: ITEM_TYPES.fuel.color },

    // --- PROTECTION ×3 ---
    { id: "prot1", type: "protection", name: "Shield Badge", x: 2, z: 3, color: ITEM_TYPES.protection.color },
    { id: "prot2", type: "protection", name: "Shield Badge", x: 3, z: -2, color: ITEM_TYPES.protection.color },
    { id: "prot3", type: "protection", name: "Shield Badge", x: 4, z: -2, color: ITEM_TYPES.protection.color },

    // --- CURE (RED) ×3 ---
    { id: "cureR1", type: "cure_red", name: "Cure — Red", x: 5, z: -1, color: ITEM_TYPES.cure_red.color },
    { id: "cureR2", type: "cure_red", name: "Cure — Red", x: 6, z: -1, color: ITEM_TYPES.cure_red.color },
    { id: "cureR3", type: "cure_red", name: "Cure — Red", x: 5, z: 0, color: ITEM_TYPES.cure_red.color },

    // --- CURE (BLUE) ×3 ---
    { id: "cureB1", type: "cure_blue", name: "Cure — Blue", x: 3, z: 2, color: ITEM_TYPES.cure_blue.color },
    { id: "cureB2", type: "cure_blue", name: "Cure — Blue", x: 6, z: 2, color: ITEM_TYPES.cure_blue.color },
    { id: "cureB3", type: "cure_blue", name: "Cure — Blue", x: 7, z: 2.5, color: ITEM_TYPES.cure_blue.color },
];

// World devices you can interact with when pressing "I"
export const DEVICES = [
    { id: "reactor", type: "reactor", x: 0, z: 0, radius: 2.8, label: "Reactor" },
    { id: "medbay", type: "medbay", x: 4, z: 2, radius: 2.4, label: "MedBay" },
    { id: "shield", type: "shield", x: -2, z: 4, radius: 2.2, label: "Shield Station" },
    // Keep CCTV if other systems still reference it:
    { id: "cctv", type: "cctv", x: -3.5, z: -3, radius: 2.0, label: "CCTV Terminal" },
];

// What can be used on what (host consumes item when a mapping exists)
export const USE_EFFECTS = {
    fuel: { reactor: ["power", +40] },       // Reactor gains power
    protection: { shield: ["shield", +1] },        // e.g., add 1 shield stack (hook up later)
    cure_red: { medbay: ["cure", "cleanse"] },   // cleanse infection
    cure_blue: { medbay: ["cure", "suppress"] },  // suppress infection for a while
    food: {},                                 // eaten directly (client sends 'eat' if no device nearby)
};
