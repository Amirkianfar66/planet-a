// src/dev/MapEditor.jsx
// Draw-rect editor with per-edge doors/heights, rotation, floors/roofs, room keys/types, and export filtering.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";
// at the top with your other imports


// ✅ Robust import: works even if some named exports are missing in roomTools.js
import * as RT from "../map/roomTools";
// fallbacks (won't break if constants aren't exported yet)
const WALL_THICKNESS = RT.WALL_THICKNESS ?? 0.6;
const DEFAULT_WALL_HEIGHT = RT.DEFAULT_WALL_HEIGHT ?? 2.4;
const DEFAULT_SLAB_THICKNESS = RT.DEFAULT_SLAB_THICKNESS ?? 0.12;

// required API from roomTools
const makeRoom = RT.makeRoom;
const wallsForRoomLocal = RT.wallsForRoomLocal;
const packMap = RT.packMap;
const saveDraft = RT.saveDraft;
const loadDraft = RT.loadDraft;

// If you renamed deck file to "deck.js", use that path:
import { ROOMS as INITIAL_DECK_ROOMS } from "../map/deckA";

const Ctx = createContext(null);
export const useMapEditor = () => useContext(Ctx);

export function MapEditorProvider({ children, initialRooms = INITIAL_DECK_ROOMS, enabled = true }) {
    const seed = useMemo(() => {
        const draft = loadDraft?.();
        if (draft && Array.isArray(draft)) return draft;
        return (initialRooms || []).map((r) => makeRoom({ ...r }));
    }, [initialRooms]);

    const [rooms, setRooms] = useState(seed);
    const [selected, setSelected] = useState(0);
    const [selectedEdge, setSelectedEdge] = useState(null); // {roomIndex, side}
    const [showGrid, setShowGrid] = useState(true);
    const [snap, setSnap] = useState(0.5);

    // NEW: floors/roofs toggles
    const [showFloors, setShowFloors] = useState(true);
    const [showRoofs, setShowRoofs] = useState(true);

    // draw-rectangle interaction
    const [drawMode, setDrawMode] = useState(false);
    const [drawStart, setDrawStart] = useState(null); // {x,z}
    const [drawCurr, setDrawCurr] = useState(null);

    // ensure keys once
    useEffect(() => {
        setRooms((prev) => prev.map((r, i) => ({ ...r, key: r.key || `room_${i}` })));
    }, []);

    const api = useMemo(
        () => ({
            rooms, setRooms,
            selected, setSelected,
            selectedEdge, setSelectedEdge,
            showGrid, setShowGrid,
            snap, setSnap,
            drawMode, setDrawMode, drawStart, setDrawStart, drawCurr, setDrawCurr,
            showFloors, setShowFloors, showRoofs, setShowRoofs,
        }),
        [rooms, selected, selectedEdge, showGrid, snap, drawMode, drawStart, drawCurr, showFloors, showRoofs]
    );

    if (!enabled) return children;
    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// ---------------- 3D Layer ----------------
export function MapEditor3D() {
    const {
        rooms, setRooms,
        selected, setSelected,
        selectedEdge, setSelectedEdge,
        showGrid, snap,
        drawMode, setDrawMode, drawStart, setDrawStart, drawCurr, setDrawCurr,
        showFloors, showRoofs,
    } = useMapEditor();

    const matRoom = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.18 }), []);
    const matRoomSel = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffc14e, transparent: true, opacity: 0.28 }), []);
    const matWall = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x9aa4b2 }), []);
    const matSelEdge = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xff6767 }), []);
    const matDraw = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x22cc88, transparent: true, opacity: 0.25 }), []);
    const matFloor = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.9, metalness: 0.0 }), []);
    const matRoof = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 0.85, metalness: 0.0 }), []);

    // draw on ground
    const onGroundDown = (e) => {
        if (!drawMode) return;
        e.stopPropagation();
        const p = e.point;
        setDrawStart({ x: p.x, z: p.z });
        setDrawCurr({ x: p.x, z: p.z });
    };
    const onGroundMove = (e) => {
        if (!drawMode || !drawStart) return;
        const p = e.point;
        setDrawCurr({ x: p.x, z: p.z });
    };
    const onGroundUp = () => {
        if (!drawMode || !drawStart || !drawCurr) return;
        const w = Math.abs(drawCurr.x - drawStart.x);
        const d = Math.abs(drawCurr.z - drawStart.z);
        if (w >= 0.5 && d >= 0.5) {
            const cx = (drawCurr.x + drawStart.x) / 2;
            const cz = (drawCurr.z + drawStart.z) / 2;
            const snapV = (v) => (snap ? Math.round(v / snap) * snap : v);
            const room = makeRoom({
                name: `Room ${rooms.length + 1}`,
                x: snapV(cx), z: snapV(cz), w: snapV(w), d: snapV(d),
                floorY: 0, roofT: DEFAULT_SLAB_THICKNESS,
                exported: true,
            });
            setRooms((prev) => [...prev, room]);
            setSelected(rooms.length);
            setSelectedEdge(null);
        }
        setDrawStart(null); setDrawCurr(null);
    };

    // gizmo handler (world coords)
    const onGizmoChange = (v) => {
        const idx = selected;
        if (idx == null || idx < 0 || idx >= rooms.length) return;
        const x = snap ? Math.round(v.x / snap) * snap : v.x;
        const z = snap ? Math.round(v.z / snap) * snap : v.z;
        setRooms((prev) => prev.map((rr, i) => (i === idx ? { ...rr, x, z } : rr)));
    };

    const selRoom = rooms[selected];

    return (
        <>
            {showGrid && <gridHelper args={[120, 60]} position={[0, 0.005, 0]} />}

            {/* drag-rect capture plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}
                onPointerDown={onGroundDown} onPointerMove={onGroundMove} onPointerUp={onGroundUp}>
                <planeGeometry args={[200, 200]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            {/* draw preview */}
            {drawMode && drawStart && drawCurr && (
                <mesh rotation={[-Math.PI / 2, 0, 0]}
                    position={[(drawStart.x + drawCurr.x) / 2, 0.02, (drawStart.z + drawCurr.z) / 2]}>
                    <planeGeometry args={[
                        Math.max(0.01, Math.abs(drawCurr.x - drawStart.x)),
                        Math.max(0.01, Math.abs(drawCurr.z - drawStart.z)),
                    ]} />
                    <primitive attach="material" object={matDraw} />
                </mesh>
            )}

            {/* rooms */}
            {rooms.map((r, i) => {
                const isSel = i === selected;
                const localWalls = wallsForRoomLocal(r, WALL_THICKNESS);
                const thick = r.roofT ?? DEFAULT_SLAB_THICKNESS;
                const floorY = (r.floorY ?? 0) + thick / 2;
                const roofY = (r.h || DEFAULT_WALL_HEIGHT) - thick / 2;

                return (
                    <group key={r.key || i}
                        position={[r.x, 0, r.z]}
                        rotation={[0, (r.rotDeg || 0) * Math.PI / 180, 0]}
                        onPointerDown={(e) => { e.stopPropagation(); setSelected(i); }}>
                        {/* floor slab */}
                        {showFloors && (
                            <mesh position={[0, floorY, 0]}>
                                <boxGeometry args={[r.w, thick, r.d]} />
                                <primitive attach="material" object={matFloor} />
                            </mesh>
                        )}

                        {/* footprint overlay */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, (r.floorY ?? 0) + 0.02, 0]}
                            onPointerDown={(e) => { e.stopPropagation(); setSelected(i); }}>
                            <planeGeometry args={[r.w, r.d]} />
                            <primitive attach="material" object={isSel ? matRoomSel : matRoom} />
                        </mesh>

                        {/* walls */}
                        {localWalls.map((w, wi) => (
                            <mesh key={`w_${wi}`}
                                position={[w.x, (w.h || DEFAULT_WALL_HEIGHT) / 2 + (r.floorY ?? 0), w.z]}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    setSelected(i);
                                    setSelectedEdge({ roomIndex: i, side: w.side });
                                }}>
                                <boxGeometry args={[w.w, w.h || DEFAULT_WALL_HEIGHT, w.d]} />
                                <primitive
                                    attach="material"
                                    object={(selectedEdge && selectedEdge.roomIndex === i && selectedEdge.side === w.side) ? matSelEdge : matWall}
                                />
                            </mesh>
                        ))}

                        {/* roof slab */}
                        {showRoofs && (
                            <mesh position={[0, roofY + (r.floorY ?? 0), 0]}>
                                <boxGeometry args={[r.w, thick, r.d]} />
                                <primitive attach="material" object={matRoof} />
                            </mesh>
                        )}
                    </group>
                );
            })}

            {/* move gizmo (world) */}
            {selRoom && <GizmoTranslate position={[selRoom.x, 0, selRoom.z]} onChange={onGizmoChange} />}
        </>
    );
}

