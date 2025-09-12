// src/systems/DeathSystem.jsx
import React, { useEffect, useRef } from "react";
import { myPlayer, isHost } from "playroomkit";
import { useMeters, useEvents, hostAppendEvent } from "../network/playroom";

export default function DeathSystem() {
    const meRef = useRef(null);
    const rafRef = useRef(0);
    const [events, setEvents] = useEvents(); // multiplayer events list
    const { oxygen, power } = useMeters();   // shared station meters

    useEffect(() => { meRef.current = myPlayer(); }, []);

    useEffect(() => {
        const me = meRef.current;
        if (!me) return;

        const die = (reason) => {
            const now = Date.now();
            me.setState?.("dead", true, true);
            me.setState?.("deadTs", now, true);
            me.setState?.("deathReason", reason, true);

            if (isHost()) {
                const name =
                    me.getState?.("name") ||
                    me?.profile?.name ||
                    me?.name ||
                    "Player";
                hostAppendEvent(setEvents, `${name} died (${reason}).`);
            }
        };

        let stopped = false;

        const tick = () => {
            if (stopped) return;

            // Read current values
            const life = Number(me.getState?.("life") ?? 100);
            const personalEnergy = Number(me.getState?.("energy") ?? 100); // NEW
            const oxy = Number(oxygen ?? 100);
            const eng = Number(power ?? 100);

            // Already dead? stop checking
            const isDead = Boolean(me.getState?.("dead"));
            if (!isDead) {
                // If any meter <= 0 → die
                let reason = "";
                if (life <= 0) reason = "fatal injury";
                else if (oxy <= 0) reason = "oxygen depleted";
                else if (eng <= 0) reason = "energy depleted";           // station power
                else if (personalEnergy <= 0) reason = "energy depleted"; // personal energy

                if (reason) {
                    die(reason);
                    stopped = true;
                    return;
                }
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            stopped = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [oxygen, power]); // re-seed loop if shared meters change

    return null;
}
