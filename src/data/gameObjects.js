// src/data/gameObjects.js

// Optional: central colors you can re-use in UI (e.g., Backpack icons)
export const ITEM_TYPES = {
    food: { label: "Food", color: "#22c55e" }, // green
    poison_food: { label: "Poisoned Food", color: "#84cc16" }, // lime-ish

    fuel: { label: "Fuel", color: "#a855f7" }, // purple
    protection: { label: "Protection", color: "#f59e0b" }, // orange
    cure_red: { label: "Cure (Red)", color: "#ef4444" }, // red
    cure_blue: { label: "Cure (Blue)", color: "#3b82f6" }, // blue

    // containers
    food_tank: { label: "Food Tank", color: "#10b981" }, // teal
    fuel_tank: { label: "Fuel Tank", color: "#a855f7" }, // purple (match fuel)
    protection_tank: { label: "Protection Tank", color: "#f59e0b" }, // orange (match protection)
    cctv: { label: "CCTV Camera", color: "#94a3b8" },
    food_receiver: { label: "Food Receiver", color: "#0ea5e9" },       // cyan
    protection_receiver: { label: "Protection Receiver", color: "#fb923c" }, // amber
};

// Canonical team labels (slugs → pretty)
export const TEAM_LABELS = {
    teama: "Alpha",
    teamb: "Beta",
    teamc: "Gamma",
    teamd: "Delta",
};

// Helper to build a tank item with consistent fields
const makeTankItem = (kind, id, teamKey, roomKey, offset) => ({
    id,
    type: kind, // "food_tank" | "protection_tank"
    name: `${ITEM_TYPES[kind].label} — ${TEAM_LABELS[teamKey]}`,
    team: teamKey, // ties the tank to a team
    roomKey,       // placed by room center + offset
    offset,
    cap: 6,
    stored: 0,
    color: ITEM_TYPES[kind].color,
});
// Helper for receivers
const makeReceiverItem = (kind, id, teamKey, roomKey, offset) => ({
 id,
        type: kind, // "food_receiver" | "protection_receiver"
        name: `${ITEM_TYPES[kind].label} — ${TEAM_LABELS[teamKey]}`,
        team: teamKey,
        roomKey,
        offset,
        color: ITEM_TYPES[kind].color,
});
// Simple starter content (positions are just examples)
export const INITIAL_ITEMS = [
    // --- FOOD ×3 ---
    { id: "food1", type: "food", name: "Ration Pack", x: -6, z: -2, color: ITEM_TYPES.food.color },
    { id: "food2", type: "food", name: "Ration Pack", x: -4, z: 1, color: ITEM_TYPES.food.color },
    { id: "food3", type: "food", name: "Ration Pack", x: -5, z: -0.5, color: ITEM_TYPES.food.color },
    { id: "pfood1", type: "poison_food", name: "Ration Pack", x: -7, z: -1, color: ITEM_TYPES.poison_food.color },

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

    // Team-specific tanks (placed around the room center using offsets)
    // Team-specific tanks (placed at room corners via offsets)

    // FOOD TANKS — Kitchen corners
    makeTankItem("food_tank", "tank_food_teama", "teama", "Kitchen", { x: -2, z: -3 }), // NW
    makeTankItem("food_tank", "tank_food_teamb", "teamb", "Kitchen", { x: 2, z: -3 }), // NE
    makeTankItem("food_tank", "tank_food_teamc", "teamc", "Kitchen", { x: -2, z: 3 }), // SW
    makeTankItem("food_tank", "tank_food_teamd", "teamd", "Kitchen", { x: 2, z: 3 }), // SE

    // PROTECTION TANKS — Lab corners
    makeTankItem("protection_tank", "tank_prot_teama", "teama", "Lab", { x: -2, z: -3 }), // NW
    makeTankItem("protection_tank", "tank_prot_teamb", "teamb", "Lab", { x: 2, z: -3 }), // NE
    makeTankItem("protection_tank", "tank_prot_teamc", "teamc", "Lab", { x: -2, z: 3 }), // SW
    makeTankItem("protection_tank", "tank_prot_teamd", "teamd", "Lab", { x: 2, z: 3 }), // SE

    // --- TEAM BASE RECEIVERS ---
    // NOTE: Update room keys to your real team rooms if different.
    // Suggested room ids: "AlphaBase", "BetaBase", "GammaBase", "DeltaBase"
    // FOOD receivers (left side / corner-ish)
    makeReceiverItem("food_receiver", "recv_food_teama", "teama", "TeamA", { x: -2.5, z: -2.5 }),
    makeReceiverItem("food_receiver", "recv_food_teamb", "teamb", "TeamB", { x: -2.5, z: -2.5 }),
    makeReceiverItem("food_receiver", "recv_food_teamc", "teamc", "TeamC", { x: -2.5, z: -2.5 }),
    makeReceiverItem("food_receiver", "recv_food_teamd", "teamd", "TeamD", { x: -2.5, z: -2.5 }),
    
   // PROTECTION receivers (right / opposite corner)
    makeReceiverItem("protection_receiver", "recv_prot_teama", "teama", "TeamA", { x: 2.5, z: 2.5 }),
    makeReceiverItem("protection_receiver", "recv_prot_teamb", "teamb", "TeamB", { x: 2.5, z: 2.5 }),
    makeReceiverItem("protection_receiver", "recv_prot_teamc", "teamc", "TeamC", { x: 2.5, z: 2.5 }),
    makeReceiverItem("protection_receiver", "recv_prot_teamd", "teamd", "TeamD", { x: 2.5, z: 2.5 }),
    // Keep your single fuel tank (unchanged)
    {
        id: "tank_fuel_1",
        type: "fuel_tank",
        name: "Fuel Tank",
        roomKey: "Mechanical",
        offset: { x: -2, z: 0 },
        cap: 6,
        stored: 0,
        color: ITEM_TYPES.fuel_tank.color,
    },
]; // <-- IMPORTANT: close INITIAL_ITEMS before starting DEVICES!

// World devices you can interact with when pressing "I"
export const DEVICES = [
    { id: "reactor", type: "reactor", x: 0, z: 0, radius: 2.8, label: "Reactor" },
    { id: "medbay", type: "medbay", x: 4, z: 2, radius: 2.4, label: "MedBay" },
    { id: "shield", type: "shield", x: -2, z: 4, radius: 2.2, label: "Shield Station" },
    { id: "cctv_console", type: "console", x: -3.5, z: -3, radius: 2.0, label: "CCTV Console" },
];

// What can be used on what
export const USE_EFFECTS = {
    fuel: { reactor: ["power", +40] },
    protection: { shield: ["shield", +1] },
    cure_red: { medbay: ["cure", "cleanse"] },
    cure_blue: { medbay: ["cure", "suppress"] },
    food: {}, // eaten directly
    // *_tank are containers, not used on devices
};
