// src/components/characters3d/index.js
import Engineer from "./Engineer.jsx";
import Research from "./Research.jsx";
import StationDirector from "./StationDirector.jsx";
import Officer from "./Officer.jsx";
import Guard from "./Guard.jsx";
import FoodSupplier from "./FoodSupplier.jsx";
import InfectedDisguise from "./InfectedDisguise.jsx"; // ⬅️ NEW

// Re-export named for convenience
export {
    Engineer,
    Research,
    StationDirector,
    Officer,
    Guard,
    FoodSupplier,
    InfectedDisguise, // ⬅️ NEW
};

// Pure component map (no JSX here)
export const ROLE_COMPONENTS = {
    Engineer,
    Research,
    StationDirector,
    Officer,
    Guard,
    FoodSupplier,
    InfectedDisguise, // ⬅️ NEW
};
