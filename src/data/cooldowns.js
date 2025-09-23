// src/data/cooldowns.js
// One place to tune all balance timers (ms / sec).

const COOLDOWN = {
    ABILITIES: {
        // ——— Guard ———
        GUARD_SHOOT: {
            // HUD shows this (can be longer than server if you want pacing)
            CLIENT_MS: 7000,              // 7s shown to player
            // Server-side behavior
            SERVER_BURST_MS: 1000,        // 1s burst duration
            SERVER_LOCK_AFT_BURST_MS: 500,// extra lock after burst ends
            FIRE_PERIOD_MS: 120,          // hitscan tick during burst
        },

        // ——— Officer ———
        OFFICER_SCAN: {
            CLIENT_MS: 3000,              // 3s button lock on client (matches reveal)
            SERVER_MS: 3000,              // 3s host cooldown (authoritative)
            RESULT_DELAY_MS: 3000,        // reveal result after 3s, keep this = CLIENT_MS for simple UX
            RANGE_M: 1.0,                 // scan range (meters)
        },

        // ——— Station Director ———
        STATIONDIRECTOR_ARREST: {
            CLIENT_MS: 0,                 // using charges instead
            SERVER_MS: 0,
        },

        // ——— Engineer ———
        ENGINEER_QUICK_REPAIR: {
            CLIENT_MS: 4000,
            SERVER_MS: 0,                 // client-only pacing unless you add host rule
        },

        // ——— Research ———
        RESEARCH_PET_ORDER: {
            CLIENT_MS: 400,
            SERVER_MS: 0,
        },

        // ——— Food Supplier ———
        FOODSUPPLIER_DROP_FOOD: {
            CLIENT_MS: 6000,
            SERVER_MS: 0,
        },

        // ——— Infected ———
        INFECTED_BITE: {
            CLIENT_MS: 240000,            // 4 min display
            SERVER_MS: 240000,            // 4 min enforced
            FX_MS: 600,                   // short "biting" FX flag
        },
        INFECTED_DISGUISE: {
            CLIENT_MS: 500,               // cosmetic toggle pacing
            SERVER_MS: 0,
        },
    },

    ITEMS: {
        PICKUP_SEC: 3,                 // host uses seconds for pickup lock
    },
};

export default COOLDOWN;
export { COOLDOWN };
