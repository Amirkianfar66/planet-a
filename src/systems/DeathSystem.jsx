// src/systems/DeathSystem.jsx
import React, { useEffect, useRef } from "react";
import { myPlayer, isHost } from "playroomkit";
import { useMeters, useEvents, hostAppendEvent } from "../network/playroom";

export default function DeathSystem() {
    const meRef = useRef(null);
    const [events, setEvents] = useEvents(); // multiplayer events list
    const { oxygen, power } = useMeters();   // shared station meters (your existing hook)

    useEffect(() => { meRef.current = myPlayer(); }, []);

    useEffect(() => {
        const me = meRef.current;
        if (!me) return;

        const life = Number(me.getState?.("life") ?? 100);
        const oxy = Number(oxygen ?? 100);
        const eng = Number(power ?? 100);

        // Already dead? do nothing
        const isDead = Boolean(me.getState?.("dead"));
        if (isDead) return;

        // If any meter == 0 → die
        let reason = "";
        if (life <= 0) reason = "fatal injury";
        else if (oxy <= 0) reason = "oxygen depleted";
        else if (eng <= 0) reason = "energy depleted";

        if (reason) {
            const now = Date.now();
            me.setState?.("dead", true, true);
            me.setState?.("deadTs", now, true);
            me.setState?.("deathReason", reason, true);

            if (isHost()) {
                const name = me.getProfile?.().name || "Player";
                hostAppendEvent(setEvents, `${name} died (${reason}).`);
            }
        }
    }, [oxygen, power]); // life changes via host damage ticks; O2/Power come from shared state

    return null;
}