function GizmoTranslate({ position, onChange }) {
    const ref = useRef();
    useEffect(() => { ref.current?.object?.position.set(position[0], 0, position[2]); }, [position]);
    return (
        <TransformControls ref={ref} mode="translate" showY={false}
            onObjectChange={(e) => {
                const p = ref.current?.object?.position || e.target?.object?.position;
                if (p) onChange(new THREE.Vector3(p.x, 0, p.z));
            }}>
            <mesh position={[position[0], 0, position[2]]} visible={false}>
                <boxGeometry args={[0.1, 0.1, 0.1]} />
                <meshBasicMaterial />
            </mesh>
        </TransformControls>
    );
}

// ---------------- UI Panel ----------------
export function MapEditorUI() {
    const {
        rooms, setRooms,
        selected, setSelected,
        selectedEdge, setSelectedEdge,
        showGrid, setShowGrid,
        snap, setSnap,
        drawMode, setDrawMode,
        showFloors, setShowFloors, showRoofs, setShowRoofs,
    } = useMapEditor();

    const r = rooms[selected];

    const update = (patch) => setRooms((prev) => prev.map((it, i) => (i === selected ? { ...it, ...patch } : it)));
    const updateEdge = (side, patch) => setRooms((prev) => prev.map((it, i) => {
        if (i !== selected) return it;
        const edges = it.edges.map((e) => e.side === side ? { ...e, ...patch } : e);
        return { ...it, edges };
    }));

    // --- helpers for specific room types ---
    const uniqueKey = (desired) => {
        if (!desired) return "";
        let k = desired;
        let n = 2;
        const has = (kk) => rooms.some((rr) => rr.key === kk);
        while (has(k)) k = `${desired}_${n++}`;
        return k;
    };

    const mkLockdown = (x = 0, z = 0) => makeRoom({
        key: uniqueKey("lockdown"),
        name: "Lockdown",
        type: "lockdown",
        exported: true,
        x, z, w: 4.5, d: 3.0, h: 2.4,
        edges: [
            { side: "N", present: true, door: null },
            { side: "E", present: true, door: null },
            { side: "S", present: true, door: null },
            { side: "W", present: true, door: { width: 1.2, offset: 0 } },
        ],
    });

    const mkMeetingRoom = (x = 0, z = 0) => makeRoom({
        key: uniqueKey("meeting_room"),
        name: "Meeting Room",
        type: "meeting_room",
        exported: true,
        x, z, w: 6.0, d: 4.0, h: 2.4,
        edges: [
            { side: "N", present: true, door: null },
            { side: "E", present: true, door: { width: 1.6, offset: 0 } },
            { side: "S", present: true, door: null },
            { side: "W", present: true, door: null },
        ],
    });

    const addRoom = () => {
        const idx = rooms.length;
        setRooms((prev) => [...prev, makeRoom({ key: `room_${idx}`, name: `Room ${idx + 1}`, x: 0, z: 0, w: 4, d: 3, exported: true })]);
        setSelected(idx);
        setSelectedEdge(null);
    };

    const addLockdown = () => {
        const base = rooms[selected];
        const x = base ? base.x + (base.w || 4) / 2 + 1 : 0;
        const z = base ? base.z : 0;
        const idx = rooms.length;
        setRooms((prev) => [...prev, mkLockdown(x, z)]);
        setSelected(idx);
        setSelectedEdge(null);
    };

    const addMeetingRoom = () => {
        const base = rooms[selected];
        const x = base ? base.x - (base.w || 4) / 2 - 1 : 0;
        const z = base ? base.z : 0;
        const idx = rooms.length;
        setRooms((prev) => [...prev, mkMeetingRoom(x, z)]);
        setSelected(idx);
        setSelectedEdge(null);
    };

    const duplicateRoom = () => {
        if (!r) return;
        const idx = rooms.length;
        setRooms((prev) => [...prev, makeRoom({ ...r, key: uniqueKey(`${r.key || "room"}_copy`) })]);
        setSelected(idx);
        setSelectedEdge(null);
    };

    const deleteRoom = () => {
        if (!r) return;
        const next = rooms.filter((_, i) => i !== selected);
        setRooms(next);
        setSelected(Math.max(0, selected - 1));
        setSelectedEdge(null);
    };

    const saveToLocal = () => saveDraft?.(rooms);

    const download = () => {
        // Filter to exported rooms (so you only ship Lockdown/MeetingRoom/etc you marked)
        const exportRooms = rooms.filter((rm) => rm.exported !== false);
        const data = packMap ? packMap(exportRooms) : { rooms: exportRooms }; // compatible with older packMap
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "map.json";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    };

    return createPortal(
        <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>Map Editor</strong>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={addRoom}>+ Add</button>
                    <button onClick={addLockdown}>+ Lockdown</button>
                    <button onClick={addMeetingRoom}>+ MeetingRoom</button>
                    <button onClick={duplicateRoom} disabled={!r}>Duplicate</button>
                    <button onClick={deleteRoom} disabled={!r}>Delete</button>
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <label><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
                <label>Snap
                    <input type="number" step={0.1} value={snap} onChange={(e) => setSnap(Number(e.target.value) || 0)} style={{ width: 64, marginLeft: 6 }} />
                </label>
                <label><input type="checkbox" checked={showFloors} onChange={(e) => setShowFloors(e.target.checked)} /> Floors</label>
                <label><input type="checkbox" checked={showRoofs} onChange={(e) => setShowRoofs(e.target.checked)} /> Roofs</label>
                <button onClick={() => setDrawMode((v) => !v)} style={{ background: drawMode ? "#2f6f4f" : undefined }}>
                    {drawMode ? "Drawing: ON" : "Draw Room"}
                </button>
                <button onClick={saveToLocal}>Save Draft</button>
                <button onClick={download}>Download JSON</button>
            </div>

            {/* room list */}
            <div style={{ maxHeight: 160, overflow: "auto", padding: 6, border: "1px solid #2b2b2b", borderRadius: 6, marginBottom: 8 }}>
                {rooms.map((it, i) => (
                    <div
                        key={it.key}
                        style={{ padding: 4, background: i === selected ? "#1f2a44" : "transparent", borderRadius: 4, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                        onClick={() => { setSelected(i); setSelectedEdge(null); }}
                    >
                        <span>{it.name}</span>
                        <span style={{ opacity: 0.7 }}>
                            {it.key} · {it.type || "generic"} · {it.exported === false ? "not exported" : "exported"}
                        </span>
                    </div>
                ))}
            </div>

            {r && (
                <>
                    {/* room fields */}
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                        <label>Key</label>
                        <input value={r.key} onChange={(e) => { const v = e.target.value.trim(); if (v) update({ key: v }); }} />

                        <label>Name</label>
                        <input value={r.name} onChange={(e) => update({ name: e.target.value })} />

                        <label>Type</label>
                        <input value={r.type || ""} onChange={(e) => update({ type: e.target.value })} placeholder="lockdown / meeting_room / ..." />

                        <label>Export?</label>
                        <input type="checkbox" checked={r.exported !== false} onChange={(e) => update({ exported: e.target.checked })} />

                        <label>Center X</label>
                        <input type="number" step={0.1} value={r.x} onChange={(e) => update({ x: Number(e.target.value) })} />

                        <label>Center Z</label>
                        <input type="number" step={0.1} value={r.z} onChange={(e) => update({ z: Number(e.target.value) })} />

                        <label>Width (w)</label>
                        <input type="number" min={0.5} step={0.1} value={r.w} onChange={(e) => update({ w: Math.max(0.5, Number(e.target.value)) })} />

                        <label>Depth (d)</label>
                        <input type="number" min={0.5} step={0.1} value={r.d} onChange={(e) => update({ d: Math.max(0.5, Number(e.target.value)) })} />

                        <label>Rotate (deg)</label>
                        <input type="range" min={-180} max={180} step={1} value={r.rotDeg || 0} onChange={(e) => update({ rotDeg: Number(e.target.value) })} />

                        <label>Default Wall Height</label>
                        <input type="number" min={0.5} step={0.1} value={r.h || DEFAULT_WALL_HEIGHT} onChange={(e) => update({ h: Math.max(0.5, Number(e.target.value)) })} />

                        <label>Floor Y</label>
                        <input type="number" step={0.05} value={r.floorY ?? 0} onChange={(e) => update({ floorY: Number(e.target.value) })} />

                        <label>Roof/Floor Thickness</label>
                        <input type="number" min={0.01} step={0.01} value={r.roofT ?? DEFAULT_SLAB_THICKNESS} onChange={(e) => update({ roofT: Math.max(0.01, Number(e.target.value)) })} />
                    </div>

                    {/* Edge tools */}
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #2b2b2b" }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                            {r.edges.map((e) => (
                                <button
                                    key={e.id}
                                    onClick={() => setSelectedEdge({ roomIndex: selected, side: e.side })}
                                    style={{
                                        padding: "4px 8px",
                                        borderRadius: 6,
                                        background: (selectedEdge && selectedEdge.roomIndex === selected && selectedEdge.side === e.side) ? "#324d7a" : "#1e293b",
                                        color: "#e6edf3",
                                        border: "1px solid #2b3a55"
                                    }}
                                >
                                    Edge {e.side}
                                </button>
                            ))}
                        </div>

                        {selectedEdge && selectedEdge.roomIndex === selected && (() => {
                            const e = r.edges.find((ed) => ed.side === selectedEdge.side);
                            if (!e) return null;
                            const setE = (patch) => updateEdge(e.side, patch);
                            return (
                                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                                    <label>Present</label>
                                    <input type="checkbox" checked={!!e.present} onChange={(ev) => setE({ present: ev.target.checked })} />

                                    <label>Door?</label>
                                    <input type="checkbox" checked={!!e.door} onChange={(ev) => setE({ door: ev.target.checked ? (e.door || { width: 1.2, offset: 0 }) : null })} />

                                    <label>Door Width</label>
                                    <input type="number" min={0} step={0.1} value={e.door?.width || 0} onChange={(ev) => setE({ door: { ...(e.door || {}), width: Math.max(0, Number(ev.target.value)) } })} />

                                    <label>Door Offset</label>
                                    <input type="number" step={0.1} value={e.door?.offset || 0} onChange={(ev) => setE({ door: { ...(e.door || {}), offset: Number(ev.target.value) } })} />

                                    <label>Edge Height</label>
                                    <input type="number" min={0.5} step={0.1} value={e.h || r.h || DEFAULT_WALL_HEIGHT} onChange={(ev) => setE({ h: Math.max(0.5, Number(ev.target.value)) })} />

                                    <div style={{ gridColumn: "1 / span 2", display: "flex", gap: 8, marginTop: 6 }}>
                                        <button onClick={() => setE({ present: false })}>Delete Edge</button>
                                        <button onClick={() => setE({ present: true })}>Restore Edge</button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </>
            )}

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Draw: click “Draw Room” then drag on the ground. Click a wall to select its edge. Y axis is height.
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
    width: 500,
    fontSize: 12,
    lineHeight: 1.35,
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    maxHeight: "90vh",
    overflow: "auto",
};
