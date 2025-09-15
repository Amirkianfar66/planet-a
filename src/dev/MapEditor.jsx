// src/dev/MapEditor.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { TransformControls, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
    WALL_THICKNESS,
    makeRoom,
    wallsForRoom,
    packMap,
    saveDraft,
    loadDraft,
} from "../map/roomTools";
import { ROOMS as INITIAL_ROOMS } from "../map/deckA";

// ---------------- Context ----------------
const Ctx = createContext(null);
export const useMapEditor = () => useContext(Ctx);

export function MapEditorProvider({ children, initialRooms = INITIAL_ROOMS, enabled = true }) {
    const seed = useMemo(() => loadDraft() || initialRooms.map((r) => makeRoom({ ...r })), [initialRooms]);
    const [rooms, setRooms] = useState(seed);
    const [selected, setSelected] = useState(0);
    const [showGrid, setShowGrid] = useState(true);
    const [snap, setSnap] = useState(0.5);

    // ensure keys once
    useEffect(() => {
        setRooms((prev) => prev.map((r, i) => ({ ...r, key: r.key || `room_${i}` })));
    }, []);

    const api = useMemo(
        () => ({ rooms, setRooms, selected, setSelected, showGrid, setShowGrid, snap, setSnap }),
        [rooms, selected, showGrid, snap]
    );

    if (!enabled) return children;
    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// ---------------- 3D Layer ----------------
export function MapEditor3D() {
    const { rooms, setRooms, selected, setSelected, showGrid, snap } = useMapEditor();

    const matRoom = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.2 }), []);
    const matRoomSel = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffc14e, transparent: true, opacity: 0.35 }), []);
    const matWall = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x999999 }), []);

    return (
        <>
            {showGrid && <gridHelper args={[60, 60]} position={[0, 0.01, 0]} />}

            {rooms.map((r, i) => {
                const isSel = i === selected;
                const onChangePos = (v) => {
                    const x = snap ? Math.round(v.x / snap) * snap : v.x;
                    const z = snap ? Math.round(v.z / snap) * snap : v.z;
                    setRooms((prev) => prev.map((rr, idx) => (idx === i ? { ...rr, x, z } : rr)));
                };

                const walls = wallsForRoom(r, WALL_THICKNESS);

                return (
                    <group key={r.key || i}>
                        {/* room footprint */}
                        <mesh
                            position={[r.x, 0.02, r.z]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                setSelected(i);
                            }}
                        >
                            <planeGeometry args={[r.w, r.d]} />
                            <primitive object={isSel ? matRoomSel : matRoom} attach="material" />
                        </mesh>

                        {/* walls preview */}
                        {walls.map((w, wi) => (
                            <mesh key={`w_${wi}`} position={[w.x, 0.3, w.z]}>
                                <boxGeometry args={[w.w, 0.6, w.d]} />
                                <primitive object={matWall} attach="material" />
                            </mesh>
                        ))}

                        {isSel && <GizmoTranslate position={[r.x, 0, r.z]} onChange={(pos) => onChangePos(pos)} />}
                    </group>
                );
            })}
        </>
    );
}

function GizmoTranslate({ position, onChange }) {
    const ref = useRef();
    useEffect(() => {
        ref.current?.object?.position.set(position[0], 0, position[2]);
    }, [position]);

    return (
        <TransformControls
            ref={ref}
            mode="translate"
            showY={false}
            onObjectChange={(e) => {
                const p = ref.current?.object?.position || e.target?.object?.position;
                if (p) onChange(new THREE.Vector3(p.x, 0, p.z));
            }}
        >
            <mesh position={[position[0], 0, position[2]]} visible={false}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial />
        </mesh>
    </TransformControls >
  );
}

