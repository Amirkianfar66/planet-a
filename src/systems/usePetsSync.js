// src/systems/usePetsSync.js
import { useEffect, useRef } from "react";
import { useMultiplayerState } from "playroomkit";

export default function usePetsSync() {
    const [pets, setPets] = useMultiplayerState("pets", []); // synced array
    const petsRef = useRef(pets);
    useEffect(() => { petsRef.current = pets || []; }, [pets]);

    return { pets: pets || [], setPets, petsRef };
}
