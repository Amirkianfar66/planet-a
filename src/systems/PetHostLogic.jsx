// src/systems/PetHostLogic.jsx
import React, { useEffect, useRef } from "react";
import { isHost, usePlayersList, myPlayer } from "playroomkit";
import { readActionPayload, hostHandlePetOrder } from "../network/playroom";
import useItemsSync from "./useItemsSync.js";   // read-only: world items (for cure sensing)
import usePetsSync from "./usePetsSync.js";     // authoritative: pets store

/**
 * Host-only system that:
 *  - spawns a pet for each Researcher (1 per owner),
 *  - handles "pet_order" ability,
 *  - runs simple pet AI (follow / stay / seekCure).
 *
 * NOTE: ItemsHostLogic seeds world items; we only wait until items exist once.
 */
export default function PetHostLogic() {
    const host = isHost();
    const players = usePlayersList(true);

    // READ-ONLY world items (used so pets can find cures on the ground)
    const { items } = useItemsSync();
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    // PETS live in their own stream
    const { pets, setPets } = usePetsSync();
    const petsRef = useRef(pets);
    useEffect(() => { petsRef.current = pets; }, [pets]);

    const playersRef = useRef(players);
    useEffect(() => { playersRef.current = players; }, [players]);

    const processed = useRef(new Map());
    const spawnedPetsForOwner = useRef(new Set());

    useEffect(() => {
        if (!host) return;

        let cancelled = false;
        let timerId = null;

        const loop = () => {
            if (cancelled) return;
            try {
                const everyone = [...(playersRef.current || [])];
                const self = myPlayer();
                if (self && !everyone.find((p) => p.id === self.id)) everyone.push(self);

                const itemsNow = itemsRef.current || [];
                const petsNow = petsRef.current || [];

                // Wait until world items exist at least once (prevents old race)
                const itemsSeeded = Array.isArray(itemsNow) && itemsNow.length > 0;

                const petByOwner = new Map(petsNow.map((p) => [p.owner, p]));
                const petIds = new Set(petsNow.map((p) => p.id));

                const spawnPetIfMissing = (owner) => {
                    const ownerId = owner.id;

                    if (spawnedPetsForOwner.current.has(ownerId)) return;
                    if (petByOwner.has(ownerId)) { // already have a pet for this owner
                        spawnedPetsForOwner.current.add(ownerId);
                        return;
                    }

                    // Generate a pet id unique within PETS
                    let idx = 1;
                    let newId = `pet_${ownerId}_${idx}`;
                    while (petIds.has(newId)) { idx++; newId = `pet_${ownerId}_${idx}`; }
                    petIds.add(newId);

                    const ox = Number(owner.getState("x") || 0);
                    const oy = Number(owner.getState("y") || 0);
                    const oz = Number(owner.getState("z") || 0);

                    spawnedPetsForOwner.current.add(ownerId);
                    setPets((prev) => ([
                        ...(prev || []),
                        {
                            id: newId,
                            owner: ownerId,
                            name: "Research Bot",
                            x: ox - 0.8,
                            y: Math.max(oy + 0.2, 0.2),
                            z: oz - 0.8,
                            yaw: Number(owner.getState("yaw") || 0),
                            mode: owner.getState("petMode") || "follow",
                            speed: 2.2,
                            hover: 0.35,
                            // transient seek state fields may be added during AI
                        },
                    ]), true);
                };

                // Spawn policy: only after items are present at least once
                for (const pl of everyone) {
                    const isResearch = String(pl.getState?.("role") || "") === "Research";
                    if (isResearch) {
                        if (itemsSeeded) spawnPetIfMissing(pl);
                    } else {
                        spawnedPetsForOwner.current.delete(pl.id);
                    }
                }

                // Handle ability: pet_order
                for (const p of everyone) {
                    const reqId = Number(p?.getState("reqId") || 0);
                    if (!reqId) continue;
                    if (processed.current.get(p.id) === reqId) continue;

                    const type = String(p.getState("reqType") || "");
                    const target = String(p.getState("reqTarget") || "");

                    if (type === "ability" && target === "pet_order") {
                        const payload = readActionPayload(p);
                        hostHandlePetOrder({ researcher: p, setEvents: undefined, payload });
                        processed.current.set(p.id, reqId);
                        continue;
                    }

                    processed.current.set(p.id, reqId);
                }

                // -------- PET AI (follow / stay / seekCure) ----------
                {
                    const PET_DT = 0.05;
                    const livePets = petsRef.current || [];
                    if (livePets.length) {
                        const updated = new Map();

                        const lerpAngle = (a, b, t) => {
                            let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                            return a + d * t;
                        };
                        const dist2 = (ax, az, bx, bz) => {
                            const dx = ax - bx, dz = az - bz;
                            return dx * dx + dz * dz;
                        };

                        const nearestCure = (x, z) => {
                            let best = null, bestD2 = Infinity;
                            for (const it of (itemsRef.current || [])) {
                                if (!it || it.holder) continue;
                                if (typeof it.x !== "number" || typeof it.z !== "number") continue;
                                const t = String(it.type || "").toLowerCase();
                                if (t !== "cure_red" && t !== "cure_blue") continue;
                                const d2 = dist2(x, z, it.x, it.z);
                                if (d2 < bestD2) { best = it; bestD2 = d2; }
                            }
                            return best;
                        };

                        const pickWaypoint = (ox, oz, ry) => {
                            const r = 2.0 + Math.random() * 3.0; // 2..5m ring
                            const a = ry + (Math.random() * Math.PI * 1.5) - Math.PI / 2;
                            return { x: ox + Math.sin(a) * r, z: oz + Math.cos(a) * r };
                        };

                        for (const pet of livePets) {
                            const owner =
                                (playersRef.current || []).find((pl) => pl.id === pet.owner) || myPlayer();
                            if (!owner || typeof owner.getState !== "function") continue;

                            const mode = String(owner.getState("petMode") || pet.mode || "follow");

                            let { x, y, z } = pet;
                            let yaw = pet.yaw || 0;
                            let walking = false;

                            const speed = pet.speed ?? 2.2;
                            const hoverY = pet.hover ?? 0.35;

                            let tgtX = x, tgtZ = z, tgtY = y, lookAtYaw = yaw;

                            // FOLLOW
                            if (mode === "follow") {
                                const ox = Number(owner.getState("x") ?? 0);
                                const oy = Number(owner.getState("y") ?? 0);
                                const oz = Number(owner.getState("z") ?? 0);
                                const ry = Number((owner.getState("ry") ?? owner.getState("yaw") ?? 0) || 0);

                                const backX = -Math.sin(ry), backZ = -Math.cos(ry);
                                const rightX = Math.cos(ry), rightZ = -Math.sin(ry);

                                tgtX = ox + backX * 2.4 + rightX * 1.2;
                                tgtZ = oz + backZ * 2.4 + rightZ * 1.2;
                                tgtY = Math.max(oy + hoverY, 0.2);
                                lookAtYaw = Math.atan2(ox - x, oz - z);
                            }

                            // SEEK (search → detect → approach)
                            if (mode === "seekCure") {
                                const SENSE_RADIUS = 20.0;
                                const LOST_RADIUS = 30.0;
                                const SEARCH_SPEED = 0.18; // m/s
                                const APPROACH = 0.08;     // damping
                                const STOP_DIST = 0.7;
                                const WP_REACH = 0.25;
                                const WP_TIMEOUT_S = 3.0;

                                let tgtId = pet.seekTargetId || "";
                                let wpX = typeof pet.seekWpX === "number" ? pet.seekWpX : undefined;
                                let wpZ = typeof pet.seekWpZ === "number" ? pet.seekWpZ : undefined;
                                let wpTtl = typeof pet.seekWpTtl === "number" ? pet.seekWpTtl : 0;

                                // resolve/validate target
                                let target = null;
                                if (tgtId) {
                                    target = (itemsRef.current || []).find(
                                        (it) => it && !it.holder && it.id === tgtId && typeof it.x === "number" && typeof it.z === "number"
                                    );
                                    if (target) {
                                        if (dist2(x, z, target.x, target.z) > LOST_RADIUS * LOST_RADIUS) target = null;
                                    }
                                    if (!target) tgtId = "";
                                }

                                // detect new
                                if (!tgtId) {
                                    const cand = nearestCure(x, z);
                                    if (cand && dist2(x, z, cand.x, cand.z) <= SENSE_RADIUS * SENSE_RADIUS) {
                                        target = cand; tgtId = cand.id;
                                    }
                                }

                                if (tgtId && target) {
                                    const vx = target.x - x, vz = target.z - z;
                                    const d = Math.hypot(vx, vz) || 1e-6;

                                    lookAtYaw = Math.atan2(vx, vz);

                                    const px = target.x - (vx / d) * STOP_DIST;
                                    const pz = target.z - (vz / d) * STOP_DIST;

                                    x += (px - x) * APPROACH;
                                    z += (pz - z) * APPROACH;

                                    walking = Math.hypot(px - x, pz - z) > 0.05;
                                    tgtY = y; // lock vertical

                                    yaw = lerpAngle(yaw, lookAtYaw, 0.15);
                                    y += (tgtY - y) * 0.12;

                                    updated.set(pet.id, {
                                        x, y, z, yaw, mode, walking,
                                        seekTargetId: tgtId,
                                         seekWpX: wpX, seekWpZ: wpZ, seekWpTtl: wpTtl,
                                    });
                                    continue;
                                } else {
                                    // SEARCH
                                    const ox = owner ? Number(owner.getState("x") || 0) : x;
                                    const oz = owner ? Number(owner.getState("z") || 0) : z;
                                    const ry = owner ? Number(owner.getState("ry") ?? owner.getState("yaw") ?? 0) : yaw;

                                    let need = wpX === undefined || wpZ === undefined;
                                    if (!need) {
                                        const dwp = Math.hypot(wpX - x, wpZ - z);
                                        if (dwp < WP_REACH) need = true;
                                    }
                                    if (!need && wpTtl <= 0) need = true;

                                    if (need) {
                                        const wp = pickWaypoint(ox, oz, ry);
                                        wpX = wp.x; wpZ = wp.z; wpTtl = WP_TIMEOUT_S;
                                    }

                                    const wx = wpX - x, wz = wpZ - z;
                                    const wd = Math.hypot(wx, wz) || 1e-6;
                                    const step = Math.min(wd, SEARCH_SPEED * PET_DT);
                                    if (step > 0.0005) {
                                        x += (wx / wd) * step;
                                        z += (wz / wd) * step;
                                        walking = true;
                                        lookAtYaw = Math.atan2(wx, wz);
                                    }

                                    tgtY = y;
                                    wpTtl = Math.max(0, wpTtl - PET_DT);

                                    yaw = lerpAngle(yaw, lookAtYaw, 0.15);
                                    y += (tgtY - y) * 0.12;

                                    updated.set(pet.id, {
                                        x, y, z, yaw, mode, walking,
                                        seekTargetId: tgtId,
                                        seekWpX: wpX, seekWpZ: wpZ, seekWpTtl: wpTtl,

                                    });
                                    continue;
                                }
                            }

                            // STAY
                            if (mode === "stay") {
                                if (owner) {
                                    const ox = Number(owner.getState("x") || 0);
                                    const oz = Number(owner.getState("z") || 0);
                                    lookAtYaw = Math.atan2(ox - x, oz - z);
                                }
                                const baseY = owner ? Number(owner.getState("y") || 0) : 0;
                                tgtX = x; tgtZ = z; tgtY = Math.max(baseY + hoverY, 0.2);
                            }

                            // generic mover (follow/stay)
                            const mx = tgtX - x, mz = tgtZ - z;
                            const md = Math.hypot(mx, mz);
                            const mstep = Math.min(md, (pet.speed ?? 2.2) * PET_DT);
                            if (md > 0.001) {
                                x += (mx / md) * mstep;
                                z += (mz / md) * mstep;
                                walking = walking || mstep > 0.02;
                            }

                            yaw = lerpAngle(yaw, lookAtYaw, 0.25);
                            y += (tgtY - y) * 0.12;

                            updated.set(pet.id, { x, y, z, yaw, mode, walking });
                        }

                        if (updated.size) {
                            setPets(
                                (prev) =>
                                    (prev || []).map((p) => {
                                        const u = updated.get(p.id);
                                        return u ? { ...p, ...u } : p;
                                    }),
                                true
                            );
                        }
                    }
                }
                // -------- END PET AI ----------

            } catch (err) {
                console.error("[HOST] Pet loop crashed:", err);
            } finally {
                timerId = setTimeout(loop, 50);
            }
        };

        loop();
        return () => { cancelled = true; if (timerId) clearTimeout(timerId); };
    }, [host, setPets]);

    return null;
}
