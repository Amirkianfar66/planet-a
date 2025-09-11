// src/network/playroom.js
import {
    insertCoin,
    useMultiplayerState,
    myPlayer,
    isHost,
    getRoomCode, // ok if your playroomkit exports it
} from "playroomkit";

/* -------------------- Room code helpers -------------------- */
export async function ensureRoomCodeInUrl(retries = 120) {
    if (typeof window === "undefined") return undefined;

    let code = null;
    try {
        code = new URL(window.location.href).searchParams.get("r");
    } catch { }

    let i = 0;
    while (!code && i < retries) {
        try { code = getRoomCode?.(); } catch { }
        if (code) break;
        await new Promise((r) => setTimeout(r, 50)); // ~6s worst case
        i++;
    }

    if (code) {
        const u = new URL(window.location.href);
        u.searchParams.set("r", code);
        window.history.replaceState({}, "", u.toString());
    }
    return code || undefined;
}

// Keep your reveal hook
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

    // prefer existing ?r=, otherwise ask SDK
    const code = u.searchParams.get("r") || getRoomCode?.();
    if (code) base.searchParams.set("r", code);

    base.searchParams.set("team", teamId);
    return base.toString();
}

// ✅ Use this one in your Lobby before copying/sharing the link
export async function teamInviteUrlAsync(teamId) {
    await ensureRoomCodeInUrl(); // guarantees ?r= is present
    return teamInviteUrl(teamId);
}

/* -------------------- Open lobby (always persist ?r=) -------------------- */
export async function openLobby() {
    try {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        const roomCodeFromUrl = url.searchParams.get("r") || undefined;

        await insertCoin({ skipLobby: true, roomCode: roomCodeFromUrl });
        await ensureRoomCodeInUrl(); // force-write ?r= for everyone
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

export function useInfectedAssigned() {
    return useMultiplayerState("infectedAssigned", false);
}

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
    p.setState("reqValue", Number(value) | 0, true);
    p.setState("reqId", nextId, true);
}

export function hostAppendEvent(setEvents, msg) {
    if (!isHost()) return;
    setEvents((arr) => {
        const next = Array.isArray(arr) ? [...arr, msg] : [msg];
        if (next.length > 25) next.splice(0, next.length - 25);
        return next;
    }, true);
}
// --- Ability helpers (host) ---

const ABILITY_CD_KEY = (abilityId) => `cd:${abilityId}Until`;

function nowMs() { return Date.now(); }

function isGuard(player) {
    try { return String(player?.getState?.('role') || '') === 'Guard'; } catch { return false; }
}

// Compute closest player hit by a ray (origin, dir) within range.
// dir should be normalized; we do a simple cylinder distance test around the ray.
function raycastPlayers(origin, dir, range, excludeId, friendlyFire = false) {
    const [ox, oy, oz] = origin; const [dx, dy, dz] = dir;
    const players = window.playroom?.players?.() || []; // or your usePlayersList() bridge
    const HIT_RADIUS = 0.75;

    let best = null;
    let bestT = Infinity;

    for (const p of players) {
        if (!p?.id || p.id === excludeId) continue;

        // skip already downed players if you track it on state
        const dead = !!p.getState?.('dead');
        if (dead) continue;

        // position
        const px = Number(p.getState?.('x') || 0);
        const pz = Number(p.getState?.('z') || 0);
        const py = 1.2;

        // solve closest point on ray
        const vx = px - ox, vy = py - oy, vz = pz - oz;
        const t = (vx * dx + vy * dy + vz * dz); // ray param
        if (t < 0 || t > range) continue;

        // perpendicular distance^2 from player to ray
        const rx = ox + dx * t, ry = oy + dy * t, rz = oz + dz * t;
        const ddx = px - rx, ddy = py - ry, ddz = pz - rz;
        const dist2 = ddx * ddx + ddy * ddy + ddz * ddz;

        if (dist2 <= (HIT_RADIUS * HIT_RADIUS) && t < bestT) {
            best = p; bestT = t;
        }
    }
    return best ? { target: best, t: bestT } : null;
}

function hostHandleShoot({ shooter, payload, setEvents }) {
    // cooldown gate
    const until = Number(shooter.getState(ABILITY_CD_KEY('shoot')) || 0);
    if (until && nowMs() < until) return;

    if (!isGuard(shooter)) return; // role check

    const origin = payload?.origin || [0, 1.2, 0];
    let dir = payload?.dir || [0, 0, 1];
    // normalize dir
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir = [dir[0] / len, dir[1] / len, dir[2] / len];

    const RANGE = 12;
    const hit = raycastPlayers(origin, dir, RANGE, shooter.id, false);

    // set cooldown
    shooter.setState(ABILITY_CD_KEY('shoot'), nowMs() + 700, true);

    if (hit?.target) {
        const victim = hit.target;
        // simple "downed" flag for now (you can integrate with your dead[] array)
        victim.setState('dead', true, true);
        setEvents?.((prev) => [...prev, `${shooter.getProfile().name || 'Guard'} shot ${victim.getProfile().name || 'Player'}.`]);
        console.log('[HOST] ability:shoot hit', victim.id);
    } else {
        setEvents?.((prev) => [...prev, `${shooter.getProfile().name || 'Guard'} fired.`]);
        console.log('[HOST] ability:shoot miss');
    }
}

/* -------------------- Utility -------------------- */
export async function waitForLocalPlayer(timeoutMs = 5000) {
    const start = Date.now();
    while (!myPlayer?.()) {
        if (Date.now() - start > timeoutMs) return null;
        await new Promise((r) => setTimeout(r, 50));
    }
    return myPlayer();
}
