// src/systems/HostRafDriver.jsx
import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { isHost } from "playroomkit";

export default function HostRafDriver() {
    // Drive host tick every render frame while tab is visible
    useFrame(() => {
        if (!isHost()) return;
        const tick = window.__planetAHostTick;
        if (typeof tick === "function" && !document.hidden) {
            try { tick("raf"); } catch { }
        }
    });

    // Background fallback: gentle timer + wake on visibilitychange
    useEffect(() => {
        if (!isHost()) return;

        // prevent double loops in StrictMode
        if (window.__planetAHostBGActive) return;
        window.__planetAHostBGActive = true;

        let cancelled = false;
        let timer = null;

        const loop = () => {
            if (cancelled) return;
            // only run the fallback when the tab is hidden
            if (document.hidden && typeof window.__planetAHostTick === "function") {
                try { window.__planetAHostTick("bg"); } catch { }
            }
            timer = setTimeout(loop, 500); // ~2Hz; keep it light
        };

        const onVis = () => {
            // when tab becomes visible, do one immediate pass to avoid any backlog
            if (!document.hidden && typeof window.__planetAHostTick === "function") {
                try { window.__planetAHostTick("vis"); } catch { }
            }
        };

        loop();
        document.addEventListener("visibilitychange", onVis);

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVis);
            delete window.__planetAHostBGActive;
        };
    }, []);

    return null;
}
