// src/systems/CCTVViewer.jsx
import React, { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { myPlayer } from "playroomkit";
import useItemsSync from "./useItemsSync.js";

export default function CCTVViewer() {
    const { camera } = useThree();
    const { items } = useItemsSync();
    const idRef = useRef("");

    useEffect(() => {
        const t = setInterval(() => {
            idRef.current = String(myPlayer()?.getState("cctvViewId") || "");
        }, 120);
        return () => clearInterval(t);
    }, []);

    useFrame(() => {
        const id = idRef.current;
        if (!id) return;

        const cam = items.find(i => i.id === id && i.type === "cctv" && !i.holder);
        if (!cam) {
            // camera was removed — stop viewing
            myPlayer()?.setState("cctvViewId", "", false);
            return;
        }

        const yaw = Number(cam.yaw || 0);
        const x = cam.x, y = cam.y ?? 1.5, z = cam.z;

        camera.position.set(x, y, z);
        camera.lookAt(x + Math.sin(yaw), y, z + Math.cos(yaw));
    });

    return null;
}
