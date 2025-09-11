// src/game/roleAbilities.js
// Central definition of role abilities (+ defaults).
// Each ability may define: key, label, cooldownMs, range, damage, etc.

export const ROLES = ['Engineer', 'Research', 'StationDirector', 'Officer', 'Guard', 'FoodSupplier'];

export const ROLE_ABILITIES = {
    Guard: [
        {
            id: 'shoot',
            key: 'KeyF',                  // keyboard code
            label: 'Shoot',
            cooldownMs: 700,
            range: 12,                    // meters
            damage: 100,                  // instant down for now
            friendlyFire: false,
            icon: '🔫',
        }
    ],
    Engineer: [
        { id: 'quick_repair', key: 'KeyF', label: 'Quick Repair', cooldownMs: 4000, icon: '🛠️' },
    ],
    Research: [
        { id: 'scan', key: 'KeyF', label: 'Scan (Blood Test)', cooldownMs: 12000, icon: '🧪' },
    ],
    StationDirector: [
        { id: 'call_meeting', key: 'KeyF', label: 'Call Meeting', cooldownMs: 20000, icon: '📣' },
    ],
    Officer: [
        { id: 'mark_suspect', key: 'KeyF', label: 'Mark Suspect', cooldownMs: 6000, icon: '🎯' },
    ],
    FoodSupplier: [
        { id: 'drop_food', key: 'KeyF', label: 'Drop Food', cooldownMs: 6000, icon: '🍱' },
    ],
};

export function getAbilitiesForRole(role) {
    return ROLE_ABILITIES[role] || [];
}
