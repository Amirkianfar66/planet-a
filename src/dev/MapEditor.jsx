// src/dev/MapEditor.jsx
// Draw-rect editor with: rooms, per-edge doors/heights, rotation,
// per-room floor/roof toggles, FREE floor slabs (outside), colors/materials,
// and JSON export that contains rooms, walls, wallAABBs, floors, roofs.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";

// ---- room tools (robust import)
import * as RT from "../map/roomTools";
const WALL_THICKNESS = RT.WALL_THICKNESS ?? 0.6;
const DEFAULT_WALL_HEIGHT = RT.DEFAULT_WALL_HEIGHT ?? 2.4;
const DEFAULT_SLAB_THICKNESS = RT.DEFAULT_SLAB_THICKNESS ?? 0.12;

const makeRoom = RT.makeRoom;
const wallsForRoomLocal = RT.wallsForRoomLocal;
const packMap = RT.packMap;
const legacySaveDraftRooms = RT.saveDraft;
const legacyLoadDraftRooms = RT.loadDraft;

// Use your deck rooms as a seed
import { ROOMS as INITIAL_DECK_ROOMS } from "../map/deckA";

// ---------------- Context ----------------
const Ctx = createContext(null);
export const useMapEditor = () => useContext(Ctx);

// LocalStorage helpers for combined draft (rooms + floors)
const LS_KEY_V3 = "mapEditorDraft_v3";

function loadDraftV3() {
    try {
        const raw = localStorage.getItem(LS_KEY_V3);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const rooms = Array.isArray(parsed.rooms) ? parsed.rooms.map((r) => makeRoom(r)) : [];
        const floors = Array.isArray(parsed.floors) ? parsed.floors : [];
        return { rooms, floors };
    } catch {
        return null;
    }
}

function saveDraftV3(rooms, floors) {
    try {
        localStorage.setItem(LS_KEY_V3, JSON.stringify({ rooms, floors }, null, 2));
    } catch { }
}

