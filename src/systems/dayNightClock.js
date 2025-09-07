// src/systems/dayNightClock.js
import { create } from 'zustand';

const SECONDS_PER_DAY = 24 * 3600;   // 86,400
const HALF_DAY_SEC     = 12 * 3600;  // 43,200

// Default config: Day = 3min, Night = 3min  => 24h in 6min => 240x
const DEFAULTS = {
  realDayDurationSec: 180,
  realNightDurationSec: 180,
  dayStartHour: 6,     // Day is 06:00–18:00 by default, Night is 18:00–06:00
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
  // Day window: [dayStart, nightStart)
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
  // distance from start considering wrap
  const dist = (sec - start + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return Math.min(1, dist / HALF_DAY_SEC);
};

export const useGameClock = create((set, get) => {
  // Workhorse scale (same for day/night because durations are equal)
  const timeScale =
    SECONDS_PER_DAY / (DEFAULTS.realDayDurationSec + DEFAULTS.realNightDurationSec); // 86400/360 = 240

  return {
    // Config
    realDayDurationSec: DEFAULTS.realDayDurationSec,
    realNightDurationSec: DEFAULTS.realNightDurationSec,
    dayStartHour: DEFAULTS.dayStartHour,

    // Canonical state (anchor + params)
    anchorRealMs: performance.now(),
    anchorGameSec: DEFAULTS.dayStartHour * 3600, // start at 06:00
    paused: false,

    // Derived getters
    nowGameSec: () => {
      const { anchorRealMs, anchorGameSec, paused } = get();
      const nowMs = performance.now();
      const realElapsed = paused ? 0 : (nowMs - anchorRealMs) / 1000;
      return clampDay(anchorGameSec + realElapsed * timeScale);
    },

    phase: () => {
      const { dayStartHour } = get();
      return computePhase(get().nowGameSec(), dayStartHour);
    },

    phaseProgress: () => {
      const { dayStartHour } = get();
      return phaseProgress(get().nowGameSec(), dayStartHour);
    },

    // Mutations (host should call these and broadcast if you sync over network)
    setPaused: (paused) => set({ paused, anchorRealMs: performance.now(), anchorGameSec: get().nowGameSec() }),

    setClockTo: (gameSec) =>
      set({ anchorGameSec: clampDay(gameSec), anchorRealMs: performance.now() }),

    addMinutes: (mins) =>
      set({ anchorGameSec: clampDay(get().nowGameSec() + mins * 60), anchorRealMs: performance.now() }),

    setPhaseDay: () => {
      const { dayStartHour } = get();
      set({ anchorGameSec: dayStartHour * 3600, anchorRealMs: performance.now() });
    },

    setPhaseNight: () => {
      const { dayStartHour } = get();
      const nightStart = (dayStartHour * 3600 + HALF_DAY_SEC) % SECONDS_PER_DAY;
      set({ anchorGameSec: nightStart, anchorRealMs: performance.now() });
    },

    // Optional: tweak config at runtime
    configure: (partial) => set((s) => ({ ...s, ...partial, anchorRealMs: performance.now(), anchorGameSec: get().nowGameSec() })),

    // Utilities
    format: () => formatHHMM(get().nowGameSec()),
    timeScale, // exported in case you need it elsewhere
  };
});

// Helpers you can import where needed
export const GameClockUtils = {
  SECONDS_PER_DAY,
  HALF_DAY_SEC,
  clampDay,
  formatHHMM,
  computePhase,
  phaseProgress,
};
