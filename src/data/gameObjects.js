// Simple starter content you can tweak

export const INITIAL_ITEMS = [
    { id: "food1", type: "food", x: -6, z: -2, name: "Ration Pack" },
    { id: "bat1", type: "battery", x: 2, z: 3, name: "Battery Cell" },
    { id: "o2c1", type: "o2can", x: 5, z: -1, name: "O₂ Canister" },
    { id: "fuel1", type: "fuel", x: -1, z: 5, name: "Fuel Rod" },
];

export const DEVICES = [
    { id: "o2tank", type: "o2tank", x: 4, z: 2, radius: 2.4, label: "O₂ Station" },
    { id: "reactor", type: "reactor", x: 0, z: 0, radius: 2.8, label: "Reactor" },
    { id: "cctv", type: "cctv", x: -2, z: 4, radius: 2.2, label: "CCTV Terminal" },
];

// What can be used on what (and what effect key to apply if you hook up meters later)
export const USE_EFFECTS = {
    battery: { reactor: ["power", +20] },
    o2can: { o2tank: ["oxygen", +20] },
    fuel: { reactor: ["power", +40] },
    food: {}, // eaten (not used on devices)
};
