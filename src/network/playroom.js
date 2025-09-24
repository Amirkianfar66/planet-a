// src/network/playroom.js
import {
    insertCoin,
    useMultiplayerState,
    myPlayer,
    isHost,
    getRoomCode,
} from "playroomkit";
import { GUN_OFFSETS } from "../game/gunOffsets";
import { randomPointInRoom, roomCenter } from "../map/deckA";
import COOLDOWN from "../data/cooldowns";
/* -------------------- Room code helpers -------------------- */
export async function ensureRoomCodeInUrl(retries = 120) {
    if (typeof window === "undefined") return undefined;

    let code = null;
    try { code = new URL(window.location.href).searchParams.get("r"); } catch { }

    let i = 0;
    while (!code && i < retries) {
        try { code = getRoomCode?.(); } catch { }
        if (code) break;
        await new Promise((r) => setTimeout(r, 50));
        i++;
    }

    if (code) {
        const u = new URL(window.location.href);
        u.searchParams.set("r", code);
        window.history.replaceState({}, "", u.toString());
    }
    return code || undefined;
}

export function useLobbyRevealUntil() {
    return useMultiplayerState("lobbyRevealUntil", 0);
}

/* ---------- Invite URL builders: sync and async (preferred) ---------- */
export function teamInviteUrl(teamId) {
    if (typeof window === "undefined") {
        return `/?team=${encodeURIComponent(teamId)}`;
    }
    const base = new URL(window.location.origin + window.location.pathname);
    const u = new URL(window.location.href);
    const code = u.searchParams.get("r") || getRoomCode?.();
    if (code) base.searchParams.set("r", code);
    base.searchParams.set("team", teamId);
    return base.toString();
}

export async function teamInviteUrlAsync(teamId) {
    await ensureRoomCodeInUrl();
    return teamInviteUrl(teamId);
}

/* -------------------- Open lobby (always persist ?r=) -------------------- */
export async function openLobby() {
    try {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        const roomCodeFromUrl = url.searchParams.get("r") || undefined;

        await insertCoin({ skipLobby: true, roomCode: roomCodeFromUrl });
        await ensureRoomCodeInUrl();
    } catch (e) {
        console.error("insertCoin failed:", e);
        throw e;
    }
}

/* -------------------- Shared game state hooks -------------------- */
export function usePhase() { return useMultiplayerState("phase", "lobby"); }
export function useTimer() { return useMultiplayerState("timer", 60); }

export function useLengths() {
    const [dayLength, setDayLen] = useMultiplayerState("dayLength", 60);
    const [meetingLength, setMeetLen] = useMultiplayerState("meetingLength", 30);
    const [nightLength, setNightLen] = useMultiplayerState("nightLength", 45);
    return { dayLength, meetingLength, nightLength, setDayLen, setMeetLen, setNightLen };
}

export function useMeters() {
    const [oxygen, setOxygen] = useMultiplayerState("oxygen", 100);
    const [power, setPower] = useMultiplayerState("power", 100);
    const [cctv, setCCTV] = useMultiplayerState("cctv", 100);
    return { oxygen, power, cctv, setOxygen, setPower, setCCTV };
}

export function useInfectedAssigned() { return useMultiplayerState("infectedAssigned", false); }
export function useDead() { return useMultiplayerState("dead", []); }
export function useEvents() { return useMultiplayerState("events", []); }
export function useRolesAssigned() { return useMultiplayerState("rolesAssigned", false); }

/* -------------------- Player helpers -------------------- */
export function setMyPos(x, y, z) {
    const p = myPlayer();
    p.setState("x", x, true);
    p.setState("y", y, true);
    p.setState("z", z, true);
}
export function getMyPos() {
    const p = myPlayer();
    return {
        x: +(p.getState("x") ?? 0),
        y: +(p.getState("y") ?? 0),
        z: +(p.getState("z") ?? 0),
    };
}

/* -------------------- Actions & events -------------------- */
export function requestAction(type, target, value) {
    const p = myPlayer();
    const nextId = (Number(p.getState("reqId") || 0) + 1) | 0;
    p.setState("reqType", String(type), true);
    p.setState("reqTarget", String(target), true);

    if (typeof value === "number" && Number.isFinite(value)) {
        p.setState("reqValue", value, true);
        p.setState("reqJson", "", true);
    } else if (value !== undefined) {
        try { p.setState("reqJson", JSON.stringify(value), true); }
        catch { p.setState("reqJson", String(value), true); }
        p.setState("reqValue", Number(value) | 0, true);
    } else {
        p.setState("reqValue", 0, true);
        p.setState("reqJson", "", true);
    }
    p.setState("reqId", nextId, true);
}

