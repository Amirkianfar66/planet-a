import React, { useEffect, useRef } from "react";
import { isHost, myPlayer, usePlayersList } from "playroomkit";
import useItemsSync from "./useItemsSync";
import { useMeters, hostAppendEvent, useEvents } from "../network/playroom";
import { DEVICES, USE_EFFECTS, dist2, clamp01 } from "../data/gameObjects";

const THROW_SPEED = 8;
const GRAV = 16;
const FLOOR_Y = 0;

export default function ItemsHostLogic() {
  const host = isHost();
  const players = usePlayersList(true);
  const { items, setItems } = useItemsSync();
  const { oxygen, power, cctv, setOxygen, setPower, setCCTV } = useMeters();
  const [, setEvents] = useEvents();
  const processed = useRef(new Map());

  // physics for thrown items
  useEffect(() => {
    if (!host) return;
    const id = setInterval(() => {
      setItems(prev => prev.map(it => {
        if (it.holder) return it; // carried → skip physics
        let { x, y, z, vx, vy, vz } = it;
        if ((vx||vy||vz)) {
          vy -= GRAV * 0.05;
          x += vx * 0.05; y += vy * 0.05; z += vz * 0.05;
          if (y <= FLOOR_Y) { y = FLOOR_Y; vy *= -0.3; vx *= 0.7; vz *= 0.7; if (Math.abs(vy) < 0.5) { vy = 0; vx=0; vz=0; } }
        }
        return { ...it, x, y, z, vx, vy, vz };
      }));
    }, 50);
    return () => clearInterval(id);
  }, [host, setItems]);

  useEffect(() => {
    if (!host) return;
    const id = setInterval(() => {
      for (const p of players) {
        const reqId = Number(p.getState("reqId") || 0);
        const last = processed.current.get(p.id) || 0;
        if (reqId <= last) continue;

        const type   = String(p.getState("reqType") || "");
        const target = String(p.getState("reqTarget") || "");
        const value  = Number(p.getState("reqValue") || 0);

        const name = p.getProfile().name || ("Player " + p.id.slice(0,4));
        const px = Number(p.getState("x")||0), py=Number(p.getState("y")||0), pz=Number(p.getState("z")||0);

        // helpers
        const findItem = id => items.find(i => i.id === id);
        const near = (ax,az,bx,bz,r=1.3)=> ( (ax-bx)**2 + (az-bz)**2 ) <= r*r;

        if (type === "pickup") {
          const it = findItem(target);
          if (it && !it.holder && near(px,pz,it.x,it.z,1.25)) {
            setItems(prev => prev.map(j => j.id===it.id ? { ...j, holder: p.id, vx:0,vy:0,vz:0 } : j));
            p.setState("carry", it.id, true);
            hostAppendEvent(setEvents, `${name} picked up ${it.type}.`);
          }
        }

        if (type === "throw") {
          const it = findItem(target);
          if (it && it.holder === p.id) {
            const yaw = value; // radians
            const vx = Math.sin(yaw) * THROW_SPEED;
            const vz = Math.cos(yaw) * THROW_SPEED;
            const vy = 4.5;
            setItems(prev => prev.map(j => j.id===it.id ? { ...j, holder:null, x:px, y:py+1.1, z:pz, vx, vy, vz } : j));
            p.setState("carry", "", true);
            hostAppendEvent(setEvents, `${name} threw ${it.type}.`);
          }
        }

        if (type === "drop") {
          const it = findItem(target);
          if (it && it.holder === p.id) {
            setItems(prev => prev.map(j => j.id===it.id ? { ...j, holder:null, x:px, y:FLOOR_Y, z:pz, vx:0,vy:0,vz:0 } : j));
            p.setState("carry", "", true);
            hostAppendEvent(setEvents, `${name} dropped ${it.type}.`);
          }
        }

        if (type === "use") {
          // target "deviceId|itemId" OR "eat|itemId"
          const [kind, rest] = target.split("|");
          if (kind === "eat") {
            const it = findItem(rest);
            if (it && it.holder === p.id && it.type === "food") {
              setItems(prev => prev.filter(j => j.id !== it.id));
              p.setState("carry", "", true);
              hostAppendEvent(setEvents, `${name} ate some food.`);
            }
          } else {
            const deviceId = kind;
            const itemId   = rest;
            const it = findItem(itemId);
            const dev = DEVICES.find(d => d.id === deviceId);
            if (it && it.holder === p.id && dev && near(px,pz,dev.x,dev.z, dev.radius||1.3)) {
              const eff = USE_EFFECTS[it.type]?.[dev.type];
              if (eff) {
                const [meter, delta] = eff;
                if (meter === "oxygen") setOxygen(v => clamp01(Number(v)+delta), true);
                if (meter === "power")  setPower(v => clamp01(Number(v)+delta), true);
                if (meter === "cctv")   setCCTV(v => clamp01(Number(v)+delta), true);
                // consume the item
                setItems(prev => prev.filter(j => j.id !== it.id));
                p.setState("carry", "", true);
                hostAppendEvent(setEvents, `${name} used ${it.type} at ${dev.label}.`);
              }
            }
          }
        }

        processed.current.set(p.id, reqId);
      }
    }, 150);
    return () => clearInterval(id);
  }, [host, players, items, setItems, setEvents, setOxygen, setPower, setCCTV]);

  return null;
}
