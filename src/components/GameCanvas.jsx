// src/components/GameCanvas.jsx
import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import {
    OUTSIDE_AREA, STATION_AREA, ROOMS,
    FLOOR, WALL_HEIGHT, walls
} from "../map/deckA";

import Players3D from "./Players3D";
import LocalController from "../systems/LocalController";
import ThirdPersonCamera from "../systems/ThirdPersonCamera";
import ItemsAndDevices from "../world/ItemsAndDevices";
import ItemsHostLogic from "../systems/ItemsHostLogic";
import InteractionSystem from "../systems/InteractionSystem";

/* … TextLabel + FloorAndWalls unchanged … */

/* ---------------- Root canvas + overlays ---------------- */
export default function GameCanvas({ dead = [] }) {
    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Canvas shadows camera={{ position: [0, 8, 10], fov: 50 }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 10, 3]} intensity={1} />

                <FloorAndWalls />
                <ItemsAndDevices />
                <Players3D dead={dead} />
                <LocalController />
                <ThirdPersonCamera />
            </Canvas>

            {/* DOM overlays should NOT block canvas clicks */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <InteractionSystem />
                {/* If InteractionSystem has interactive bits (chat input, buttons),
            set pointerEvents:"auto" just on those specific elements INSIDE it. */}
            </div>

            {/* Non-visual host logic */}
            <ItemsHostLogic />
        </div>
    );
}