export function readActionPayload(player) {
    const raw = player?.getState?.("reqJson");
    if (!raw) return undefined;
    if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return undefined; } }
    if (Array.isArray(raw) || typeof raw === "object") return raw;
    return undefined;
}

export function hostAppendEvent(setEvents, msg) {
    if (!isHost()) return;
    setEvents((arr) => {
        const next = Array.isArray(arr) ? [...arr, msg] : [msg];
        if (next.length > 25) next.splice(0, next.length - 25);
        return next;
    }, true);
}

/* -------------------- Ability helpers (host) -------------------- */
const ABILITY_CD_KEY = (abilityId) => `cd:${abilityId}Until`;
function nowMs() { return Date.now(); }

function isGuard(player) {
    try { return String(player?.getState?.("role") || "") === "Guard"; } catch { return false; }
}

// Compute closest player hit by a ray (origin, dir) within range.
// dir can be any length; normalize internally. Cylinder distance test around the ray.
function raycastPlayers(origin, dir, range, excludeId, playersList) {
    const [ox, oy, oz] = origin;
    let [dx, dy, dz] = dir;

    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    const players = Array.isArray(playersList) ? playersList : (window.playroom?.players?.() || []);
    const HIT_RADIUS = 1.1;
    const CHEST_UP = 1.0;

    let best = null;
    let bestT = Infinity;

    for (const p of players) {
        if (!p?.id || p.id === excludeId) continue;
        if (p.getState?.("dead")) continue;

        const px = Number(p.getState?.("x") || 0);
        const pz = Number(p.getState?.("z") || 0);
        const baseY = Number(p.getState?.("y") || 0);
        const py = baseY + CHEST_UP;

        const vx = px - ox, vy = py - oy, vz = pz - oz;
        const t = (vx * dx + vy * dy + vz * dz);
        if (t < 0 || t > range) continue;

        const rx = ox + dx * t, ry = oy + dy * t, rz = oz + dz * t;
        const ddx = px - rx, ddy = py - ry, ddz = pz - rz;
        const dist2 = ddx * ddx + ddy * ddy + ddz * ddz;

        if (dist2 <= (HIT_RADIUS * HIT_RADIUS) && t < bestT) {
            best = p; bestT = t;
        }
    }
    return best ? { target: best, t: bestT } : null;
}

/** Publish a short-lived tracer (start/end) on the shooter's state so all clients can render. */
function publishShotFx(shooter, origin, endPoint) {
    const fxId = Number(shooter.getState("shotFxId") || 0) + 1;
    shooter.setState("shotFxA", origin, true);
    shooter.setState("shotFxB", endPoint, true);
    shooter.setState("shotFxId", fxId, true);
}

// keep per-player intervals so we can fire continuously for 3s
const SHOOT_TIMERS = new Map();
function stopShootTimer(playerId) {
    const t = SHOOT_TIMERS.get(playerId);
    if (t) { clearInterval(t.h); SHOOT_TIMERS.delete(playerId); }
}

