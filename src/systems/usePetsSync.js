// src/systems/usePetsSync.js
import { useRef, useEffect } from "react";
import { useRoomState } from "playroomkit"; // or whatever your useItemsSync uses

export default function usePetsSync() {
    // If your useItemsSync uses a custom store, mirror it here with key "pets"
    const [pets, setPets] = useRoomState("pets", []); // replace with your real impl
    const petsRef = useRef(pets);
    useEffect(() => { petsRef.current = pets; }, [pets]);
    return { pets, setPets, petsRef };
}
