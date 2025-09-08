import React from "react";
import useItemsSync from "../systems/useItemsSync";
import { DEVICES } from "../data/gameObjects";

export default function ItemsAndDevices() {
  const { items } = useItemsSync();

  return (
    <group>
      {/* Devices */}
      {DEVICES.map(d => (
        <group key={d.id} position={[d.x, d.y + 0.5, d.z]}>
          <mesh>
            <boxGeometry args={[1.1, 1.0, 0.6]} />
            <meshStandardMaterial color="#2c3444" />
          </mesh>
          <mesh position={[0, 0.3, 0.33]}>
            <planeGeometry args={[0.8, 0.35]} />
            <meshBasicMaterial color="#8fb3ff" />
          </mesh>
        </group>
      ))}

      {/* Items */}
      {items.map(it => {
        if (it.holder) return null; // carried → not on floor
        const pos = [it.x, it.y + 0.25, it.z];
        switch (it.type) {
          case "food":
            return (
              <group key={it.id} position={pos}>
                <mesh><boxGeometry args={[0.35,0.25,0.35]} /><meshStandardMaterial color="#ff9f43" /></mesh>
              </group>
            );
          case "battery":
            return (
              <group key={it.id} position={pos}>
                <mesh><cylinderGeometry args={[0.15,0.15,0.35,12]} /><meshStandardMaterial color="#2dd4bf" /></mesh>
                <mesh position={[0,0.2,0]}><cylinderGeometry args={[0.06,0.06,0.1,12]} /><meshStandardMaterial color="#0f172a" /></mesh>
              </group>
            );
          case "o2can":
            return (
              <group key={it.id} position={pos}>
                <mesh><cylinderGeometry args={[0.2,0.2,0.5,14]} /><meshStandardMaterial color="#9bd1ff" /></mesh>
                <mesh position={[0,0.28,0]}><boxGeometry args={[0.08,0.12,0.08]} /><meshStandardMaterial color="#1e293b" /></mesh>
              </group>
            );
          case "fuel":
            return (
              <group key={it.id} position={pos}>
                <mesh><boxGeometry args={[0.12,0.6,0.12]} /><meshStandardMaterial color="#a78bfa" /></mesh>
              </group>
            );
          default:
            return null;
        }
      })}
    </group>
  );
}