/** Guard ability: 3s continuous fire (hitscan every 120ms) with tracer FX */
export function hostHandleShoot({ shooter, payload, setEvents, players }) {
    if (!isGuard(shooter)) return;

    const SHOOT_DURATION = COOLDOWN.ABILITIES.GUARD_SHOOT.SERVER_BURST_MS;
    const FIRE_PERIOD = COOLDOWN.ABILITIES.GUARD_SHOOT.FIRE_PERIOD_MS;
    const RANGE = 10;
    const now = nowMs();

    const curUntil = Number(shooter.getState("shootingUntil") || 0);
    const newUntil = Math.max(curUntil, now + SHOOT_DURATION);
    shooter.setState("shootingUntil", newUntil, true);
    shooter.setState(
          ABILITY_CD_KEY("shoot"),
          newUntil + COOLDOWN.ABILITIES.GUARD_SHOOT.SERVER_LOCK_AFT_BURST_MS,
            true
         );

    const fireOnce = () => {
        const px = Number(shooter.getState("x") || 0);
        const baseY = Number(shooter.getState("y") || 0);
        const pz = Number(shooter.getState("z") || 0);
        const ry = Number(shooter.getState("ry") || shooter.getState("yaw") || 0);

        // 1) build direction from yaw
        const fwdX = Math.sin(ry), fwdZ = Math.cos(ry);
        const rightX = Math.cos(ry), rightZ = -Math.sin(ry);
        const dir = [fwdX, 0, fwdZ];

        // 2) raycast from neutral centerline (eye) origin
        const EYE_UP = 1.3;
        const rayOrigin = [px, baseY + EYE_UP, pz];
        const hit = raycastPlayers(rayOrigin, dir, RANGE, shooter.id, players);
        const travel = hit?.t ?? RANGE;

        const impactPoint = [
            rayOrigin[0] + dir[0] * travel,
            rayOrigin[1] + dir[1] * travel,
            rayOrigin[2] + dir[2] * travel,
        ];

        // 3) muzzle origin for visuals
        const rightOff = GUN_OFFSETS?.right ?? 0.6;
        const upY = GUN_OFFSETS?.up ?? 0.95;
        const forwardTotal = (GUN_OFFSETS?.forward ?? 0.18) + (GUN_OFFSETS?.barrelZ ?? 0.32);

        const muzzle = [
            px + rightOff * rightX + forwardTotal * fwdX,
            baseY + upY,
            pz + rightOff * rightZ + forwardTotal * fwdZ,
        ];

        // adjust tracer so it ends where the real ray hits
        const delta =
            (rayOrigin[0] - muzzle[0]) * dir[0] +
            (rayOrigin[1] - muzzle[1]) * dir[1] +
            (rayOrigin[2] - muzzle[2]) * dir[2];

        const tFromMuzzle = travel + delta;
        const tracerEnd = [
            muzzle[0] + dir[0] * tFromMuzzle,
            muzzle[1] + dir[1] * tFromMuzzle,
            muzzle[2] + dir[2] * tFromMuzzle,
        ];

        publishShotFx(shooter, muzzle, tracerEnd);

        // 4) apply damage
        if (hit?.target) {
            const victim = hit.target;
            const cur = Math.max(0, Math.min(100, Number(victim.getState("life") ?? 100)));
            const DMG_PER_TICK = 2;
            const next = Math.max(0, cur - DMG_PER_TICK);
            victim.setState("life", next, true);
            if (next <= 0) victim.setState("dead", true, true);
        }
    };

    // fire immediately
    fireOnce();

    // tick during burst
    if (!SHOOT_TIMERS.has(shooter.id)) {
        const h = setInterval(() => {
            const now2 = nowMs();
            const until = Number(shooter.getState("shootingUntil") || 0);
            if (!until || now2 >= until) { stopShootTimer(shooter.id); return; }
            fireOnce();
        }, FIRE_PERIOD);
        SHOOT_TIMERS.set(shooter.id, { h });
    }
}

/** Optional convenience: host-side router you can call from your ItemsHostLogic loop. */
export function hostRouteAction(fromPlayer, type, target, setEvents) {
    if (type === "ability" && target === "shoot") {
        const payload = readActionPayload(fromPlayer);
        hostHandleShoot({ shooter: fromPlayer, payload, setEvents });
        return true;
    }
    if (type === "ability" && target === "bite") {
        const players = (window.playroom?.players?.() || []);
        hostHandleBite({ biter: fromPlayer, players, setEvents });
        return true;
    }
    if (type === "ability" && target === "disguise") {
            hostHandleDisguise({ player: fromPlayer, setEvents });
            return true;
          }
    if (type === "ability" && target === "arrest") {
         const players = (window.playroom?.players?.() || []);
         hostHandleArrest({ officer: fromPlayer, players, setEvents });
         return true;
    }
    if (type === "ability" && target === "scan") {
         const players = (window.playroom?.players?.() || []);
         hostHandleScan({ officer: fromPlayer, players, setEvents });
        return true;
    }
    if (type === "ability" && target === "pet_order") {
        const payload = readActionPayload(fromPlayer);
        hostHandlePetOrder({ researcher: fromPlayer, setEvents, payload });
        return true;
    }

    return false;
}
// --- add below existing helpers in src/network/playroom.js ---


function isInfected(player) {
    try { return !!player?.getState?.("infected"); } catch { return false; }
}

