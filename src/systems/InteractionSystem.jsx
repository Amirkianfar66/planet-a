import React, { useEffect, useMemo, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import { requestAction } from "../network/playroom";
import useItemsSync from "./useItemsSync";
import { DEVICES, dist2 } from "../data/gameObjects";

const PICK_RADIUS = 1.25;
const USE_RADIUS = 1.3;

export default function InteractionSystem() {
  const { items } = useItemsSync();
  const uiRef = useRef(null);
  const [hint, setHint] = useState("");

  const me = myPlayer();
  const players = usePlayersList(true); // (handy if you want)

  // helper: nearest item on floor
  const nearestItem = () => {
    const px = Number(me.getState("x")||0), pz=Number(me.getState("z")||0);
    let best=null, bestD=Infinity;
    for (const it of items) {
      if (it.holder) continue;
      const d2 = (it.x-px)*(it.x-px)+(it.z-pz)*(it.z-pz);
      if (d2 < bestD) { best=it; bestD=d2; }
    }
    return (best && bestD <= PICK_RADIUS*PICK_RADIUS) ? best : null;
  };

  const nearestDevice = () => {
    const px = Number(me.getState("x")||0), pz=Number(me.getState("z")||0);
    let best=null, bestD=Infinity;
    for (const d of DEVICES) {
      const d2 = (d.x-px)*(d.x-px)+(d.z-pz)*(d.z-pz);
      if (d2 < bestD) { best=d; bestD=d2; }
    }
    return (best && bestD <= (best.radius||USE_RADIUS)**2) ? best : null;
  };

  // update small contextual hint
  useEffect(() => {
    const id = setInterval(() => {
      const carry = String(me.getState("carry")||"");
      if (carry) {
        const dev = nearestDevice();
        setHint(dev ? `E: Use at ${dev.label}  ·  R: Throw  ·  G: Drop` : `E: Eat (if food)  ·  R: Throw  ·  G: Drop`);
      } else {
        const it = nearestItem();
        setHint(it ? `E: Pick up ${it.type}` : "");
      }
    }, 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onDown(e) {
      const key = e.key.toLowerCase();
      const carry = String(me.getState("carry")||"");
      const yaw = Number(me.getState("yaw")||0);

      if (key === "e") {
        if (!carry) {
          const it = nearestItem();
          if (it) requestAction("pickup", it.id, 0);
        } else {
          const dev = nearestDevice();
          if (dev) {
            requestAction("use", `${dev.id}|${carry}`, 0);
          } else {
            // try eat
            requestAction("use", `eat|${carry}`, 0);
          }
        }
      }
      if (key === "r" && carry) {
        requestAction("throw", carry, yaw);
      }
      if (key === "g" && carry) {
        requestAction("drop", carry, 0);
      }
    }
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  // very small HUD text (optional)
  return hint ? (
    <div style={{
      position:"absolute", left:12, top:12, padding:"6px 10px",
      background:"rgba(14,17,22,0.8)", color:"#cfe3ff",
      border:"1px solid #2a3242", borderRadius:8, fontFamily:"ui-sans-serif", fontSize:12
    }}>{hint}</div>
  ) : null;
}
