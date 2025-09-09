// Renders its children into a real DOM node positioned over a 3D object.
// Works without drei. No DOM elements ever go inside the Canvas tree.
import React, { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { createPortal } from "react-dom";
import * as THREE from "three";

export default function HtmlLite({ worldObject, offset = [-50, -110], children }) {
  const { camera } = useThree();
  const elRef = useRef(null);
  const vec = useRef(new THREE.Vector3());

  // Create & cleanup target DOM element
  useEffect(() => {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.transform = "translate(-9999px,-9999px)";
    el.style.pointerEvents = "auto";
    el.style.zIndex = "50";
    document.body.appendChild(el);
    elRef.current = el;
    return () => { el.remove(); };
  }, []);

  // Keep DOM in sync with 3D position
  useFrame(() => {
    const el = elRef.current;
    if (!el || !worldObject?.current) return;
    worldObject.current.getWorldPosition(vec.current);
    vec.current.project(camera);

    if (vec.current.z > 1) {
      el.style.transform = "translate(-9999px,-9999px)";
      return;
    }
    const x = (vec.current.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vec.current.y * 0.5 + 0.5) * window.innerHeight;
    el.style.transform = `translate(${x}px, ${y}px) translate(${offset[0]}%, ${offset[1]}%)`;
  });

  return elRef.current ? createPortal(children, elRef.current) : null;
}