function distance2(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
}

/** Find the closest living player in front of 'biter' within range & arc. */
function findBiteTarget(biter, range = 1.6, maxAngleDeg = 70) {
    const players = window.playroom?.players?.() || [];
    const bx = Number(biter.getState?.("x") || 0);
    const by = Number(biter.getState?.("y") || 0);
    const bz = Number(biter.getState?.("z") || 0);
    const ry = Number(biter.getState?.("ry") || biter.getState?.("yaw") || 0);

    // forward dir (x,z)
    const fdx = Math.sin(ry), fdz = Math.cos(ry);
    const dotThresh = Math.cos((maxAngleDeg * Math.PI) / 180);

    let best = null;
    let bestD2 = Infinity;

    for (const p of players) {
        if (!p?.id || p.id === biter.id) continue;
        if (p.getState?.("dead")) continue;

        const px = Number(p.getState?.("x") || 0);
        const pz = Number(p.getState?.("z") || 0);
        const d2 = distance2(px, pz, bx, bz);
        if (d2 > range * range) continue;

        const vx = px - bx, vz = pz - bz;
        const len = Math.hypot(vx, vz) || 1;
        const dot = (vx / len) * fdx + (vz / len) * fdz;
        if (dot < dotThresh) continue;

        if (d2 < bestD2) { best = p; bestD2 = d2; }
    }
    return best;
}

/** Infected ability: quick bite to infect a nearby target in front arc. */
// --- Host bite handler (paste into src/network/playroom.js) ---
// Infected ability: quick bite to infect a nearby target in front arc.
/** Infected ability: quick bite to infect a nearby target in front arc. */
export function hostHandleBite({ biter, players = [], setEvents }) {
    if (!biter?.id) return;

    // Only infected can bite
    if (!biter.getState?.("infected")) return;

    const now = Date.now();

    // Cooldown gate (server-side)
    const cdKey = "cd_bite_until";
    const cdUntil = Number(biter.getState(cdKey) || 0);
    if (now < cdUntil) return;

    // Find target in front cone
    const bx = Number(biter.getState("x") || 0);
    const bz = Number(biter.getState("z") || 0);
    const ry = Number(biter.getState("ry") ?? biter.getState("yaw") ?? 0);
    const fdx = Math.sin(ry), fdz = Math.cos(ry);
    const range = 1.6, range2 = range * range;
    const dotThresh = Math.cos((70 * Math.PI) / 180);

    let best = null, bestD2 = Infinity;
    for (const p of players) {
        if (!p?.id || p.id === biter.id) continue;
        if (p.getState?.("dead")) continue;
        if (p.getState?.("infected")) continue; // don't bite already infected

        const px = Number(p.getState("x") || 0);
        const pz = Number(p.getState("z") || 0);
        const dx = px - bx, dz = pz - bz;
        const d2 = dx * dx + dz * dz;
        if (d2 > range2) continue;

        const len = Math.hypot(dx, dz) || 1;
        const dot = (dx / len) * fdx + (dz / len) * fdz;
        if (dot < dotThresh) continue;

        if (d2 < bestD2) { best = p; bestD2 = d2; }
    }

    // Start bite cooldown + short FX regardless of hit
    biter.setState(cdKey, now + COOLDOWN.ABILITIES.INFECTED_BITE.SERVER_MS, true);
    biter.setState("bitingUntil", now + COOLDOWN.ABILITIES.INFECTED_BITE.FX_MS, true);

    if (!best) return;

    // --- Incubation deadline (centralized) ---
    const INCUBATION_MS = Math.max(0, Number(COOLDOWN.ABILITIES.INFECTED_BITE.INCUBATION_MS ?? 0));
    let until;

    if (INCUBATION_MS > 0) {
        // Fixed delay (testing / fast iteration)
        until = now + INCUBATION_MS;
    } else {
        // Fallback to your previous half-day / full-day logic
        const incubRatio = (Math.random() < 0.5 ? 0.5 : 1.0);
        const dayLengthMin = Number(biter?.getState?.("dayLength")) || 60; // safe fallback 60
        const dayMs = Math.max(1, dayLengthMin) * 60_000;
        until = now + Math.round(dayMs * incubRatio);
        best.setState("infectionIncubateRatio", incubRatio, true);
    }

    // Mark victim as incubating (NOT infected yet) + visible personal countdown
    best.setState("infectionPending", 1, true);
    best.setState("infected", 0, true);
    best.setState("infectedBy", biter.id, true);
    best.setState("infectionSeedAt", now, true);
    if (INCUBATION_MS > 0) best.setState("infectionIncubateRatio", 0, true); // not used in fixed mode
    best.setState("infectionRevealUntil", until, true);

    // Prevent chain-biting until they actually turn
    best.setState("cd_bite_until", until, true);


    // Award energy to biter
    const curE = Number(biter.getState("energy") ?? 0);
    biter.setState("energy", Math.min(100, curE + 50), true);

    // Log
    try {
        const name = biter.getState?.("name") || "Infected";
        hostAppendEvent?.(setEvents, `${name} bit a crew member — incubation started.`);
    } catch { }
}

