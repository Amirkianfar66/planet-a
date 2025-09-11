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

/* -------------------- Utility -------------------- */
export async function waitForLocalPlayer(timeoutMs = 5000) {
    const start = Date.now();
    while (!myPlayer?.()) {
        if (Date.now() - start > timeoutMs) return null;
        await new Promise((r) => setTimeout(r, 50));
    }
    return myPlayer();
}
