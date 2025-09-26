// src/data/wireKeys.js
// All puzzle keys you’re using (everything except B, D, F)

export const WIRE_PATTERNS = {
    A: { triangle: "red", circle: "yellow", square: "blue", hexagon: "green" },
    C: { triangle: "red", circle: "yellow", square: "blue", hexagon: "green" },
    E: { triangle: "blue", circle: "green", square: "red", hexagon: "yellow" },
    G: { triangle: "red", circle: "green", square: "yellow", hexagon: "blue" },

    I: { triangle: "red", circle: "blue", square: "green", hexagon: "yellow" },

    K: { triangle: "green", circle: "red", square: "yellow", hexagon: "blue" },
    L: { triangle: "blue", circle: "yellow", square: "green", hexagon: "red" },
    M: { triangle: "yellow", circle: "red", square: "blue", hexagon: "green" },
    N: { triangle: "green", circle: "red", square: "yellow", hexagon: "blue" },
    O: { triangle: "blue", circle: "yellow", square: "red", hexagon: "green" },
    P: { triangle: "yellow", circle: "blue", square: "green", hexagon: "red" },
    Q: { triangle: "green", circle: "red", square: "yellow", hexagon: "blue" },
    
};

export const WIRE_KEYS = Object.keys(WIRE_PATTERNS);

/** Pick a random allowed key id. */
export function getRandomKeyId(rng = Math.random) {
    return WIRE_KEYS[(rng() * WIRE_KEYS.length) | 0];
}

/** Get mapping (shape->color) for a key id. */
export function getSolutionForKey(keyId) {
    return WIRE_PATTERNS[keyId] || null;
}


// Add this to src/data/wireKeys.js
export function getMuralUrlList(keyId, exts = ["svg", "png"]) {
    const base = (import.meta?.env?.BASE_URL || "/");
    return exts.map(ext => `${base}ui/wire_keys/key_${keyId}.${ext}`);
}