export function MapEditorProvider({ children, initialRooms = INITIAL_DECK_ROOMS, enabled = true }) {
    // Seed rooms & floors: prefer v3 (rooms+floors), else legacy rooms only, else deck rooms
    const seed = useMemo(() => {
        const v3 = loadDraftV3();
        if (v3) return v3;

        const legacyRooms = legacyLoadDraftRooms?.();
        if (legacyRooms && Array.isArray(legacyRooms)) return { rooms: legacyRooms, floors: [] };

        return { rooms: (initialRooms || []).map((r) => makeRoom({ ...r })), floors: [] };
    }, [initialRooms]);

    const [rooms, setRooms] = useState(seed.rooms);
    const [floors, setFloors] = useState(seed.floors); // free slabs
    const [selected, setSelected] = useState(0);       // room index
    const [selFloor, setSelFloor] = useState(null);    // floor slab index
    const [selectedEdge, setSelectedEdge] = useState(null); // {roomIndex, side}
    const [showGrid, setShowGrid] = useState(true);
    const [snap, setSnap] = useState(0.5);

    // global visibility toggles
    const [showFloors, setShowFloors] = useState(true);
    const [showRoofs, setShowRoofs] = useState(true);

    // draw interaction
    const [draw, setDraw] = useState({ active: false, kind: "room" }); // kind: 'room' | 'floor'
    const [drawStart, setDrawStart] = useState(null); // {x,z}
    const [drawCurr, setDrawCurr] = useState(null);

    // ensure keys once on rooms
    useEffect(() => {
        setRooms((prev) => prev.map((r, i) => ({ ...r, key: r.key || `room_${i}` })));
    }, []);

    const api = useMemo(
        () => ({
            rooms, setRooms,
            floors, setFloors,
            selected, setSelected,
            selFloor, setSelFloor,
            selectedEdge, setSelectedEdge,
            showGrid, setShowGrid,
            snap, setSnap,
            draw, setDraw, drawStart, setDrawStart, drawCurr, setDrawCurr,
            showFloors, setShowFloors, showRoofs, setShowRoofs,
        }),
        [rooms, floors, selected, selFloor, selectedEdge, showGrid, snap, draw, drawStart, drawCurr, showFloors, showRoofs]
    );

    if (!enabled) return children;
    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// ---------------- 3D Layer ----------------
export function MapEditor3D() {
    const {
        rooms, setRooms,
        floors, setFloors,
        selected, setSelected,
        selFloor, setSelFloor,
        selectedEdge, setSelectedEdge,
        showGrid, snap,
        draw, setDraw, drawStart, setDrawStart, drawCurr, setDrawCurr,
        showFloors, showRoofs,
    } = useMapEditor();

    const matRoom = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.18 }), []);
    const matRoomSel = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffc14e, transparent: true, opacity: 0.28 }), []);
    const matSelEdge = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xff6767 }), []);
    const matDraw = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x22cc88, transparent: true, opacity: 0.25 }), []);

    // helpers to preview colors from data
    const colorOf = (hex, fallback) => {
        if (!hex) return fallback;
        try { return new THREE.Color(hex); } catch { return fallback; }
    };

    const wallColorOf = (room, side) => {
        const edge = room.edges?.find(e => e.side === side);
        const c = edge?.mat?.color || room.wallMat?.color;
        return colorOf(c, new THREE.Color("#9aa4b2"));
    };
    const floorColorOf = (room) => colorOf(room.floorMat?.color, new THREE.Color("#30363d"));
    const roofColorOf = (room) => colorOf(room.roofMat?.color, new THREE.Color("#232a31"));

    // ground draw interactions
    const onGroundDown = (e) => {
        if (!draw.active) return;
        e.stopPropagation();
        const p = e.point;
        setDrawStart({ x: p.x, z: p.z });
        setDrawCurr({ x: p.x, z: p.z });
    };
    const onGroundMove = (e) => {
        if (!draw.active || !drawStart) return;
        const p = e.point;
        setDrawCurr({ x: p.x, z: p.z });
    };
    const onGroundUp = () => {
        if (!draw.active || !drawStart || !drawCurr) return;
        const w = Math.abs(drawCurr.x - drawStart.x);
        const d = Math.abs(drawCurr.z - drawStart.z);
        if (w >= 0.5 && d >= 0.5) {
            const cx = (drawCurr.x + drawStart.x) / 2;
            const cz = (drawCurr.z + drawStart.z) / 2;
            const snapV = (v) => (snap ? Math.round(v / snap) * snap : v);
            if (draw.kind === "room") {
                const room = makeRoom({
                    name: `Room ${rooms.length + 1}`,
                    x: snapV(cx), z: snapV(cz), w: snapV(w), d: snapV(d),
                    floorY: 0, roofT: DEFAULT_SLAB_THICKNESS,
                    hasFloor: true, hasRoof: true,
                    exported: true,
                    wallMat: { color: "#9aa4b2" },
                    floorMat: { color: "#30363d" },
                    roofMat: { color: "#232a31" },
                });
                setRooms((prev) => [...prev, room]);
                setSelected(rooms.length);
                setSelFloor(null);
                setSelectedEdge(null);
            } else {
                // free floor slab
                const slab = makeSlab({
                    name: `Floor ${floors.length + 1}`,
                    x: snapV(cx), z: snapV(cz), w: snapV(w), d: snapV(d),
                    y: 0 + DEFAULT_SLAB_THICKNESS / 2,
                    t: DEFAULT_SLAB_THICKNESS,
                    exported: true,
                    mat: { color: "#30363d" },
                });
                setFloors((prev) => [...prev, slab]);
                setSelFloor(floors.length);
                setSelected(null);
                setSelectedEdge(null);
            }
        }
        setDrawStart(null); setDrawCurr(null);
    };

    // gizmo move handler
    const onGizmoChange = (v) => {
        const x = snap ? Math.round(v.x / snap) * snap : v.x;
        const z = snap ? Math.round(v.z / snap) * snap : v.z;
        if (selFloor != null) {
            setFloors((prev) => prev.map((s, i) => (i === selFloor ? { ...s, x, z } : s)));
            return;
        }
        const idx = selected;
        if (idx == null || idx < 0 || idx >= rooms.length) return;
        setRooms((prev) => prev.map((rr, i) => (i === idx ? { ...rr, x, z } : rr)));
    };

    const selRoom = rooms[selected];
    const gizmoPos = selFloor != null
        ? [floors[selFloor]?.x ?? 0, 0, floors[selFloor]?.z ?? 0]
        : selRoom ? [selRoom.x, 0, selRoom.z] : null;

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
            {draw.active && drawStart && drawCurr && (
                <mesh rotation={[-Math.PI / 2, 0, 0]}
                    position={[(drawStart.x + drawCurr.x) / 2, 0.02, (drawStart.z + drawCurr.z) / 2]}>
                    <planeGeometry args={[
                        Math.max(0.01, Math.abs(drawCurr.x - drawStart.x)),
                        Math.max(0.01, Math.abs(drawCurr.z - drawStart.z)),
                    ]} />
                    <primitive attach="material" object={matDraw} />
                </mesh>
            )}

            {/* FREE FLOOR SLABS */}
            {floors.map((f, i) => (
                <group key={f.id || i} position={[f.x, 0, f.z]}
                    onPointerDown={(e) => { e.stopPropagation(); setSelFloor(i); setSelected(null); setSelectedEdge(null); }}>
                    <mesh position={[0, (f.t ?? DEFAULT_SLAB_THICKNESS) / 2 + (f.y ?? 0) - (DEFAULT_SLAB_THICKNESS / 2), 0]}>
                        <boxGeometry args={[f.w, f.t ?? DEFAULT_SLAB_THICKNESS, f.d]} />
                        <meshStandardMaterial color={colorOf(f.mat?.color, new THREE.Color("#30363d"))} roughness={0.9} metalness={0.0} />
                    </mesh>
                </group>
            ))}

            {/* ROOMS */}
            {rooms.map((r, i) => {
                const isSel = i === selected && selFloor == null;
                const localWalls = wallsForRoomLocal(r, WALL_THICKNESS);
                const thick = r.roofT ?? DEFAULT_SLAB_THICKNESS;
                const floorYCenter = (r.floorY ?? 0) + thick / 2;
                const roofYCenter = (r.floorY ?? 0) + (r.h || DEFAULT_WALL_HEIGHT) - thick / 2;

                return (
                    <group key={r.key || i}
                        position={[r.x, 0, r.z]}
                        rotation={[0, (r.rotDeg || 0) * Math.PI / 180, 0]}
                        onPointerDown={(e) => { e.stopPropagation(); setSelected(i); setSelFloor(null); }}>
                        {/* floor slab */}
                        {showFloors && r.hasFloor !== false && (
                            <mesh position={[0, floorYCenter, 0]}
                                onPointerDown={(e) => { e.stopPropagation(); setSelected(i); setSelFloor(null); }}>
                                <boxGeometry args={[r.w, thick, r.d]} />
                                <meshStandardMaterial color={floorColorOf(r)} roughness={0.9} metalness={0.0} />
                            </mesh>
                        )}

                        {/* footprint overlay */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, (r.floorY ?? 0) + 0.02, 0]}
                            onPointerDown={(e) => { e.stopPropagation(); setSelected(i); setSelFloor(null); }}>
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
                                    setSelFloor(null);
                                    setSelectedEdge({ roomIndex: i, side: w.side });
                                }}>
                                <boxGeometry args={[w.w, w.h || DEFAULT_WALL_HEIGHT, w.d]} />
                                <meshStandardMaterial color={wallColorOf(r, w.side)} roughness={0.9} metalness={0.0} />
                            </mesh>
                        ))}

                        {/* roof slab */}
                        {showRoofs && r.hasRoof !== false && (
                            <mesh position={[0, roofYCenter, 0]}
                                onPointerDown={(e) => { e.stopPropagation(); setSelected(i); setSelFloor(null); }}>
                                <boxGeometry args={[r.w, thick, r.d]} />
                                <meshStandardMaterial color={roofColorOf(r)} roughness={0.85} metalness={0.0} />
                            </mesh>
                        )}
                    </group>
                );
            })}

            {/* move gizmo */}
            {gizmoPos && <GizmoTranslate position={gizmoPos} onChange={onGizmoChange} />}
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

