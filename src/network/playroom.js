// src/network/playroom.js
import { insertCoin, useMultiplayerState, myPlayer, isHost } from "playroomkit";

/* -------------------------------------------
   DEV: trace subscriptions to find duplicates
-------------------------------------------- */
const _subCounts = new Map();
function _debugSub(key) {
    // Vite/esbuild: import.meta.env.DEV is defined
    const isDev = !!(import.meta && import.meta.env && import.meta.env.DEV);
    if (!isDev) return;
    const n = (_subCounts.get(key) || 0) + 1;
    _subCounts.set(key, n);
    // eslint-disable-next-line no-console
    console.debug(`[playroom] useMultiplayerState("${key}") subscribe #${n}`);
    if (n > 10) {
        // eslint-disable-next-line no-console
        console.warn(
            `[playroom] "${key}" now has ${n} subscribers. Consider consolidating or hoisting.`
        );
    }
}
// Wrapper so all subs pass through one place
function useStateKey(key, defVal) {
    _debugSub(key);
    return useMultiplayerState(key, defVal);
}

/* -------------------------------------------
   Lobby / room join
   - Accept ?r=RNIXI  (query)
   - Accept #r=RNIXI  (hash)  ← fixed
-------------------------------------------- */
function getRoomCodeFromUrl(u) {
    const fromQuery = u.searchParams.get("r");
    if (fromQuery) return fromQuery;
    const m = (u.hash || "").match(/(?:^#|[?#&])r=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : undefined;
}

export async function openLobby() {
    try {
        const url = new URL(window.location.href);
        const roomCode = getRoomCodeFromUrl(url);

        await insertCoin({
            skipLobby: true,
            roomCode,
            // maxPlayers: 12,
            // maxPlayersPerRoom: 12,
        });

        // Best-effort: ensure the room code is in the QUERY (not hash) for sharing
        if (isHost()) {
            const prk =
                (typeof window !== "undefined" && window.playroomkit) || null;
            const getRoomCode =
                prk && typeof prk.getRoomCode === "function"
                    ? prk.getRoomCode
                    : null;
            try {
                const code = getRoomCode ? getRoomCode() : roomCode;
                if (code) {
                    url.searchParams.set("r", code);
                    // strip #r=... from hash if present
                    if (/#r=/i.test(url.hash)) {
                        url.hash = url.hash
                            .replace(/(^#|[&#])r=[^&]*/gi, "")
                            .replace(/^#&?$/, "");
                    }
                    window.history.replaceState({}, "", url.toString());
                }
            } catch {
                /* noop */
            }
        }
    } catch (e) {
        console.error("insertCoin failed:", e);
        throw e;
    }
}

/* -------------------------------------------
   Global multiplayer state hooks
-------------------------------------------- */

// Start in "lobby" so your custom <Lobby /> renders until host launches Day 1
export function usePhase() {
    return useStateKey("phase", "lobby"); // [value, setValue]
}

export function useTimer() {
    return useStateKey("timer", 60); // [value, setValue]
}

/** Consolidated: 3 → 1 listener for lengths */
const LENGTHS_DEFAULTS = { dayLength: 60, meetingLength: 30, nightLength: 45 };
export function useLengths() {
    const [lengths, setLengths] = useStateKey("lengths", LENGTHS_DEFAULTS);

    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const dayLength = num(lengths?.dayLength, LENGTHS_DEFAULTS.dayLength);
    const meetingLength = num(
        lengths?.meetingLength,
        LENGTHS_DEFAULTS.meetingLength
    );
    const nightLength = num(lengths?.nightLength, LENGTHS_DEFAULTS.nightLength);

    const upd =
        (key) =>
            (val, broadcast) =>
                setLengths((prev) => {
                    const cur =
                        prev && typeof prev === "object" ? prev : LENGTHS_DEFAULTS;
                    const base = num(cur[key], LENGTHS_DEFAULTS[key]);
                    const nextVal = typeof val === "function" ? val(base) : val;
                    return { ...cur, [key]: nextVal };
                }, broadcast);

    return {
        dayLength,
        meetingLength,
        nightLength,
        setDayLen: upd("dayLength"),
        setMeetLen: upd("meetingLength"),
        setNightLen: upd("nightLength"),
    };
}

/** Consolidated: 3 → 1 listener for meters */
const METERS_DEFAULTS = { oxygen: 100, power: 100, cctv: 100 };
export function useMeters() {
    const [meters, setMeters] = useStateKey("meters", METERS_DEFAULTS);

    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const oxygen = num(meters?.oxygen, METERS_DEFAULTS.oxygen);
    const power = num(meters?.power, METERS_DEFAULTS.power);
    const cctv = num(meters?.cctv, METERS_DEFAULTS.cctv);

    const upd =
        (key) =>
            (val, broadcast) =>
                setMeters((prev) => {
                    const cur = prev && typeof prev === "object" ? prev : METERS_DEFAULTS;
                    const base = num(cur[key], METERS_DEFAULTS[key]);
                    const nextVal = typeof val === "function" ? val(base) : val;
                    return { ...cur, [key]: nextVal };
                }, broadcast);

    // convenience: setMeterValue("oxygen", 80, true)
    const setMeterValue = (k, val, broadcast) => upd(k)(val, broadcast);

    return {
        oxygen,
        power,
        cctv,
        setOxygen: upd("oxygen"),
        setPower: upd("power"),
        setCCTV: upd("cctv"),
        // generic helpers if/when you add more meters
        meters,
        getMeter: (k, d = 0) => num(meters?.[k], d),
        setMeter: (k) => upd(k),              // returns updater for that key
        setMeterValue,                        // direct setter helper
    };
}

export function useDead() {
    return useStateKey("dead", []);
}
export function useEvents() {
    return useStateKey("events", []);
}
export function useRolesAssigned() {
    return useStateKey("rolesAssigned", false);
}

/* -------------------------------------------
   Player helpers
-------------------------------------------- */
export function setMyPos(x, y, z) {
    const p = myPlayer();
    p.setState("x", x, true);
    p.setState("y", y, true);
    p.setState("z", z, true);
}

export function getMyPos() {
    const p = myPlayer();
    return {
        x: Number(p.getState("x") ?? 0),
        y: Number(p.getState("y") ?? 0),
        z: Number(p.getState("z") ?? 0),
    };
}

/* -------------------------------------------
   Client → host action request
-------------------------------------------- */
export function requestAction(type, target, value) {
    const p = myPlayer();
    const nextId = (Number(p.getState("reqId") || 0) + 1) | 0;
    p.setState("reqType", String(type), true);
    p.setState("reqTarget", String(target), true);
    p.setState("reqValue", Number(value) | 0, true);
    p.setState("reqId", nextId, true);
    // trace on client
      // eslint-disable-next-line no-console
          console.log(`[REQ] ${type}`, { target, value, nextId });
}

/* -------------------------------------------
   Host-only: append an event to the shared feed (keeps last 25)
-------------------------------------------- */
export function hostAppendEvent(setEvents, msg) {
    if (!isHost()) return;
    setEvents((arr) => {
        const next = Array.isArray(arr) ? [...arr, msg] : [msg];
        if (next.length > 25) next.splice(0, next.length - 25);
        return next;
    }, true);
}
