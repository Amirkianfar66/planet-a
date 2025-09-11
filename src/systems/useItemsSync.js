import { useEffect, useRef, useState } from "react";
import { myPlayer, usePlayersList, isHost } from "playroomkit";

/**
 * Host-authoritative items sync.
 * - Host writes items JSON to its own player state (ITEMS_KEY).
 * - Everyone (host + clients) reads from the host’s state.
 */
const ITEMS_KEY = "itemsJsonV1";

export default function useItemsSync() {
    const [items, setItemsState] = useState([]);
    const others = usePlayersList(true);
    const amHost = isHost();

    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    const lastJsonRef = useRef("");

    const setItems = (updater, broadcast = false) => {
        const next =
            typeof updater === "function" ? updater(itemsRef.current || []) :
                Array.isArray(updater) ? updater : [];
        setItemsState(next);

        if (amHost && broadcast) {
            try {
                const json = JSON.stringify(next);
                if (json !== lastJsonRef.current) {
                    myPlayer()?.setState(ITEMS_KEY, json, true);
                    lastJsonRef.current = json;
                }
            } catch (e) {
                console.warn("[useItemsSync] serialize error:", e);
            }
        }
    };

    // Poll the host’s items
    useEffect(() => {
        let stop = false;

        const pickAuthor = () => {
            const everyone = [...(others || [])];
            const self = myPlayer();
            if (self && !everyone.find(p => p.id === self.id)) everyone.push(self);
            for (const p of everyone) {
                const val = p?.getState(ITEMS_KEY);
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
                            if (Array.isArray(parsed)) setItemsState(parsed);
                        } catch (e) {
                            console.warn("[useItemsSync] bad JSON:", e);
                        }
                    } else {
                        setItemsState([]);
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
        const json = myPlayer()?.getState(ITEMS_KEY);
        if (typeof json === "string" && json && json !== lastJsonRef.current) {
            try {
                const parsed = JSON.parse(json);
                if (Array.isArray(parsed)) {
                    lastJsonRef.current = json;
                    setItemsState(parsed);
                }
            } catch { }
        }
    }, [amHost]);

    return { items, setItems };
}
