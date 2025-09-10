import { useEffect, useMemo, useState } from "react";
import { isHost, myPlayer, usePlayersList } from "playroomkit";
import { INITIAL_ITEMS } from "../data/gameObjects";

export default function useItemsSync() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const players = usePlayersList(true);
  const iAmHost = isHost();

  // mark host so others can find it
  useEffect(() => {
    if (iAmHost) myPlayer().setState("host", true, true);
  }, [iAmHost]);

  // host publishes items JSON reliably whenever it changes
  useEffect(() => {
    if (!iAmHost) return;
    myPlayer().setState("itemsJson", JSON.stringify(items), true);
  }, [iAmHost, items]);

  // clients read the host items JSON
  useEffect(() => {
    if (iAmHost) return;
    const id = setInterval(() => {
      const host = players.find(p => !!p.getState("host"));
      const json = host?.getState("itemsJson");
      if (json) {
        try { const next = JSON.parse(json); setItems(next); } catch {}
      }
    }, 150);
    return () => clearInterval(id);
  }, [iAmHost, players]);

  return useMemo(() => ({ items, setItems, iAmHost }), [items, iAmHost]);
}
