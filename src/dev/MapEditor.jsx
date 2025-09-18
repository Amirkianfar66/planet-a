// src/dev/MapEditor.jsx
// Draw-rect editor with rooms, per-edge doors (sliding), floors/roofs,
// free floor slabs, materials (color or textures), labels (Text),
// load default JSON / load file, and export.
// Includes: clickable/movable Game Objects (items/devices) with TransformControls.

import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    Suspense,
} from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { TransformControls, Text, Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import WorldGLB from "../world/WorldGLB";
// door preview
import { SlidingDoor as Door3D } from "../dev/SlidingDoorPreview";
// game objects data
import { ITEM_TYPES, INITIAL_ITEMS as SEED_ITEMS, DEVICES as SEED_DEVICES } from "../data/gameObjects";
// (runtime renderer kept untouched)
import ItemsAndDevices from "../world/ItemsAndDevices.jsx";

// ---- room tools
import * as RT from "../map/roomTools";
const WALL_THICKNESS = RT.WALL_THICKNESS ?? 0.6;
const DEFAULT_WALL_HEIGHT = RT.DEFAULT_WALL_HEIGHT ?? 2.4;
const DEFAULT_SLAB_THICKNESS = RT.DEFAULT_SLAB_THICKNESS ?? 0.12;

const makeRoom = RT.makeRoom;
const wallsForRoomLocal = RT.wallsForRoomLocal;
const packMap = RT.packMap;
const legacySaveDraftRooms = RT.saveDraft;
const legacyLoadDraftRooms = RT.loadDraft;

// rooms seed
import { ROOMS as INITIAL_DECK_ROOMS } from "../map/deckA";

// ---------------- Textured material helpers ----------------
function useTiledTexture(url, repeat = [1, 1], rotation = 0, anisotropy = 8) {
    return useMemo(() => {
        if (!url) return null;
        const tex = new THREE.TextureLoader().load(url);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const rx = Number(repeat?.[0] ?? 1) || 1;
        const ry = Number(repeat?.[1] ?? 1) || 1;
        tex.repeat.set(rx, ry);
        tex.rotation = rotation || 0;
        tex.center.set(0.5, 0.5);
        tex.anisotropy = anisotropy;
        tex.needsUpdate = true;
        return tex;
    }, [url, repeat?.[0], repeat?.[1], rotation, anisotropy]);
}

function TiledStandardMaterial({
    mapUrl,
    color = "#808080",
    repeat = [1, 1],
    rotation = 0,
    roughness = 0.9,
    metalness = 0.0,
    normalUrl = null,
    roughnessUrl = null,
    aoUrl = null,
    emissive = null,
    emissiveIntensity = 1,
    anisotropy = 8,
}) {
    const map = useTiledTexture(mapUrl, repeat, rotation, anisotropy);
    const normalMap = useTiledTexture(normalUrl, repeat, rotation, anisotropy);
    const roughnessMap = useTiledTexture(roughnessUrl, repeat, rotation, anisotropy);
    const aoMap = useTiledTexture(aoUrl, repeat, rotation, anisotropy);
    return (
        <meshStandardMaterial
            color={color}
            map={map || null}
            normalMap={normalMap || null}
            roughnessMap={roughnessMap || null}
            aoMap={aoMap || null}
            roughness={roughness}
            metalness={metalness}
            emissive={emissive || undefined}
            emissiveIntensity={emissive ? emissiveIntensity : undefined}
        />
    );
}

const matFrom = (base, fallbackColor) => ({
    color: base?.color || fallbackColor,
    mapUrl: base?.mapUrl || null,
    repeat: base?.repeat || [1, 1],
    rotation: base?.rotation || 0,
    roughness: base?.roughness ?? 0.9,
    metalness: base?.metalness ?? 0.0,
    normalUrl: base?.normalUrl || null,
    roughnessUrl: base?.roughnessUrl || null,
    aoUrl: base?.aoUrl || null,
    emissive: base?.emissive || null,
    emissiveIntensity: base?.emissiveIntensity ?? 1,
});

// ---- Door helpers ----
const DEFAULT_DOOR = { offset: 0 };
function coalesceDoor(door) {
    if (!door) return null;
    if (Array.isArray(door)) return { ...door[0] }; // legacy
    if (door === true) return { ...DEFAULT_DOOR };   // legacy
    if (typeof door === "object") return { ...door };
    return null;
}
function clampDoorProps(door, len, wallH, wallT) {
    if (!door) return null;
    const half = Number.isFinite(len) ? Math.max(0, len / 2) : 0;

    const rawW = Number(door.width);
    const fallbackW = 2.4;
    const width = Math.min(
        Math.max(0.4, Number.isFinite(rawW) ? rawW : fallbackW),
        Math.max(0, (Number.isFinite(len) ? len : fallbackW) - 0.1)
    );
    const rawH = Number(door.height);
    const height = Math.max(
        0.5,
        Number.isFinite(rawH) ? rawH : ((Number.isFinite(wallH) ? wallH : DEFAULT_WALL_HEIGHT) - 0.12)
    );
    const rawPanels = Number(door.panels);
    const panels = Math.max(1, Math.min(2, Number.isFinite(rawPanels) ? rawPanels : 2));
    const rawOpen = Number(door.open);
    const open = Math.max(0, Math.min(1, Number.isFinite(rawOpen) ? rawOpen : 0));
    const rawOff = Number(door.offset);
    const offset = THREE.MathUtils.clamp(
        Number.isFinite(rawOff) ? rawOff : 0,
        -half + width / 2,
        half - width / 2
    );
    const rawT = Number(door.thickness);
    const thickness = Math.min(
        0.3,
        Number.isFinite(rawT) ? rawT : ((Number.isFinite(wallT) ? wallT : WALL_THICKNESS) * 0.9)
    );
    return { ...door, width, height, panels, open, offset, thickness };
}
function normalizeRoomSingleDoor(room) {
    const edges = (room.edges || []).map((e) => ({ ...e, door: coalesceDoor(e.door) }));
    return { ...room, edges };
}

// ---------------- Context ----------------
const Ctx = createContext(null);
export const useMapEditor = () => useContext(Ctx);

// LocalStorage helpers (rooms + floors)
const LS_KEY_V3 = "mapEditorDraft_v3";
function loadDraftV3() {
    try {
        const raw = localStorage.getItem(LS_KEY_V3);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const rooms = Array.isArray(parsed.rooms)
            ? parsed.rooms.map((r) => normalizeRoomSingleDoor(makeRoom(r)))
            : [];
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

// ---------------- Provider ----------------
export function MapEditorProvider({
    children,
    initialRooms = INITIAL_DECK_ROOMS,
    enabled = true,
}) {
    const seed = useMemo(() => {
        const v3 = loadDraftV3();
        if (v3) return v3;

        const legacyRooms = legacyLoadDraftRooms?.();
        if (legacyRooms && Array.isArray(legacyRooms))
            return {
                rooms: legacyRooms.map((r) => normalizeRoomSingleDoor(makeRoom(r))),
                floors: [],
            };

        return {
            rooms: (initialRooms || []).map((r) => normalizeRoomSingleDoor(makeRoom({ ...r }))),
            floors: [],
        };
    }, [initialRooms]);

    const [rooms, setRooms] = useState(seed.rooms);
    const [floors, setFloors] = useState(seed.floors);
    const [selected, setSelected] = useState(0); // room index
    const [selFloor, setSelFloor] = useState(null); // floor slab index
    const [selectedEdge, setSelectedEdge] = useState(null); // {roomIndex, side}
    const [showGrid, setShowGrid] = useState(true);
    const [snap, setSnap] = useState(0.5);

    const [showFloors, setShowFloors] = useState(true);
    const [showRoofs, setShowRoofs] = useState(true);

    const [draw, setDraw] = useState({ active: false, kind: "room" }); // 'room' | 'floor'
    const [drawStart, setDrawStart] = useState(null);
    const [drawCurr, setDrawCurr] = useState(null);
    const [worldGLB, setWorldGLB] = useState({
        enabled: true,
        url: "/models/world.glb",
        x: 0,
        y: 0,
        z: 0,
        rotYDeg: 0,
        scale: 1,
    });

    // editor game-objects state (items & devices) + selection + toggle
    const [editorItems, setEditorItems] = useState(SEED_ITEMS);
    const [editorDevices, setEditorDevices] = useState(SEED_DEVICES);
    const [selectedObj, setSelectedObj] = useState(null); // { kind: 'item'|'device', id }
    const [showGameObjects, setShowGameObjects] = useState(true);

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
            draw, setDraw,
            drawStart, setDrawStart,
            drawCurr, setDrawCurr,
            showFloors, setShowFloors,
            showRoofs, setShowRoofs,
            worldGLB, setWorldGLB,

            editorItems, setEditorItems,
            editorDevices, setEditorDevices,
            selectedObj, setSelectedObj,
            showGameObjects, setShowGameObjects,
        }),
        [
            rooms, floors, selected, selFloor, selectedEdge,
            showGrid, snap, draw, drawStart, drawCurr,
            showFloors, showRoofs, worldGLB,
            editorItems, editorDevices, selectedObj, showGameObjects,
        ]
    );

    if (!enabled) return children;
    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// ---------------- Editor Game Objects (click/select) ----------------
function EditorItemMesh({ type }) {
    const color = ITEM_TYPES[type]?.color ?? "#9ca3af";
    switch (type) {
        case "food":
            return (
                <group>
                    <mesh><boxGeometry args={[0.36, 0.22, 0.30]} /><meshStandardMaterial color={color} /></mesh>
                    <mesh position={[0, 0.13, 0]}><boxGeometry args={[0.38, 0.02, 0.32]} /><meshStandardMaterial color="#0f172a" /></mesh>
                </group>
            );
        case "fuel":
            return <mesh><boxGeometry args={[0.12, 0.6, 0.12]} /><meshStandardMaterial color={color} /></mesh>;
        case "protection":
            return <mesh><icosahedronGeometry args={[0.22, 0]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.4} /></mesh>;
        case "cure_red":
        case "cure_blue":
            return (
                <group>
                    <mesh><cylinderGeometry args={[0.12, 0.12, 0.34, 18]} /><meshStandardMaterial color={color} /></mesh>
                    <mesh position={[0, 0.20, 0]}><cylinderGeometry args={[0.06, 0.06, 0.12, 18]} /><meshStandardMaterial color="#0f172a" /></mesh>
                </group>
            );
        case "food_tank":
        case "fuel_tank":
        case "protection_tank":
            return (
                <group scale={[4, 4, 4]}>
                    <mesh><cylinderGeometry args={[0.22, 0.22, 0.34, 20]} /><meshStandardMaterial color={color} metalness={0.2} roughness={0.4} /></mesh>
                    <mesh position={[0, 0.19, 0]}><cylinderGeometry args={[0.23, 0.23, 0.03, 20]} /><meshStandardMaterial color="#0f172a" /></mesh>
                    <mesh position={[0, -0.19, 0]}><cylinderGeometry args={[0.21, 0.21, 0.02, 20]} /><meshStandardMaterial color="#0b1220" /></mesh>
                </group>
            );
        default:
            return <mesh><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color="#9ca3af" /></mesh>;
    }
}

function EditorGameObjects() {
    const { editorItems, editorDevices, selectedObj, setSelectedObj } = useMapEditor();
    const items = editorItems || [];
    const devices = editorDevices || [];

    return (
        <group>
            {/* Devices */}
            {devices.map((d) => {
                const selected = selectedObj?.kind === "device" && selectedObj?.id === d.id;
                return (
                    <group
                        key={d.id}
                        position={[d.x ?? 0, (d.y || 0) + 0.5, d.z ?? 0]}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedObj({ kind: "device", id: d.id });
                        }}
                    >
                        <mesh>
                            <boxGeometry args={[1.1, 1.0, 0.6]} />
                            <meshStandardMaterial color={selected ? "#4ade80" : "#2c3444"} />
                        </mesh>
                        <mesh position={[0, 0.3, 0.33]}>
                            <planeGeometry args={[0.8, 0.35]} />
                            <meshBasicMaterial color="#8fb3ff" />
                        </mesh>
                        <Billboard position={[0, 0.9, 0]}>
                            <Text fontSize={0.28} color="#e6edf3" outlineWidth={0.01} outlineColor="black">
                                {d.label || d.type || d.id}
                            </Text>
                        </Billboard>
                    </group>
                );
            })}

            {/* Items */}
            {items.map((it) => {
                const selected = selectedObj?.kind === "item" && selectedObj?.id === it.id;
                const isTank = it.type === "food_tank" || it.type === "fuel_tank" || it.type === "protection_tank";
                const ringScale = isTank ? 4 : 1;
                const billboardY = isTank ? 1.7 : 0.85;

                return (
                    <group
                        key={it.id}
                        position={[it.x ?? 0, (it.y || 0) + 0.25, it.z ?? 0]}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedObj({ kind: "item", id: it.id });
                        }}
                    >
                        <EditorItemMesh type={it.type} />

                        {/* ground ring */}
                        <group scale={[ringScale, 1, ringScale]}>
                            <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                                <ringGeometry args={[0.35, 0.42, 24]} />
                                <meshBasicMaterial color={selected ? "#4ade80" : "#64748b"} transparent opacity={selected ? 0.85 : 0.4} />
                            </mesh>
                        </group>

                        <Billboard position={[0, billboardY, 0]}>
                            <Text fontSize={0.28} color="#ffffff" outlineWidth={0.01} outlineColor="black">
                                {it.name || ITEM_TYPES[it.type]?.label || it.type || "Item"}
                            </Text>
                        </Billboard>
                    </group>
                );
            })}
        </group>
    );
}

