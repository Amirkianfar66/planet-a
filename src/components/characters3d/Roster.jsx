import React from "react";
import {
  Engineer, Research, StationDirector, Officer, Guard, FoodSupplier,
} from "./ChibiAstronauts";

export default function Roster() {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:24 }}>
      <Engineer size={200} />
      <Research size={200} />
      <StationDirector size={200} />
      <Officer size={200} />
      <Guard size={200} />
      <FoodSupplier size={200} />
    </div>
  );
}