// util for free floor slabs
function makeSlab({ name = "Floor", x = 0, z = 0, w = 4, d = 3, t = DEFAULT_SLAB_THICKNESS, y = 0, exported = true, mat = null } = {}) {
    return {
        id: `slab_${Math.random().toString(36).slice(2, 8)}`,
        name, x, z, w, d, t, y, exported, mat,
    };
}

// ---------------- UI Panel ----------------
export function MapEditorUI() {
    const {
        rooms, setRooms,
        floors, setFloors,
        selected, setSelected,
        selFloor, setSelFloor,
        selectedEdge, setSelectedEdge,
        showGrid, setShowGrid,
        snap, setSnap,
        draw, setDraw,
        showFloors, setShowFloors, showRoofs, setShowRoofs,
    } = useMapEditor();

    const r = rooms[selected];
    const f = selFloor != null ? floors[selFloor] : null;

    const updateRoom = (patch) => setRooms((prev) => prev.map((it, i) => (i === selected ? { ...it, ...patch } : it)));
    const updateEdge = (side, patch) => setRooms((prev) => prev.map((it, i) => {
        if (i !== selected) return it;
        const edges = it.edges.map((e) => e.side === side ? { ...e, ...patch } : e);
        return { ...it, edges };
    }));
    const updateFloor = (patch) => {
        if (selFloor == null) return;
        setFloors((prev) => prev.map((it, i) => (i === selFloor ? { ...it, ...patch } : it)));
    };

    // helpers
    const uniqueKey = (desired) => {
        if (!desired) return "";
        let k = desired, n = 2;
        const has = (kk) => rooms.some((rr) => rr.key === kk);
        while (has(k)) k = `${desired}_${n++}`;
        return k;
    };

    const mkLockdown = (x = 0, z = 0) => makeRoom({
        key: uniqueKey("lockdown"),
        name: "Lockdown",
        type: "lockdown",
        exported: true,
        hasFloor: true, hasRoof: true,
        x, z, w: 4.5, d: 3.0, h: 2.4,
        wallMat: { color: "#9aa4b2" },
        floorMat: { color: "#30363d" },
        roofMat: { color: "#232a31" },
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
        hasFloor: true, hasRoof: true,
        x, z, w: 6.0, d: 4.0, h: 2.4,
        wallMat: { color: "#9aa4b2" },
        floorMat: { color: "#30363d" },
        roofMat: { color: "#232a31" },
        edges: [
            { side: "N", present: true, door: null },
            { side: "E", present: true, door: { width: 1.6, offset: 0 } },
            { side: "S", present: true, door: null },
            { side: "W", present: true, door: null },
        ],
    });

    // room actions
    const addRoom = () => {
        const idx = rooms.length;
        setRooms((prev) => [...prev, makeRoom({
            key: `room_${idx}`, name: `Room ${idx + 1}`, x: 0, z: 0, w: 4, d: 3,
            exported: true, hasFloor: true, hasRoof: true,
            wallMat: { color: "#9aa4b2" }, floorMat: { color: "#30363d" }, roofMat: { color: "#232a31" }
        })]);
        setSelected(idx);
        setSelFloor(null);
        setSelectedEdge(null);
    };
    const addLockdown = () => {
        const base = rooms[selected];
        const x = base ? base.x + (base.w || 4) / 2 + 1 : 0;
        const z = base ? base.z : 0;
        const idx = rooms.length;
        setRooms((prev) => [...prev, mkLockdown(x, z)]);
        setSelected(idx);
        setSelFloor(null);
        setSelectedEdge(null);
    };
    const addMeetingRoom = () => {
        const base = rooms[selected];
        const x = base ? base.x - (base.w || 4) / 2 - 1 : 0;
        const z = base ? base.z : 0;
        const idx = rooms.length;
        setRooms((prev) => [...prev, mkMeetingRoom(x, z)]);
        setSelected(idx);
        setSelFloor(null);
        setSelectedEdge(null);
    };
    const duplicateRoom = () => {
        if (!r) return;
        const idx = rooms.length;
        setRooms((prev) => [...prev, makeRoom({ ...r, key: uniqueKey(`${r.key || "room"}_copy`) })]);
        setSelected(idx);
        setSelFloor(null);
        setSelectedEdge(null);
    };
    const deleteRoom = () => {
        if (!r) return;
        const next = rooms.filter((_, i) => i !== selected);
        setRooms(next);
        setSelected(Math.max(0, selected - 1));
        setSelFloor(null);
        setSelectedEdge(null);
    };

    // floor slab actions
    const addFloor = () => {
        const idx = floors.length;
        setFloors((prev) => [...prev, makeSlab({ name: `Floor ${idx + 1}`, x: 0, z: 0, w: 6, d: 6, t: DEFAULT_SLAB_THICKNESS, y: 0, exported: true, mat: { color: "#30363d" } })]);
        setSelFloor(idx);
        setSelected(null);
        setSelectedEdge(null);
    };
    const duplicateFloor = () => {
        if (selFloor == null) return;
        const src = floors[selFloor];
        const idx = floors.length;
        setFloors((prev) => [...prev, { ...src, id: `slab_${Math.random().toString(36).slice(2, 8)}`, name: `${src.name || "Floor"} copy` }]);
        setSelFloor(idx);
    };
    const deleteFloor = () => {
        if (selFloor == null) return;
        const next = floors.filter((_, i) => i !== selFloor);
        setFloors(next);
        setSelFloor(next.length ? Math.max(0, selFloor - 1) : null);
    };

    // Save / Export
    const saveDraft = () => {
        saveDraftV3(rooms, floors);         // combined draft
        legacySaveDraftRooms?.(rooms);      // keep legacy save updated (optional)
    };

    const download = () => {
        // Filter exported rooms
        const exportRooms = rooms.filter((rm) => rm.exported !== false);

        // Use packMap (gives walls & AABBs)
        const packed = packMap ? packMap(exportRooms) : { rooms: exportRooms, walls: [], wallAABBs: [] };

        // Build floors/roofs:
        const floorsFromRooms = exportRooms
            .filter((rm) => rm.hasFloor !== false)
            .map((rm) => {
                const t = Math.max(0.01, rm.roofT ?? DEFAULT_SLAB_THICKNESS);
                const yCenter = (rm.floorY ?? 0) + t / 2;
                return { x: rm.x, y: yCenter, z: rm.z, w: rm.w, d: rm.d, t, mat: rm.floorMat || null };
            });

        const roofsFromRooms = exportRooms
            .filter((rm) => rm.hasRoof !== false)
            .map((rm) => {
                const t = Math.max(0.01, rm.roofT ?? DEFAULT_SLAB_THICKNESS);
                const h = rm.h ?? DEFAULT_WALL_HEIGHT;
                const yCenter = (rm.floorY ?? 0) + h - t / 2;
                return { x: rm.x, y: yCenter, z: rm.z, w: rm.w, d: rm.d, t, mat: rm.roofMat || null };
            });

        const freeFloors = floors
            .filter((s) => s.exported !== false)
            .map((s) => ({ x: s.x, y: s.y ?? 0, z: s.z, w: s.w, d: s.d, t: s.t ?? DEFAULT_SLAB_THICKNESS, name: s.name, mat: s.mat || null }));

        const data = {
            rooms: exportRooms,
            walls: packed.walls || [],
            wallAABBs: packed.wallAABBs || [],
            floors: [...floorsFromRooms, ...freeFloors],
            roofs: [...roofsFromRooms],
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "defaultMap.json";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    };

    return createPortal(
        <div style={panelStyle}>
            {/* header + actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <strong>Map Editor</strong>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={addRoom}>+ Room</button>
                    <button onClick={addLockdown}>+ Lockdown</button>
                    <button onClick={addMeetingRoom}>+ MeetingRoom</button>
                    <button onClick={duplicateRoom} disabled={!r}>Duplicate Room</button>
                    <button onClick={deleteRoom} disabled={!r}>Delete Room</button>
                </div>
            </div>

            {/* global toggles */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <label><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
                <label>Snap
                    <input type="number" step={0.1} value={snap} onChange={(e) => setSnap(Number(e.target.value) || 0)} style={{ width: 64, marginLeft: 6 }} />
                </label>
                <label><input type="checkbox" checked={showFloors} onChange={(e) => setShowFloors(e.target.checked)} /> Floors</label>
                <label><input type="checkbox" checked={showRoofs} onChange={(e) => setShowRoofs(e.target.checked)} /> Roofs</label>

                {/* draw modes */}
                <button
                    onClick={() => setDraw((d) => ({ active: !d.active || d.kind !== "room", kind: "room" }))}
                    style={{ background: draw.active && draw.kind === "room" ? "#2f6f4f" : undefined }}
                >
                    {draw.active && draw.kind === "room" ? "Drawing Room…" : "Draw Room"}
                </button>
                <button
                    onClick={() => setDraw((d) => ({ active: !d.active || d.kind !== "floor", kind: "floor" }))}
                    style={{ background: draw.active && draw.kind === "floor" ? "#2f6f4f" : undefined }}
                >
                    {draw.active && draw.kind === "floor" ? "Drawing Floor…" : "Draw Floor"}
                </button>

                <button onClick={saveDraft}>Save Draft</button>
                <button onClick={download}>Export JSON</button>
            </div>

            {/* room list */}
            <div style={{ maxHeight: 160, overflow: "auto", padding: 6, border: "1px solid #2b2b2b", borderRadius: 6, marginBottom: 8 }}>
                {rooms.map((it, i) => (
                    <div
                        key={it.key}
                        style={{
                            padding: 4, background: i === selected && selFloor == null ? "#1f2a44" : "transparent",
                            borderRadius: 4, cursor: "pointer", display: "flex", justifyContent: "space-between"
                        }}
                        onClick={() => { setSelected(i); setSelFloor(null); setSelectedEdge(null); }}
                    >
                        <span>{it.name}</span>
                        <span style={{ opacity: 0.7 }}>
                            {it.key} · {it.type || "generic"} · {it.exported === false ? "not exported" : "exported"}
                        </span>
                    </div>
                ))}
            </div>

            {/* FREE FLOORS list */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong>Free Floors</strong>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addFloor}>+ Add Floor</button>
                    <button onClick={duplicateFloor} disabled={selFloor == null}>Duplicate</button>
                    <button onClick={deleteFloor} disabled={selFloor == null}>Delete</button>
                </div>
            </div>
            <div style={{ maxHeight: 120, overflow: "auto", padding: 6, border: "1px solid #2b2b2b", borderRadius: 6, marginBottom: 8 }}>
                {floors.map((it, i) => (
                    <div key={it.id || i}
                        style={{
                            padding: 4, background: i === selFloor ? "#183a2e" : "transparent",
                            borderRadius: 4, cursor: "pointer", display: "flex", justifyContent: "space-between"
                        }}
                        onClick={() => { setSelFloor(i); setSelected(null); setSelectedEdge(null); }}>
                        <span>{it.name || `Floor ${i + 1}`}</span>
                        <span style={{ opacity: 0.7 }}>
                            {it.exported === false ? "not exported" : "exported"} · {it.w?.toFixed(1)}×{it.d?.toFixed(1)} @ ({it.x?.toFixed(1)},{it.z?.toFixed(1)})
                        </span>
                    </div>
                ))}
            </div>

            {/* ROOM fields */}
            {r && selFloor == null && (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                        <label>Key</label>
                        <input value={r.key} onChange={(e) => { const v = e.target.value.trim(); if (v) updateRoom({ key: v }); }} />

                        <label>Name</label>
                        <input value={r.name} onChange={(e) => updateRoom({ name: e.target.value })} />

                        <label>Type</label>
                        <input value={r.type || ""} onChange={(e) => updateRoom({ type: e.target.value })} placeholder="lockdown / meeting_room / ..." />

                        <label>Export?</label>
                        <input type="checkbox" checked={r.exported !== false} onChange={(e) => updateRoom({ exported: e.target.checked })} />

                        <label>Has Floor?</label>
                        <input type="checkbox" checked={r.hasFloor !== false} onChange={(e) => updateRoom({ hasFloor: e.target.checked })} />

                        <label>Has Roof?</label>
                        <input type="checkbox" checked={r.hasRoof !== false} onChange={(e) => updateRoom({ hasRoof: e.target.checked })} />

                        <label>Center X</label>
                        <input type="number" step={0.1} value={r.x} onChange={(e) => updateRoom({ x: Number(e.target.value) })} />

                        <label>Center Z</label>
                        <input type="number" step={0.1} value={r.z} onChange={(e) => updateRoom({ z: Number(e.target.value) })} />

                        <label>Width (w)</label>
                        <input type="number" min={0.5} step={0.1} value={r.w} onChange={(e) => updateRoom({ w: Math.max(0.5, Number(e.target.value)) })} />

                        <label>Depth (d)</label>
                        <input type="number" min={0.5} step={0.1} value={r.d} onChange={(e) => updateRoom({ d: Math.max(0.5, Number(e.target.value)) })} />

                        <label>Rotate (deg)</label>
                        <input type="range" min={-180} max={180} step={1} value={r.rotDeg || 0} onChange={(e) => updateRoom({ rotDeg: Number(e.target.value) })} />

                        <label>Default Wall Height</label>
                        <input type="number" min={0.5} step={0.1} value={r.h || DEFAULT_WALL_HEIGHT} onChange={(e) => updateRoom({ h: Math.max(0.5, Number(e.target.value)) })} />

                        <label>Floor Y</label>
                        <input type="number" step={0.05} value={r.floorY ?? 0} onChange={(e) => updateRoom({ floorY: Number(e.target.value) })} />

                        <label>Roof/Floor Thickness</label>
                        <input type="number" min={0.01} step={0.01} value={r.roofT ?? DEFAULT_SLAB_THICKNESS} onChange={(e) => updateRoom({ roofT: Math.max(0.01, Number(e.target.value)) })} />

                        {/* colors */}
                        <label>Wall Color</label>
                        <input type="color"
                            value={(r.wallMat?.color) || "#9aa4b2"}
                            onChange={(e) => updateRoom({ wallMat: { ...(r.wallMat || {}), color: e.target.value } })}
                        />

                        <label>Floor Color</label>
                        <input type="color"
                            value={(r.floorMat?.color) || "#30363d"}
                            onChange={(e) => updateRoom({ floorMat: { ...(r.floorMat || {}), color: e.target.value } })}
                        />

                        <label>Roof Color</label>
                        <input type="color"
                            value={(r.roofMat?.color) || "#232a31"}
                            onChange={(e) => updateRoom({ roofMat: { ...(r.roofMat || {}), color: e.target.value } })}
                        />
                    </div>

                    {/* Edges */}
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

                                    <label>Edge Color</label>
                                    <input type="color"
                                        value={(e.mat?.color) || (r.wallMat?.color) || "#9aa4b2"}
                                        onChange={(ev) => setE({ mat: { ...(e.mat || {}), color: ev.target.value } })}
                                    />

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

            {/* FREE FLOOR fields */}
            {f && (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                        <label>Name</label>
                        <input value={f.name || ""} onChange={(e) => updateFloor({ name: e.target.value })} />

                        <label>Export?</label>
                        <input type="checkbox" checked={f.exported !== false} onChange={(e) => updateFloor({ exported: e.target.checked })} />

                        <label>Center X</label>
                        <input type="number" step={0.1} value={f.x} onChange={(e) => updateFloor({ x: Number(e.target.value) })} />

                        <label>Center Z</label>
                        <input type="number" step={0.1} value={f.z} onChange={(e) => updateFloor({ z: Number(e.target.value) })} />

                        <label>Width (w)</label>
                        <input type="number" min={0.1} step={0.1} value={f.w} onChange={(e) => updateFloor({ w: Math.max(0.1, Number(e.target.value)) })} />

                        <label>Depth (d)</label>
                        <input type="number" min={0.1} step={0.1} value={f.d} onChange={(e) => updateFloor({ d: Math.max(0.1, Number(e.target.value)) })} />

                        <label>Thickness (t)</label>
                        <input type="number" min={0.01} step={0.01} value={f.t ?? DEFAULT_SLAB_THICKNESS} onChange={(e) => updateFloor({ t: Math.max(0.01, Number(e.target.value)) })} />

                        <label>Y center</label>
                        <input type="number" step={0.05} value={f.y ?? 0} onChange={(e) => updateFloor({ y: Number(e.target.value) })} />

                        <label>Color</label>
                        <input type="color"
                            value={(f.mat?.color) || "#30363d"}
                            onChange={(e) => updateFloor({ mat: { ...(f.mat || {}), color: e.target.value } })}
                        />
                    </div>
                </>
            )}

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Tip: choose “Draw Room” or “Draw Floor”, drag on ground to create. Click a slab/room to move with the gizmo.
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
    width: 520,
    fontSize: 12,
    lineHeight: 1.35,
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    maxHeight: "90vh",
    overflow: "auto",
};
