// src/systems/usePetsSync.js
import { useEffect, useRef, useState } from "react";
import { myPlayer, usePlayersList, isHost } from "playroomkit";

/**
 * Host-authoritative pets sync (mirrors useItemsSync).
 * Host writes pets JSON to its own player state (PETS_KEY).
 * Everyone reads from whichever player currently has that key (the host).
 */
const PETS_KEY = "petsJsonV1";

export default function usePetsSync() {
    const [pets, setPetsState] = useState([]);
    const others = usePlayersList(true);
    const amHost = isHost();

    const petsRef = useRef(pets);
    useEffect(() => { petsRef.current = pets; }, [pets]);

    const lastJsonRef = useRef("");

    const setPets = (updater, broadcast = false) => {
        const next = typeof updater === "function"
            ? updater(petsRef.current || [])
            : Array.isArray(updater) ? updater : [];
        setPetsState(next);

        if (amHost && broadcast) {
            try {
                const json = JSON.stringify(next);
                if (json !== lastJsonRef.current) {
                    myPlayer()?.setState(PETS_KEY, json, true);
                    lastJsonRef.current = json;
                }
            } catch (e) {
                console.warn("[usePetsSync] serialize error:", e);
            }
        }
    };

    // Poll the host’s pets
    useEffect(() => {
        let stop = false;

        const pickAuthor = () => {
            const everyone = [...(others || [])];
            const self = myPlayer();
            if (self && !everyone.find(p => p.id === self.id)) everyone.push(self);
            for (const p of everyone) {
                const val = p?.getState(PETS_KEY);
                if (typeof val === "string" && val.length > 0) return { json: val };
            }
            return { json: "" };
        };

        const tick = () => {
            if (stop) return;
            try {
                const { json } = pickAuthor();
                if (typeof json === "string" && json !== lastJsonRef.current) {
                    lastJsonRef.current = json;
                    if (json) {
                        try {
                            const parsed = JSON.parse(json);
                            if (Array.isArray(parsed)) setPetsState(parsed);
                        } catch (e) {
                            console.warn("[usePetsSync] bad JSON:", e);
                        }
                    } else {
                        setPetsState([]);
                    }
                }
            } catch { }
            setTimeout(tick, 140);
        };

        tick();
        return () => { stop = true; };
    }, [others, amHost]);

    // Host: mirror any existing self state (hot-reloads)
    useEffect(() => {
        if (!amHost) return;
        const json = myPlayer()?.getState(PETS_KEY);
        if (typeof json === "string" && json && json !== lastJsonRef.current) {
            try {
                const parsed = JSON.parse(json);
                if (Array.isArray(parsed)) {
                    lastJsonRef.current = json;
                    setPetsState(parsed);
                }
            } catch { }
        }
    }, [amHost]);

    return { pets, setPets, petsRef };
}