// put near other helpers
const FALLBACK_LOCKDOWN = { x: 0, y: 0, z: 0 }; // only used if "lockdown" room isn't found

function getLockdownPos() {
    // Try a random point in the "lockdown" room; fall back to its center
    try {
        const p = randomPointInRoom?.("lockdown", 0.85) || roomCenter?.("lockdown");
        if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
            return { x: +p.x, y: Number.isFinite(p.y) ? +p.y : 0, z: +p.z };
        }
    } catch { }
    return FALLBACK_LOCKDOWN;
}


function _frontConeTarget(source, players, range = 2.0, maxAngleDeg = 70) {
    const sx = Number(source.getState("x") || 0);
    const sz = Number(source.getState("z") || 0);
    const ry = Number(source.getState("ry") ?? source.getState("yaw") ?? 0);
    const fdx = Math.sin(ry), fdz = Math.cos(ry);
    const dotMin = Math.cos((maxAngleDeg * Math.PI) / 180);
    let best = null, bestD2 = Infinity;

    for (const p of players) {
        if (!p?.id || p.id === source.id) continue;
        if (p.getState?.("dead")) continue;

        const px = Number(p.getState("x") || 0);
        const pz = Number(p.getState("z") || 0);
        const dx = px - sx, dz = pz - sz;
        const d2 = dx * dx + dz * dz;
        if (d2 > range * range) continue;

        const len = Math.hypot(dx, dz) || 1;
        const dot = (dx / len) * fdx + (dz / len) * fdz;
        if (dot < dotMin) continue;

        if (d2 < bestD2) { best = p; bestD2 = d2; }
    }
    return best;
}

export function hostHandleArrest({ officer, players = [], setEvents }) {
    if (!officer?.id) return;

    const role = String(officer.getState?.("role") || "");
    if (role && role !== "StationDirector") return;

    const arrestsLeft = Number(officer.getState("arrestsLeft"));
    const left = Number.isFinite(arrestsLeft) ? arrestsLeft : 1;
    if (left <= 0) return;

    const target = _frontConeTarget(officer, players, 2.0, 70);
    if (!target || target.getState?.("inLockdown")) return;

    // Always use the "lockdown" room
    const L = getLockdownPos();

    target.setState("x", Number(L.x || 0), true);
    target.setState("y", Number(L.y || 0), true);
    target.setState("z", Number(L.z || 0), true);
    target.setState("inLockdown", true, true);
    target.setState("lockedBy", officer.id, true);
    target.setState("lockedAt", Date.now(), true);

    officer.setState("arrestsLeft", left - 1, true);

    try {
        const name = officer.getState?.("name") || "Station Director";
        hostAppendEvent(setEvents, `${name} arrested a crew member (sent to Lockdown).`);
    } catch { }
}

