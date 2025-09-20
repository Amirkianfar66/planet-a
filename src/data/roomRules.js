// src/data/roomRules.js
// Centralized, data-first room rules.
// Uses ROOM_KEYS from deckA so all room references are validated.

import { ROOM_KEYS } from "../map/deckA";

// ──────────────────────────────────────────────────────────────────────────────
// EDIT ME: Item placement rules
// - key: item type (case-insensitive)
// - allowedRooms: array of valid room keys (must exist in ROOM_KEYS)
// - allowedTags: optional array of room "tags" that also permit this item
// - onViolation: "reject" | "snap" (reject drop/use here, or auto-snap to a valid room)
// NOTE: If you use tags, pass them from your caller (roomTags param).
export const ITEM_ROOM_RULES = {
    // EXAMPLES — replace with your actual room keys/types
    cctv_console: { allowedRooms: ["security_room"], onViolation: "snap" },
    medkit: { allowedRooms: ["medbay"], onViolation: "reject" },
    oxygen_tank: { allowedTags: ["engineering"], onViolation: "snap" },
    sample_jar: { allowedRooms: ["lab_a", "lab_b"], onViolation: "snap" },
    // fuel: { allowedRooms: ["engine_room"], onViolation: "snap" },
};

// ──────────────────────────────────────────────────────────────────────────────
// EDIT ME: Action/ability rules
// - key: action name (case-insensitive)
// - allowedRooms / allowedTags: where it’s allowed
// - exclusive: if true, action is ONLY valid in those rooms/tags
export const ACTION_ROOM_RULES = {
    craft_medkit: { allowedRooms: ["medbay"], exclusive: true },
    vote_meeting: { allowedRooms: ["meeting_room"], exclusive: true },
    refill_oxygen: { allowedTags: ["engineering", "air"], exclusive: true },
    analyze_sample: { allowedRooms: ["lab_a", "lab_b"], exclusive: true },
    // repair_panel: { allowedTags: ["engineering"], exclusive: true },
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (pure; no deckA geometry calls here)

const norm = (v) => String(v || "").toLowerCase();

/**
 * Returns rule object for an item type, or null.
 * @param {string} itemType
 */
export function getRuleForItem(itemType) {
    return ITEM_ROOM_RULES[norm(itemType)] || null;
}

/**
 * Returns rule object for an action name, or null.
 * @param {string} action
 */
export function getRuleForAction(action) {
    return ACTION_ROOM_RULES[norm(action)] || null;
}

/**
 * Check if an item is allowed in a given room.
 * Callers should pass roomTags if you maintain a tag overlay (e.g., engineering/medical).
 * @param {Object} p
 * @param {string} p.itemType
 * @param {string|null} p.roomKey
 * @param {string[]} [p.roomTags=[]]
 * @returns {{allowed: boolean, reason?: "room_restriction"}}
 */
export function isItemAllowedInRoom({ itemType, roomKey, roomTags = [] }) {
    const rule = getRuleForItem(itemType);
    if (!rule) return { allowed: true }; // no restriction

    const inRooms = rule.allowedRooms?.includes(roomKey);
    const inTags = rule.allowedTags?.some((t) => roomTags.includes(t));
    return (inRooms || inTags)
        ? { allowed: true }
        : { allowed: false, reason: "room_restriction" };
}

/**
 * Check if an action is allowed where the player currently is.
 * @param {Object} p
 * @param {string} p.action
 * @param {string|null} p.roomKey
 * @param {string[]} [p.roomTags=[]]
 * @returns {{allowed: boolean, reason?: "action_room_restriction"}}
 */
export function isActionAllowedInRoom({ action, roomKey, roomTags = [] }) {
    const rule = getRuleForAction(action);
    if (!rule) return { allowed: true }; // unrestricted action

    const inRooms = rule.allowedRooms?.includes(roomKey);
    const inTags = rule.allowedTags?.some((t) => roomTags.includes(t));
    const inside = !!(inRooms || inTags);

    if (rule.exclusive) {
        return inside
            ? { allowed: true }
            : { allowed: false, reason: "action_room_restriction" };
    }
    // non-exclusive: allowed anywhere, but marked rooms/tags are "preferred"
    return { allowed: true };
}

/**
 * Convenience: what should happen if an item violates its rule?
 * Returns "reject" by default.
 * @param {string} itemType
 * @returns {"reject" | "snap"}
 */
export function violationPolicyForItem(itemType) {
    const v = getRuleForItem(itemType)?.onViolation;
    return v === "snap" ? "snap" : "reject";
}

/**
 * Convenience: list of allowed rooms for an item (might be empty/undefined).
 * Useful if you want to snap to any of these rooms.
 * @param {string} itemType
 * @returns {string[]|undefined}
 */
export function allowedRoomsForItem(itemType) {
    return getRuleForItem(itemType)?.allowedRooms;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dev-time validation (warn on typos in room keys). Non-fatal.
(function validateRoomRules() {
    const isDev = typeof import.meta !== "undefined"
        ? !!import.meta.env?.DEV
        : process.env.NODE_ENV !== "production";

    if (!isDev) return;

    const problems = [];

    const checkRooms = (where, obj) => {
        for (const [key, rule] of Object.entries(obj)) {
            const listed = rule?.allowedRooms || [];
            const bad = listed.filter((rk) => !ROOM_KEYS.includes(rk));
            if (bad.length) problems.push({ where, key, bad });
        }
    };

    checkRooms("ITEM_ROOM_RULES", ITEM_ROOM_RULES);
    checkRooms("ACTION_ROOM_RULES", ACTION_ROOM_RULES);

    if (problems.length) {
        console.warn(
            "[roomRules] Unknown room keys detected:",
            problems.map(p => ({
                table: p.where,
                ruleKey: p.key,
                unknownRoomKeys: p.bad
            }))
        );
    }
})();
