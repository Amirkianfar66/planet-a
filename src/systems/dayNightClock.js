import { create } from 'zustand';

const SECONDS_PER_DAY = 24 * 3600;   // 86,400
const HALF_DAY_SEC     = 12 * 3600;  // 43,200

// Day = 3min, Night = 3min  -> 24h in 6min (240×)
const DEFAULTS = {
  realDayDurationSec: 180,
  realNightDurationSec: 180,
  dayStartHour: 6,  // start-of-day boundary (06:00 → Day 1 starts here)
  maxDays: 7,
};

const clampDay = s => (s % SECONDS_PER_DAY + SECONDS_PER_DAY) % SECONDS_PER_DAY;

const formatHHMM = (sec) => {
  const hh = Math.floor(sec / 3600) % 24;
  const mm = Math.floor((sec % 3600) / 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const computePhase = (sec, dayStartHour = 6) => {
  const dayStart = dayStartHour * 3600;
  const nightStart = (dayStart + HALF_DAY_SEC) % SECONDS_PER_DAY;
  const inDay = dayStart <= nightStart
    ? (sec >= dayStart && sec < nightStart)
    : (sec >= dayStart || sec < nightStart); // wrapping case
  return inDay ? 'day' : 'night';
};

const phaseProgress = (sec, dayStartHour = 6) => {
  const dayStart = dayStartHour * 3600;
  const nightStart = (dayStart + HALF_DAY_SEC) % SECONDS_PER_DAY;
  const p = computePhase(sec, dayStartHour);
  const start = p === 'day' ? dayStart : nightStart;
  const dist = (sec - start + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return Math.min(1, dist / HALF_DAY_SEC);
};

export const useGameClock = create((set, get) => {
  const timeScale =
    SECONDS_PER_DAY / (DEFAULTS.realDayDurationSec + DEFAULTS.realNightDurationSec); // 86400/360 = 240

  return {
    // Config
    realDayDurationSec: DEFAULTS.realDayDurationSec,
    realNightDurationSec: DEFAULTS.realNightDurationSec,
    dayStartHour: DEFAULTS.dayStartHour,

    // 👇 NEW: day counter
    maxDays: DEFAULTS.maxDays,
    dayNumber: 1, // 1..maxDays

    // Canonical anchor
    anchorRealMs: performance.now(),
    anchorGameSec: DEFAULTS.dayStartHour * 3600, // start at 06:00
    paused: false,

    // Derived
    nowGameSec: () => {
      const { anchorRealMs, anchorGameSec, paused } = get();
      const nowMs = performance.now();
      const realElapsed = paused ? 0 : (nowMs - anchorRealMs) / 1000;
      return clampDay(anchorGameSec + realElapsed * timeScale);
    },
    phase: () => computePhase(get().nowGameSec(), get().dayStartHour),
    phaseProgress: () => phaseProgress(get().nowGameSec(), get().dayStartHour),

    // Mutations
    setPaused: (paused) => set({ paused, anchorRealMs: performance.now(), anchorGameSec: get().nowGameSec() }),
    setClockTo: (gameSec) => set({ anchorGameSec: clampDay(gameSec), anchorRealMs: performance.now() }),
    addMinutes: (mins) => set({ anchorGameSec: clampDay(get().nowGameSec() + mins * 60), anchorRealMs: performance.now() }),
    setPhaseDay: () => {
      const s = get().dayStartHour * 3600;
      set({ anchorGameSec: s, anchorRealMs: performance.now() });
    },
    setPhaseNight: () => {
      const s = (get().dayStartHour * 3600 + HALF_DAY_SEC) % SECONDS_PER_DAY;
      set({ anchorGameSec: s, anchorRealMs: performance.now() });
    },
    configure: (partial) =>
      set((state) => ({ ...state, ...partial, anchorRealMs: performance.now(), anchorGameSec: get().nowGameSec() })),

    // 👇 NEW: day helpers
    setDayNumber: (n) =>
      set(s => ({ dayNumber: Math.max(1, Math.min(Number(n) || 1, s.maxDays)) })),
    incrementDay: () =>
      set(s => ({ dayNumber: Math.min(s.dayNumber + 1, s.maxDays) })),
    resetDays: () => set({ dayNumber: 1 }),

    // Utils
    format: () => formatHHMM(get().nowGameSec()),
    timeScale,
    SECONDS_PER_DAY,
    HALF_DAY_SEC,
  };
});
