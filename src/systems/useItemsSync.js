// src/systems/useItemsSync.js
import { useEffect, useRef, useState } from "react";
import { myPlayer, usePlayersList, isHost } from "playroomkit";

/**
 * Host-authoritative items sync.
 *
 * - The HOST writes the full items array JSON to its own player state (ITEMS_KEY).
 * - Everyone (including the host) *reads* from the host's player state.
 * - Returns { items, setItems }.
 *   - setItems(updater, broadcast=true):
 *       * On host: applies updater to local items and, if broadcast=true, writes to host state.
 *       * On client: local-only unless you pass broadcast=false (broadcast is ignored when not host).
 */
const ITEMS_KEY = "itemsJsonV1";

export default function useItemsSync() {
    const [items, setItemsState] = useState([]);
    const others = usePlayersList(true);
    const me = myPlayer();
    const amHost = isHost();

    // keep refs to avoid frequent deps
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    // Serialize helper (stable enough for change detection)
    const lastJsonRef = useRef("");

    // ---- HOST: setItems broadcasts to room (writes to its own player state) ----
    const setItems = (updater, broadcast = false) => {
        const next =
            typeof updater === "function" ? updater(itemsRef.current || []) : (Array.isArray(updater) ? updater : []);
        setItemsState(next);

        if (amHost && broadcast) {
            try {
                const json = JSON.stringify(next);
                // avoid redundant writes
                if (json !== lastJsonRef.current) {
                    myPlayer()?.setState(ITEMS_KEY, json, true);
                    lastJsonRef.current = json;
                }
            } catch (e) {
                console.warn("[useItemsSync] Failed to serialize items:", e);
            }
        }
    };

    // ---- ALL CLIENTS: poll for authoritative items from the host player ----
    useEffect(() => {
        let cancelled = false;

        // pick the player that holds the authoritative items (normally the host)
        const pickAuthor = () => {
            // Prefer a player that has a non-empty ITEMS_KEY.
            // This works because only the host writes it in our flow.
            const everyone = [...(others || [])];
            const self = myPlayer();
            if (self && !everyone.find(p => p.id === self.id)) everyone.push(self);

            // Find any player who currently has items state published
            for (const p of everyone) {
                try {
                    const val = p?.getState(ITEMS_KEY);
                    if (typeof val === "string" && val.length > 0) return { player: p, json: val };
                } catch { }
            }
            return { player: null, json: "" };
        };

        const tick = () => {
            if (cancelled) return;

            try {
                const { json } = pickAuthor();

                if (typeof json === "string" && json !== lastJsonRef.current) {
                    // Update local cache + parse
                    lastJsonRef.current = json;
                    if (json) {
                        try {
                            const parsed = JSON.parse(json);
                            if (Array.isArray(parsed)) {
                                setItemsState(parsed);
                            }
                        } catch (e) {
                            // ignore parse errors; keep previous items
                            console.warn("[useItemsSync] Bad items JSON from host:", e);
                        }
                    } else {
                        // empty string means no items published yet
                        setItemsState([]);
                    }
                }
            } catch (e) {
                // ignore transient errors
            }

            // keep polling at ~7Hz; cheap + responsive
            setTimeout(tick, 140);
        };

        tick();
        return () => { cancelled = true; };
    }, [others, amHost]);

    // ---- HOST: ensure local state mirrors what's already in my player (useful after reloads) ----
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