// ---------------- 3D Layer ----------------
export function MapEditor3D() {
    const {
        rooms, setRooms,
        floors, setFloors,
        selected, setSelected,
        selFloor, setSelFloor,
        setSelectedEdge,
        showGrid, snap,
        draw, setDraw,
        drawStart, setDrawStart,
        drawCurr, setDrawCurr,
        showFloors, showRoofs,
        worldGLB,
        // game objects
        editorItems, setEditorItems,
        editorDevices, setEditorDevices,
        selectedObj,
        showGameObjects,
    } = useMapEditor();

    const matRoom = useMemo(
        () => new THREE.MeshBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.18 }),
        []
    );
    const matRoomSel = useMemo(
        () => new THREE.MeshBasicMaterial({ color: 0xffc14e, transparent: true, opacity: 0.28 }),
        []
    );
    const matDraw = useMemo(
        () => new THREE.MeshBasicMaterial({ color: 0x22cc88, transparent: true, opacity: 0.25 }),
        []
    );

    // ground draw
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
                const room = normalizeRoomSingleDoor(
                    makeRoom({
                        name: `Room ${rooms.length + 1}`,
                        x: snapV(cx),
                        z: snapV(cz),
                        w: snapV(w),
                        d: snapV(d),
                        floorY: 0,
                        roofT: DEFAULT_SLAB_THICKNESS,
                        hasFloor: true,
                        hasRoof: true,
                        exported: true,
                        wallMat: { color: "#9aa4b2" },
                        floorMat: { color: "#30363d" },
                        roofMat: { color: "#232a31" },
                    })
                );
                setRooms((prev) => [...prev, room]);
                setSelected(rooms.length);
                setSelFloor(null);
                setSelectedEdge(null);
            } else {
                const slab = makeSlab({
                    name: `Floor ${floors.length + 1}`,
                    x: snapV(cx),
                    z: snapV(cz),
                    w: snapV(w),
                    d: snapV(d),
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
        setDrawStart(null);
        setDrawCurr(null);
    };

    // room/floor gizmo
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
    const gizmoPos =
        selFloor != null
            ? [floors[selFloor]?.x ?? 0, 0, floors[selFloor]?.z ?? 0]
            : selRoom
                ? [selRoom.x, 0, selRoom.z]
                : null;

    // selected game-object & gizmo
    const selGO =
        selectedObj?.kind === "item"
            ? editorItems.find((i) => i.id === selectedObj.id)
            : selectedObj?.kind === "device"
                ? editorDevices.find((d) => d.id === selectedObj.id)
                : null;

    const gizmoGOPos = selGO ? [selGO.x ?? 0, selGO.y ?? 0, selGO.z ?? 0] : null;

    const onObjGizmoChange = (v) => {
        const x = snap ? Math.round(v.x / snap) * snap : v.x;
        const y = snap ? Math.round(v.y / snap) * snap : v.y;
        const z = snap ? Math.round(v.z / snap) * snap : v.z;
        if (!selectedObj) return;
        if (selectedObj.kind === "item") {
            setEditorItems((prev) => prev.map((it) => (it.id === selectedObj.id ? { ...it, x, y, z } : it)));
        } else if (selectedObj.kind === "device") {
            setEditorDevices((prev) => prev.map((d) => (d.id === selectedObj.id ? { ...d, x, y, z } : d)));
        }
    };

    return (
        <>
            {showGrid && <gridHelper args={[120, 60]} position={[0, 0.005, 0]} />}

            {/* drag-rect capture plane */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
                onPointerDown={onGroundDown}
                onPointerMove={onGroundMove}
                onPointerUp={onGroundUp}
            >
                <planeGeometry args={[200, 200]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            {/* World GLB */}
            <Suspense fallback={null}>
                {worldGLB?.enabled && (
                    <WorldGLB
                        url={worldGLB.url}
                        position={[worldGLB.x, worldGLB.y, worldGLB.z]}
                        rotation={[0, THREE.MathUtils.degToRad(worldGLB.rotYDeg || 0), 0]}
                        scale={worldGLB.scale}
                    />
                )}
            </Suspense>

            {/* Game objects (editable in editor) */}
            {showGameObjects && (
                <Suspense fallback={null}>
                    <EditorGameObjects />
                </Suspense>
            )}

            {/* draw preview */}
            {draw.active && drawStart && drawCurr && (
                <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[
                        (drawStart.x + drawCurr.x) / 2,
                        0.02,
                        (drawStart.z + drawCurr.z) / 2,
                    ]}
                >
                    <planeGeometry
                        args={[
                            Math.max(0.01, Math.abs(drawCurr.x - drawStart.x)),
                            Math.max(0.01, Math.abs(drawCurr.z - drawStart.z)),
                        ]}
                    />
                    <primitive attach="material" object={matDraw} />
                </mesh>
            )}

            {/* FREE FLOOR SLABS */}
            {floors.map((f, i) => (
                <group
                    key={f.id || i}
                    position={[f.x, 0, f.z]}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelFloor(i);
                        setSelected(null);
                        setSelectedEdge(null);
                    }}
                >
                    <mesh
                        position={[
                            0,
                            (f.t ?? DEFAULT_SLAB_THICKNESS) / 2 + (f.y ?? 0) - DEFAULT_SLAB_THICKNESS / 2,
                            0,
                        ]}
                    >
                        <boxGeometry args={[f.w, f.t ?? DEFAULT_SLAB_THICKNESS, f.d]} />
                        <TiledStandardMaterial {...matFrom(f.mat, "#30363d")} />
                    </mesh>
                </group>
            ))}

            {/* ROOMS */}
            {rooms.map((r, i) => {
                const isSel = i === selected && selFloor == null;
                const localWalls = wallsForRoomLocal(r, r.wallT ?? WALL_THICKNESS);
                const thick = r.roofT ?? DEFAULT_SLAB_THICKNESS;
                const floorYCenter = (r.floorY ?? 0) + thick / 2;
                const roofYCenter = (r.floorY ?? 0) + (r.h || DEFAULT_WALL_HEIGHT) - thick / 2;

                return (
                    <group
                        key={r.key || i}
                        position={[r.x, 0, r.z]}
                        rotation={[0, (r.rotDeg || 0) * Math.PI / 180, 0]}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelected(i);
                            setSelFloor(null);
                        }}
                    >
                        {/* floor slab */}
                        {showFloors && r.hasFloor !== false && (
                            <mesh
                                position={[0, floorYCenter, 0]}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    setSelected(i);
                                    setSelFloor(null);
                                }}
                            >
                                <boxGeometry args={[r.w, thick, r.d]} />
                                <TiledStandardMaterial {...matFrom(r.floorMat, "#30363d")} />
                            </mesh>
                        )}

                        {/* room label on floor */}
                        <Text
                            position={[0, (r.floorY ?? 0) + 0.06, 0]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            fontSize={Math.max(0.3, Math.min(r.w, r.d) * 0.18)}
                            color={r.labelColor || "#e6edf3"}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.01}
                            outlineColor="black"
                        >
                            {r.label || r.name}
                        </Text>

                        {/* footprint overlay */}
                        <mesh
                            rotation={[-Math.PI / 2, 0, 0]}
                            position={[0, (r.floorY ?? 0) + 0.02, 0]}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                setSelected(i);
                                setSelFloor(null);
                            }}
                        >
                            <planeGeometry args={[r.w, r.d]} />
                            <primitive attach="material" object={isSel ? matRoomSel : matRoom} />
                        </mesh>

                        {/* walls + doors */}
                        {localWalls.map((w, wi) => {
                            const edge = r.edges?.find((ed) => ed.side === w.side);
                            if (edge && edge.present === false) return null;

                            const edgeMat = edge?.mat ? { ...r.wallMat, ...edge.mat } : r.wallMat;
                            const len = Number(w.len ?? w.w ?? 0);
                            const half = len / 2;
                            const wallH = Number(edge?.h ?? r.h ?? w.h ?? DEFAULT_WALL_HEIGHT);
                            const wallT = Number(edge?.t ?? r.wallT ?? w.thickness ?? WALL_THICKNESS);

                            const doorRaw = coalesceDoor(edge?.door);
                            const doorCfg = clampDoorProps(doorRaw, len, wallH, wallT);
                            const hasDoor = !!doorCfg;

                            const slotW = hasDoor ? doorCfg.width : 0;
                            const slotH = hasDoor ? doorCfg.height : 0;
                            const slotPanels = hasDoor ? doorCfg.panels : 2;
                            const slotOpen = hasDoor ? doorCfg.open : 0;
                            const slotX = hasDoor ? doorCfg.offset : 0;

                            const hasSlot =
                                !!hasDoor &&
                                Number.isFinite(slotW) &&
                                slotW > 0.05 &&
                                Number.isFinite(len) &&
                                slotW < len - 0.05;

                            const EPS = 0.0005;
                            const leftLen = hasSlot ? Math.max(0, slotX + half - slotW / 2) : len;
                            const rightLen = hasSlot ? Math.max(0, half - slotX - slotW / 2) : 0;

                            return (
                                <group
                                    key={`w_${wi}`}
                                    position={[w.x, wallH / 2 + (r.floorY ?? 0), w.z]}
                                    rotation={[0, w.rotY || 0, 0]}
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                        setSelected(i);
                                        setSelFloor(null);
                                        setSelectedEdge({ roomIndex: i, side: w.side });
                                    }}
                                >
                                    {!hasSlot && leftLen > 0.005 && (
                                        <mesh position={[0, 0, 0]}>
                                            <boxGeometry args={[len - EPS, wallH, wallT]} />
                                            <TiledStandardMaterial {...matFrom(edgeMat, "#9aa4b2")} />
                                        </mesh>
                                    )}

                                    {hasSlot && leftLen > 0.005 && (
                                        <mesh position={[-(half - leftLen / 2), 0, 0]}>
                                            <boxGeometry args={[leftLen - EPS, wallH, wallT]} />
                                            <TiledStandardMaterial {...matFrom(edgeMat, "#9aa4b2")} />
                                        </mesh>
                                    )}

                                    {hasSlot && rightLen > 0.005 && (
                                        <mesh position={[(half - rightLen / 2), 0, 0]}>
                                            <boxGeometry args={[rightLen - EPS, wallH, wallT]} />
                                            <TiledStandardMaterial {...matFrom(edgeMat, "#9aa4b2")} />
                                        </mesh>
                                    )}

                                    {/* Door preview — y offset down to floor */}
                                    {hasDoor && (
                                        <group position={[slotX, -wallH / 2, 0]}>
                                            <Door3D
                                                width={slotW}
                                                height={slotH}
                                                panels={slotPanels}
                                                open={slotOpen}
                                                thickness={doorCfg.thickness}
                                                colorPanel={doorCfg?.mat?.color || r.doorMat?.color}
                                                colorFrame={doorCfg?.frameMat?.color || r.doorFrameMat?.color}
                                            />
                                        </group>
                                    )}
                                </group>
                            );
                        })}

                        {/* roof slab */}
                        {showRoofs && r.hasRoof !== false && (
                            <mesh
                                position={[0, roofYCenter, 0]}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    setSelected(i);
                                    setSelFloor(null);
                                }}
                            >
                                <boxGeometry args={[r.w, thick, r.d]} />
                                <TiledStandardMaterial {...matFrom(r.roofMat, "#232a31")} />
                            </mesh>
                        )}
                    </group>
                );
            })}

            {/* room/floor move gizmo */}
            {gizmoPos && <GizmoTranslate position={gizmoPos} onChange={onGizmoChange} />}

            {/* game-object move gizmo (x/y/z) */}
            {gizmoGOPos && (
                <TransformControls
                    mode="translate"
                    showY={true}
                    onObjectChange={(e) => {
                        const p = e.target.object.position;
                        onObjGizmoChange(new THREE.Vector3(p.x, p.y, p.z));
                    }}
                >
                    <mesh position={gizmoGOPos} visible={false}>
                        <boxGeometry args={[0.1, 0.1, 0.1]} />
                        <meshBasicMaterial />
                    </mesh>
                </TransformControls>
            )}
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
        </TransformControls>
    );
}