// ---------------- UI Panel ----------------
export function MapEditorUI() {
    const { rooms, setRooms, selected, setSelected, showGrid, setShowGrid, snap, setSnap } = useMapEditor();
    const r = rooms[selected];

    const update = (patch) => setRooms((prev) => prev.map((it, i) => (i === selected ? { ...it, ...patch } : it)));
    const updateDoor = (patch) => update({ door: { ...(r?.door || {}), ...patch } });

    const addRoom = () => {
        const idx = rooms.length;
        setRooms((prev) => [
            ...prev,
            makeRoom({ key: `room_${idx}`, name: `Room ${idx + 1}`, x: 0, z: 0, w: 4, d: 3, door: { side: "E", width: 1.2, offset: 0 } }),
        ]);
        setSelected(idx);
    };

    const duplicateRoom = () => {
        if (!r) return;
        const idx = rooms.length;
        setRooms((prev) => [...prev, makeRoom({ ...r, key: `${r.key}_copy` })]);
        setSelected(idx);
    };

    const deleteRoom = () => {
        if (!r) return;
        const next = rooms.filter((_, i) => i !== selected);
        setRooms(next);
        setSelected(Math.max(0, selected - 1));
    };

    const saveToLocal = () => saveDraft(rooms);
    const download = () => {
        const data = packMap(rooms);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "map.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    return createPortal(
        <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>Map Editor</strong>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addRoom}>+ Add</button>
                    <button onClick={duplicateRoom} disabled={!r}>Duplicate</button>
                    <button onClick={deleteRoom} disabled={!r}>Delete</button>
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <label><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
                <label>Snap
                    <input type="number" step={0.1} value={snap} onChange={(e) => setSnap(Number(e.target.value) || 0)} style={{ width: 64, marginLeft: 6 }} />
                </label>
                <button onClick={saveToLocal}>Save Draft</button>
                <button onClick={download}>Download JSON</button>
            </div>

            <div style={{ maxHeight: 160, overflow: "auto", padding: 6, border: "1px solid #2b2b2b", borderRadius: 6, marginBottom: 8 }}>
                {rooms.map((it, i) => (
                    <div key={it.key} style={{ padding: 4, background: i === selected ? "#1f2a44" : "transparent", borderRadius: 4, cursor: "pointer" }} onClick={() => setSelected(i)}>
                        {it.name} <span style={{ opacity: 0.6 }}>(x:{it.x.toFixed(2)}, z:{it.z.toFixed(2)})</span>
                    </div>
                ))}
            </div>

            {r && (
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                    <label>Name</label>
                    <input value={r.name} onChange={(e) => update({ name: e.target.value })} />

                    <label>X</label>
                    <input type="number" step={0.1} value={r.x} onChange={(e) => update({ x: Number(e.target.value) })} />

                    <label>Z</label>
                    <input type="number" step={0.1} value={r.z} onChange={(e) => update({ z: Number(e.target.value) })} />

                    <label>Width (w)</label>
                    <input type="number" min={0.5} step={0.1} value={r.w} onChange={(e) => update({ w: Math.max(0.5, Number(e.target.value)) })} />

                    <label>Depth (d)</label>
                    <input type="number" min={0.5} step={0.1} value={r.d} onChange={(e) => update({ d: Math.max(0.5, Number(e.target.value)) })} />

                    <label>Door Side</label>
                    <select value={r.door?.side || "E"} onChange={(e) => updateDoor({ side: e.target.value })}>
                        <option value="N">North</option>
                        <option value="E">East</option>
                        <option value="S">South</option>
                        <option value="W">West</option>
                    </select>

                    <label>Door Width</label>
                    <input type="number" min={0.4} step={0.1} value={r.door?.width || 1.2} onChange={(e) => updateDoor({ width: Math.max(0.4, Number(e.target.value)) })} />

                    <label>Door Offset</label>
                    <input type="number" step={0.1} value={r.door?.offset || 0} onChange={(e) => updateDoor({ offset: Number(e.target.value) })} />
                </div>
            )}

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Tip: Drag the gizmo to move the selected room. Values snap by the chosen increment.
            </div>
        </div>,
        document.body
    );
}

const panelStyle = {
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 1000,
    background: "#0d1117",
    color: "#e6edf3",
    border: "1px solid #263041",
    borderRadius: 12,
    padding: 14,
    width: 460,              // ← wider
    fontSize: 14,            // ← larger text
    lineHeight: 1.35,
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    maxHeight: "90vh",
    overflow: "auto",
    resize: "both",          // ← let you drag-resize if you want
    backdropFilter: "blur(4px)",
};