//** Officer ability: Blood Test — uses central cooldowns */
export function hostHandleScan({ officer, players = [], setEvents }) {
    if (!officer?.id) return;
    const role = String(officer.getState?.("role") || "");
    if (role !== "Officer") return;

    const now = Date.now();
    const cdKey = "cd:scanUntil";
    const until = Number(officer.getState(cdKey) || 0);
    if (now < until) return;

    const RANGE = Number(COOLDOWN.ABILITIES.OFFICER_SCAN.RANGE_M || 1.0);
    const range2 = RANGE * RANGE;

    // Find nearest living player within RANGE (no cone)
    const ox = Number(officer.getState("x") || 0);
    const oz = Number(officer.getState("z") || 0);
    let nearest = null, bestD2 = Infinity;
    for (const p of players) {
        if (!p?.id || p.id === officer.id) continue;
        if (p.getState?.("dead")) continue;
        const px = Number(p.getState("x") || 0);
        const pz = Number(p.getState("z") || 0);
        const dx = px - ox, dz = pz - oz;
        const d2 = dx * dx + dz * dz;
        if (d2 <= range2 && d2 < bestD2) { nearest = p; bestD2 = d2; }
    }
    if (!nearest) return;

    // Set ability cooldown
    const ABILITY_MS = Number(COOLDOWN.ABILITIES.OFFICER_SCAN.SERVER_MS || 3000);
    officer.setState(cdKey, now + ABILITY_MS, true);

    // 3s delayed reveal (name immediately, result later)
    const REVEAL_MS = Number(COOLDOWN.ABILITIES.OFFICER_SCAN.RESULT_DELAY_MS || 3000);
    const tName = nearest.getState?.("name") || nearest.getProfile?.().name || "Player";
    const infectedAtSample = !!nearest.getState?.("infected");

    officer.setState("scanPendingName", tName, true);
    officer.setState("scanPendingUntil", now + REVEAL_MS, true);

    // Guard against overlap
    const token = ((Number(officer.getState("scanPendingToken")) || 0) + 1) | 0;
    officer.setState("scanPendingToken", token, true);

    setTimeout(() => {
        if (Number(officer.getState("scanPendingToken")) !== token) return;
        officer.setState("lastScanName", tName, true);
        officer.setState("lastScanInfected", infectedAtSample ? 1 : 0, true);
        officer.setState("lastScanAt", Date.now(), true);
        officer.setState("scanPendingName", "", true);
        officer.setState("scanPendingUntil", 0, true);

        try {
            const oName = officer.getState?.("name") || "Officer";
            hostAppendEvent(setEvents, `${oName} blood test result for ${tName}: ${infectedAtSample ? "INFECTED" : "clear"}.`);
        } catch { }
    }, REVEAL_MS);
}



/** Research ability: command pet follow/stay. Payload: { mode: "follow" | "stay" }.
 * If no payload, it toggles the current mode.
 */
/** Research ability: command pet follow/stay/seekCure.
 * Payload (optional): { mode: "follow" | "stay" | "seekCure" }.
 * If no payload, cycles follow → seekCure → stay.
 */
export function hostHandlePetOrder({ researcher, setEvents, payload }) {
    if (!researcher?.id) return;

    const role = String(researcher.getState?.("role") || "");
    if (role !== "Research") return;

    // sanitize desired
    const allowed = new Set(["follow", "stay", "seekCure"]);
    let desired = (payload && allowed.has(payload.mode)) ? payload.mode : "toggle";

    const cur = String(researcher.getState?.("petMode") || "follow");
    // cycle: follow -> seekCure -> stay -> follow
    const next = desired === "toggle"
        ? (cur === "follow" ? "seekCure" : (cur === "seekCure" ? "stay" : "follow"))
        : desired;

    researcher.setState("petMode", next, true);

    try {
        const name = researcher.getState?.("name") || "Research";
        hostAppendEvent?.(setEvents, `${name} ordered pet: ${next}.`);
    } catch { }
}



// Infected: toggle a synced "disguiseOn" flag that clients use to render a special model
export function hostHandleDisguise({ player, setEvents }) {
    if (!player?.id) return;
    const infected = !!player.getState?.('infected');
    if (!infected) return;

    const currentlyOn = !!player.getState('disguiseOn');
    player.setState('disguiseOn', !currentlyOn, true);

    // Clean up any legacy state from the old cycling approach (safe no-op if unused)
    if (player.getState?.('disguiseRole')) player.setState('disguiseRole', '', true);

    try {
        if (typeof hostAppendEvent === 'function') {
            const name = player.getState?.('name') || 'Infected';
            hostAppendEvent(setEvents, `${name} toggled disguise ${!currentlyOn ? 'ON' : 'OFF'}.`);
        }
    } catch { }
}

/** Extend the host-side router so ItemsHostLogic can just call one function. */


/* -------------------- Utility -------------------- */
export async function waitForLocalPlayer(timeoutMs = 5000) {
    const start = Date.now();
    while (!myPlayer?.()) {
        if (Date.now() - start > timeoutMs) return null;
        await new Promise((r) => setTimeout(r, 50));
    }
    return myPlayer();
}