// util for free floor slabs
function makeSlab({
    name = "Floor",
    x = 0,
    z = 0,
    w = 4,
    d = 3,
    t = DEFAULT_SLAB_THICKNESS,
    y = 0,
    exported = true,
    mat = null,
} = {}) {
    return {
        id: `slab_${Math.random().toString(36).slice(2, 8)}`,
        name, x, z, w, d, t, y, exported, mat,
    };
}

// ---- Doors export (world space) ----
function computeDoorsWorld(exportRooms) {
    const round = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v);
    const Y = new THREE.Vector3(0, 1, 0);
    const all = [];
    for (let ri = 0; ri < exportRooms.length; ri++) {
        const r = exportRooms[ri];
        const roomRot = THREE.MathUtils.degToRad(r.rotDeg || 0);
        const walls = wallsForRoomLocal(r, r.wallT ?? WALL_THICKNESS);

        for (const w of walls) {
            const edge = r.edges?.find((ed) => ed.side === w.side);
            const len = Number(w.len || 0);

            const door = clampDoorProps(
                coalesceDoor(edge?.door),
                len,
                (r.h ?? DEFAULT_WALL_HEIGHT),
                (r.wallT ?? WALL_THICKNESS)
            );
            if (!door) continue;

            const { offset, width, height, panels, thickness, open } = door;
            const rotY = roomRot + (w.rotY || 0);

            // Door center (X/Z) in world space
            const local = new THREE.Vector3(w.x, 0, w.z);
            const along = new THREE.Vector3(offset, 0, 0).applyAxisAngle(Y, w.rotY || 0);
            local.add(along).applyAxisAngle(Y, roomRot);
            local.x += r.x;
            local.z += r.z;

            all.push({
                id: `${r.key || `room_${ri}`}_${w.side}_door`,
                roomKey: r.key || null,
                side: w.side,
                x: round(local.x),
                y: round(r.floorY ?? 0),
                z: round(local.z),
                rotY: round(rotY),
                width: round(width),
                height: round(height),
                panels: panels | 0,
                thickness: round(thickness),
                open: round(open),
                offset: round(offset),
            });
        }
    }
    return all;
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
        showFloors, setShowFloors,
        showRoofs, setShowRoofs,
        worldGLB, setWorldGLB,

        // editor game objects
        editorItems, setEditorItems,
        editorDevices, setEditorDevices,
        selectedObj, setSelectedObj,
        showGameObjects, setShowGameObjects,
    } = useMapEditor();

    const r = rooms[selected];
    const f = selFloor != null ? floors[selFloor] : null;

    const updateRoom = (patch) =>
        setRooms((prev) => prev.map((it, i) => (i === selected ? { ...it, ...patch } : it)));
    const updateEdge = (side, patch) =>
        setRooms((prev) =>
            prev.map((it, i) => {
                if (i !== selected) return it;
                const edges = it.edges.map((e) => (e.side === side ? { ...e, ...patch } : e));
                return { ...it, edges };
            })
        );
    const updateFloor = (patch) => {
        if (selFloor == null) return;
        setFloors((prev) => prev.map((it, i) => (i === selFloor ? { ...it, ...patch } : it)));
    };

    const downloadJson = (obj, filename) => {
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const uniqueKey = (desired) => {
        if (!desired) return "";
        let k = desired, n = 2;
        const has = (kk) => rooms.some((rr) => rr.key === kk);
        while (has(k)) k = `${desired}_${n++}`;
        return k;
    };

    const mkLockdown = (x = 0, z = 0) =>
        normalizeRoomSingleDoor(
            makeRoom({
                key: uniqueKey("lockdown"),
                name: "Lockdown",
                type: "lockdown",
                exported: true,
                hasFloor: true,
                hasRoof: true,
                x, z,
                w: 4.5, d: 3.0, h: 2.4,
                wallMat: { color: "#9aa4b2" },
                floorMat: { color: "#30363d" },
                roofMat: { color: "#232a31" },
                edges: [
                    { side: "N", present: true, door: null },
                    { side: "E", present: true, door: null },
                    { side: "S", present: true, door: null },
                    { side: "W", present: true, door: { width: 2.4, offset: 0, type: "sliding", panels: 2 } },
                ],
            })
        );

    const mkMeetingRoom = (x = 0, z = 0) =>
        normalizeRoomSingleDoor(
            makeRoom({
                key: uniqueKey("meeting_room"),
                name: "Meeting Room",
                type: "meeting_room",
                exported: true,
                hasFloor: true,
                hasRoof: true,
                x, z,
                w: 6.0, d: 4.0, h: 2.4,
                wallMat: { color: "#9aa4b2" },
                floorMat: { color: "#30363d" },
                roofMat: { color: "#232a31" },
                edges: [
                    { side: "N", present: true, door: null },
                    { side: "E", present: true, door: { width: 4.5, offset: 0, type: "sliding", panels: 2 } },
                    { side: "S", present: true, door: null },
                    { side: "W", present: true, door: null },
                ],
            })
        );

    // room actions
    const addRoom = () => {
        const idx = rooms.length;
        setRooms((prev) => [
            ...prev,
            normalizeRoomSingleDoor(
                makeRoom({
                    key: `room_${idx}`,
                    name: `Room ${idx + 1}`,
                    x: 0, z: 0, w: 4, d: 3,
                    exported: true, hasFloor: true, hasRoof: true,
                    wallMat: { color: "#9aa4b2" },
                    floorMat: { color: "#30363d" },
                    roofMat: { color: "#232a31" },
                })
            ),
        ]);
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
        const rr = rooms[selected];
        if (!rr) return;
        const idx = rooms.length;
        setRooms((prev) => [
            ...prev,
            normalizeRoomSingleDoor(makeRoom({ ...rr, key: uniqueKey(`${rr.key || "room"}_copy`) })),
        ]);
        setSelected(idx);
        setSelFloor(null);
        setSelectedEdge(null);
    };
    const deleteRoom = () => {
        const rr = rooms[selected];
        if (!rr) return;
        const next = rooms.filter((_, i) => i !== selected);
        setRooms(next);
        setSelected(Math.max(0, selected - 1));
        setSelFloor(null);
        setSelectedEdge(null);
    };

    // floors
    const addFloor = () => {
        const idx = floors.length;
        setFloors((prev) => [
            ...prev,
            makeSlab({
                name: `Floor ${idx + 1}`,
                x: 0, z: 0, w: 6, d: 6,
                t: DEFAULT_SLAB_THICKNESS, y: 0,
                exported: true,
                mat: { color: "#30363d" },
            }),
        ]);
        setSelFloor(idx);
        setSelected(null);
        setSelectedEdge(null);
    };
    const duplicateFloor = () => {
        if (selFloor == null) return;
        const src = floors[selFloor];
        const idx = floors.length;
        setFloors((prev) => [
            ...prev,
            { ...src, id: `slab_${Math.random().toString(36).slice(2, 8)}`, name: `${src.name || "Floor"} copy` },
        ]);
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
        saveDraftV3(rooms, floors);
        legacySaveDraftRooms?.(rooms);
    };

    const download = () => {
        const exportRooms = rooms.filter((rm) => rm.exported !== false).map(normalizeRoomSingleDoor);

        const packed = packMap ? packMap(exportRooms) : { rooms: exportRooms, walls: [], wallAABBs: [] };

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
            .map((s) => ({
                x: s.x, y: s.y ?? 0, z: s.z, w: s.w, d: s.d, t: s.t ?? DEFAULT_SLAB_THICKNESS, name: s.name, mat: s.mat || null,
            }));

        const doors = computeDoorsWorld(exportRooms);

        const data = {
            rooms: exportRooms,
            walls: packed.walls || [],
            wallAABBs: packed.wallAABBs || [],
            floors: [...floorsFromRooms, ...freeFloors],
            roofs: [...roofsFromRooms],
            doors,
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "defaultMap.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    // ---- Loaders
    const fileInputRef = useRef(null);
    const loadFromObject = (obj) => {
        try {
            const r = Array.isArray(obj.rooms) ? obj.rooms.map((x) => normalizeRoomSingleDoor(makeRoom(x))) : [];
            const f = Array.isArray(obj.floors) ? obj.floors : [];
            setRooms(r);
            setFloors(f);
            setSelected(r.length ? 0 : null);
            setSelFloor(null);
            setSelectedEdge(null);
        } catch (err) {
            console.error("Invalid JSON map:", err);
            alert("Invalid JSON map format.");
        }
    };
    const onPickFile = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            loadFromObject(data);
        } catch (e) {
            console.error(e);
            alert("Failed to load JSON file.");
        } finally {
            ev.target.value = "";
        }
    };

    const loadDefault = async () => {
        try {
            const mod = await import("../map/defaultMap.json");
            const data = mod.default || mod;
            loadFromObject(data);
        } catch (e) {
            console.warn("Dynamic import failed, trying fetch…", e);
            try {
                const url = new URL("../map/defaultMap.json", import.meta.url);
                const res = await fetch(url);
                const data = await res.json();
                loadFromObject(data);
            } catch (err) {
                console.error(err);
                alert("Could not load ../map/defaultMap.json");
            }
        }
    };

    // Selected game-object (for numeric fields)
    const selGO =
        selectedObj?.kind === "item"
            ? editorItems.find((i) => i.id === selectedObj.id)
            : selectedObj?.kind === "device"
                ? editorDevices.find((d) => d.id === selectedObj.id)
                : null;

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
                <label>
                    <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid
                </label>
                <label>
                    Snap
                    <input type="number" step={0.1} value={snap} onChange={(e) => setSnap(Number(e.target.value) || 0)} style={{ width: 64, marginLeft: 6 }} />
                </label>
                <label>
                    <input type="checkbox" checked={showFloors} onChange={(e) => setShowFloors(e.target.checked)} /> Floors
                </label>
                <label>
                    <input type="checkbox" checked={showRoofs} onChange={(e) => setShowRoofs(e.target.checked)} /> Roofs
                </label>

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

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <button onClick={() => downloadJson(editorItems, "items.json")}>Export Items JSON</button>
                    <button onClick={() => downloadJson(editorDevices, "devices.json")}>Export Devices JSON</button>
                </div>

                {/* load */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={onPickFile}
                />
                <button onClick={() => fileInputRef.current?.click()}>Load JSON…</button>
                <button onClick={loadDefault}>Load Default</button>
            </div>

            {/* room list */}
            <div style={{ maxHeight: 160, overflow: "auto", padding: 6, border: "1px solid #2b2b2b", borderRadius: 6, marginBottom: 8 }}>
                {rooms.map((it, i) => (
                    <div
                        key={it.key || i}
                        style={{
                            padding: 4,
                            background: i === selected && selFloor == null ? "#1f2a44" : "transparent",
                            borderRadius: 4, cursor: "pointer", display: "flex", justifyContent: "space-between",
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

            {/* Free Floors list */}
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
                    <div
                        key={it.id || i}
                        style={{
                            padding: 4,
                            background: i === selFloor ? "#183a2e" : "transparent",
                            borderRadius: 4, cursor: "pointer", display: "flex", justifyContent: "space-between",
                        }}
                        onClick={() => { setSelFloor(i); setSelected(null); setSelectedEdge(null); }}
                    >
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

                        <label>Default Wall Thickness</label>
                        <input type="number" min={0.01} step={0.01} value={r.wallT ?? WALL_THICKNESS} onChange={(e) => updateRoom({ wallT: Math.max(0.01, Number(e.target.value)) })} />

                        <label>Floor Y</label>
                        <input type="number" step={0.05} value={r.floorY ?? 0} onChange={(e) => updateRoom({ floorY: Number(e.target.value) })} />

                        <label>Roof/Floor Thickness</label>
                        <input type="number" min={0.01} step={0.01} value={r.roofT ?? DEFAULT_SLAB_THICKNESS} onChange={(e) => updateRoom({ roofT: Math.max(0.01, Number(e.target.value)) })} />

                        {/* colors */}
                        <label>Wall Color</label>
                        <input type="color" value={r.wallMat?.color || "#9aa4b2"} onChange={(e) => updateRoom({ wallMat: { ...(r.wallMat || {}), color: e.target.value } })} />

                        <label>Floor Color</label>
                        <input type="color" value={r.floorMat?.color || "#30363d"} onChange={(e) => updateRoom({ floorMat: { ...(r.floorMat || {}), color: e.target.value } })} />

                        <label>Roof Color</label>
                        <input type="color" value={r.roofMat?.color || "#232a31"} onChange={(e) => updateRoom({ roofMat: { ...(r.roofMat || {}), color: e.target.value } })} />

                        {/* textures */}
                        <label>Wall Texture URL</label>
                        <input value={r.wallMat?.mapUrl || ""} onChange={(e) => updateRoom({ wallMat: { ...(r.wallMat || {}), mapUrl: e.target.value } })} />
                        <label>Wall Tex Repeat (x,y)</label>
                        <input
                            value={(r.wallMat?.repeat || [1, 1]).join(",")}
                            onChange={(e) => {
                                const [rx, ry] = e.target.value.split(",").map(Number);
                                updateRoom({ wallMat: { ...(r.wallMat || {}), repeat: [rx || 1, ry || 1] } });
                            }}
                        />

                        <label>Floor Texture URL</label>
                        <input value={r.floorMat?.mapUrl || ""} onChange={(e) => updateRoom({ floorMat: { ...(r.floorMat || {}), mapUrl: e.target.value } })} />
                        <label>Floor Tex Repeat (x,y)</label>
                        <input
                            value={(r.floorMat?.repeat || [1, 1]).join(",")}
                            onChange={(e) => {
                                const [rx, ry] = e.target.value.split(",").map(Number);
                                updateRoom({ floorMat: { ...(r.floorMat || {}), repeat: [rx || 1, ry || 1] } });
                            }}
                        />

                        <label>Roof Texture URL</label>
                        <input value={r.roofMat?.mapUrl || ""} onChange={(e) => updateRoom({ roofMat: { ...(r.roofMat || {}), mapUrl: e.target.value } })} />
                        <label>Roof Tex Repeat (x,y)</label>
                        <input
                            value={(r.roofMat?.repeat || [1, 1]).join(",")}
                            onChange={(e) => {
                                const [rx, ry] = e.target.value.split(",").map(Number);
                                updateRoom({ roofMat: { ...(r.roofMat || {}), repeat: [rx || 1, ry || 1] } });
                            }}
                        />

                        <label>
                            <input type="checkbox" checked={showGameObjects} onChange={(e) => setShowGameObjects(e.target.checked)} /> Game Objects
                        </label>

                        {/* Room label */}
                        <label>Room Label</label>
                        <input value={r.label || ""} onChange={(e) => updateRoom({ label: e.target.value })} />
                        <label>Room Label Color</label>
                        <input type="color" value={r.labelColor || "#e6edf3"} onChange={(e) => updateRoom({ labelColor: e.target.value })} />

                        {/* Door panel defaults */}
                        <label>Default Door Panel Tex URL</label>
                        <input value={r.doorMat?.mapUrl || ""} onChange={(e) => updateRoom({ doorMat: { ...(r.doorMat || {}), mapUrl: e.target.value } })} />
                        <label>Default Door Panel Repeat (x,y)</label>
                        <input
                            value={(r.doorMat?.repeat || [1, 1]).join(",")}
                            onChange={(e) => {
                                const [rx, ry] = e.target.value.split(",").map(Number);
                                updateRoom({ doorMat: { ...(r.doorMat || {}), repeat: [rx || 1, ry || 1] } });
                            }}
                        />
                    </div>

                    {/* World GLB */}
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #2b2b2b" }}>
                        <strong>World GLB</strong>
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, marginTop: 6 }}>
                            <label>Show</label>
                            <input type="checkbox" checked={!!worldGLB.enabled} onChange={(e) => setWorldGLB({ ...worldGLB, enabled: e.target.checked })} />
                            <label>URL</label>
                            <input value={worldGLB.url} onChange={(e) => setWorldGLB({ ...worldGLB, url: e.target.value })} placeholder="/models/world.glb" />
                            <label>Pos Y</label>
                            <input type="number" step={0.1} value={worldGLB.y} onChange={(e) => setWorldGLB({ ...worldGLB, y: Number(e.target.value) })} />
                            <label>Rot Y (deg)</label>
                            <input type="range" min={-180} max={180} step={1} value={worldGLB.rotYDeg} onChange={(e) => setWorldGLB({ ...worldGLB, rotYDeg: Number(e.target.value) })} />
                            <label>Scale</label>
                            <input
                                type="number" min={0.01} step={0.1} value={worldGLB.scale}
                                onChange={(e) => setWorldGLB({ ...worldGLB, scale: Math.max(0.01, Number(e.target.value)) })}
                            />
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                            Put your file at <code>/public/models/world.glb</code> and set URL to <code>/models/world.glb</code>.
                        </div>
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
                                        background:
                                            selectedEdge && selectedEdge.roomIndex === selected && selectedEdge.side === e.side
                                                ? "#324d7a"
                                                : "#1e293b",
                                        color: "#e6edf3",
                                        border: "1px solid #2b3a55",
                                    }}
                                >
                                    Edge {e.side}
                                </button>
                            ))}
                        </div>

                        {(() => {
                            if (!selectedEdge || selectedEdge.roomIndex !== selected) return null;
                            const e = r.edges.find((ed) => ed.side === selectedEdge.side);
                            if (!e) return null;
                            const setE = (patch) => updateEdge(e.side, patch);
                            return (
                                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6 }}>
                                    <label>Present</label>
                                    <input type="checkbox" checked={!!e.present} onChange={(ev) => setE({ present: ev.target.checked })} />

                                    <label>Door?</label>
                                    <input
                                        type="checkbox"
                                        checked={!!e.door}
                                        onChange={(ev) => setE({ door: ev.target.checked ? { ...DEFAULT_DOOR } : null })}
                                    />

                                    <label>Door Offset</label>
                                    <input
                                        type="number" step={0.1} value={e.door?.offset || 0}
                                        onChange={(ev) => setE({ door: { ...(e.door || {}), offset: Number(ev.target.value) } })}
                                    />

                                    <label>Edge Thickness (depth)</label>
                                    <input
                                        type="number" min={0.01} step={0.01} value={e.t ?? (r.wallT ?? WALL_THICKNESS)}
                                        onChange={(ev) => setE({ t: Math.max(0.01, Number(ev.target.value)) })}
                                    />
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={() => setE({ t: null })}>
                                            Use Room Default ({(r.wallT ?? WALL_THICKNESS).toFixed(2)})
                                        </button>
                                    </div>

                                    {/* Edge material overrides */}
                                    <label>Edge Color</label>
                                    <input
                                        type="color" value={e.mat?.color || r.wallMat?.color || "#9aa4b2"}
                                        onChange={(ev) => setE({ mat: { ...(e.mat || {}), color: ev.target.value } })}
                                    />

                                    <label>Edge Texture URL</label>
                                    <input
                                        value={e.mat?.mapUrl || ""}
                                        onChange={(ev) => setE({ mat: { ...(e.mat || {}), mapUrl: ev.target.value } })}
                                    />

                                    <label>Edge Tex Repeat (x,y)</label>
                                    <input
                                        value={(e.mat?.repeat || [1, 1]).join(",")}
                                        onChange={(ev) => {
                                            const [rx, ry] = ev.target.value.split(",").map(Number);
                                            setE({ mat: { ...(e.mat || {}), repeat: [rx || 1, ry || 1] } });
                                        }}
                                    />

                                    <label>Edge Label</label>
                                    <input value={e.mat?.label || ""} onChange={(ev) => setE({ mat: { ...(e.mat || {}), label: ev.target.value } })} />
                                    <label>Edge Label Color</label>
                                    <input
                                        type="color" value={e.mat?.labelColor || "#ffffff"}
                                        onChange={(ev) => setE({ mat: { ...(e.mat || {}), labelColor: ev.target.value } })}
                                    />

                                    {/* Door GLB (optional per room) */}
                                    <div style={{ gridColumn: "1 / span 2", marginTop: 8 }}>
                                        <strong>Door GLB (optional)</strong>
                                    </div>

                                    <label>Frame GLB URL</label>
                                    <input
                                        value={r.doorModel?.frameUrl || ""}
                                        onChange={(ev) =>
                                            updateRoom({ doorModel: { ...(r.doorModel || {}), frameUrl: ev.target.value } })
                                        }
                                    />
                                    <label>Left Panel GLB URL</label>
                                    <input
                                        value={r.doorModel?.leftUrl || ""}
                                        onChange={(ev) =>
                                            updateRoom({ doorModel: { ...(r.doorModel || {}), leftUrl: ev.target.value } })
                                        }
                                    />
                                    <label>Right Panel GLB URL</label>
                                    <input
                                        value={r.doorModel?.rightUrl || ""}
                                        onChange={(ev) =>
                                            updateRoom({ doorModel: { ...(r.doorModel || {}), rightUrl: ev.target.value } })
                                        }
                                    />

                                    <label>Door Thickness (Z)</label>
                                    <input
                                        type="number" step={0.01} value={r.doorModel?.thickness ?? 0.3}
                                        onChange={(ev) =>
                                            updateRoom({
                                                doorModel: {
                                                    ...(r.doorModel || {}),
                                                    thickness: Math.max(0.01, Number(ev.target.value)),
                                                },
                                            })
                                        }
                                    />

                                    <label>Diagonal Slope (Z per open)</label>
                                    <input
                                        type="number" step={0.01} value={r.doorModel?.slope ?? 0}
                                        onChange={(ev) => updateRoom({ doorModel: { ...(r.doorModel || {}), slope: Number(ev.target.value) } })}
                                    />

                                    <div style={{ gridColumn: "1 / span 2", fontSize: 12, opacity: 0.7 }}>
                                        Put GLBs in <code>/public/models/</code> and use URLs like <code>/models/door-frame.glb</code>.
                                    </div>

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
                        <input
                            type="color"
                            value={f.mat?.color || "#30363d"}
                            onChange={(e) => updateFloor({ mat: { ...(f.mat || {}), color: e.target.value } })}
                        />

                        <label>Texture URL</label>
                        <input value={f.mat?.mapUrl || ""} onChange={(e) => updateFloor({ mat: { ...(f.mat || {}), mapUrl: e.target.value } })} />
                        <label>Tex Repeat (x,y)</label>
                        <input
                            value={(f.mat?.repeat || [1, 1]).join(",")}
                            onChange={(e) => {
                                const [rx, ry] = e.target.value.split(",").map(Number);
                                updateFloor({ mat: { ...(f.mat || {}), repeat: [rx || 1, ry || 1] } });
                            }}
                        />
                    </div>
                </>
            )}

            {/* Selected Item/Device fields */}
            {selectedObj && selGO && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #2b2b2b" }}>
                    <strong>Selected {selectedObj.kind}: {selectedObj.id}</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, marginTop: 6 }}>
                        <label>X</label>
                        <input
                            type="number" step={0.1} value={selGO.x ?? 0}
                            onChange={(e) => {
                                const x = Number(e.target.value);
                                if (selectedObj.kind === "item") setEditorItems(prev => prev.map(it => it.id === selGO.id ? { ...it, x } : it));
                                else setEditorDevices(prev => prev.map(d => d.id === selGO.id ? { ...d, x } : d));
                            }}
                        />
                        <label>Y</label>
                        <input
                            type="number" step={0.1} value={selGO.y ?? 0}
                            onChange={(e) => {
                                const y = Number(e.target.value);
                                if (selectedObj.kind === "item") setEditorItems(prev => prev.map(it => it.id === selGO.id ? { ...it, y } : it));
                                else setEditorDevices(prev => prev.map(d => d.id === selGO.id ? { ...d, y } : d));
                            }}
                        />
                        <label>Z</label>
                        <input
                            type="number" step={0.1} value={selGO.z ?? 0}
                            onChange={(e) => {
                                const z = Number(e.target.value);
                                if (selectedObj.kind === "item") setEditorItems(prev => prev.map(it => it.id === selGO.id ? { ...it, z } : it));
                                else setEditorDevices(prev => prev.map(d => d.id === selGO.id ? { ...d, z } : d));
                            }}
                        />
                        <div style={{ gridColumn: "1 / span 2" }}>
                            <button onClick={() => setSelectedObj(null)}>Unselect</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Tip: drop textures in /public/textures and reference them like <code>/textures/steel.jpg</code>. Use “Repeat” to tile.
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
