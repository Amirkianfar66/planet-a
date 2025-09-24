// src/systems/HostInfectionIncubator.jsx
import { useEffect } from "react";
import { isHost, usePlayersList } from "playroomkit";
import { hostAppendEvent } from "../network/playroom";

export default function HostInfectionIncubator({ setEvents }) {
    const host = isHost();
    const players = usePlayersList(true);

    useEffect(() => {
        if (!host) return;
        const id = setInterval(() => {
            const now = Date.now();

            for (const p of players) {
                const until = Number(p?.getState?.("infectionRevealUntil") || 0);
                const already = !!p?.getState?.("infected");
                if (!until || already) continue;

                if (now >= until) {
                    // Promote to infected
                    p.setState("infected", true, true);
                    p.setState("infectedAt", now, true);

                    // Clear incubation flags
                    p.setState("infectionPending", 0, true);
                    p.setState("infectionSeedAt", 0, true);
                    p.setState("infectionIncubateRatio", 0, true);
                    p.setState("infectionRevealUntil", 0, true);

                    // Clear any stale bite lock if expired
                    const cd = Number(p.getState?.("cd_bite_until") || 0);
                    if (cd && cd <= now) p.setState("cd_bite_until", 0, true);

                    try {
                        const name = p.getProfile?.().name || p.getState?.("name") || "Crew";
                        hostAppendEvent?.(setEvents, `${name} succumbed to infection.`);
                    } catch { }
                }
            }
        }, 150); // fast tick for 5s tests

        return () => clearInterval(id);
    }, [host, players, setEvents]);

    return null;
}
