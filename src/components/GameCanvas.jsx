import React from "react";

export default function GameCanvas({ dead }) {
    const rootRef = React.useRef(null);

    React.useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        // mount your renderer/scene here
        // e.g., const engine = init(el);

        return () => {
            // dispose renderer/scene here
            // engine?.dispose?.();
        };
    }, []); // ← must be an array

    // No early return before hooks; after hooks is fine:
    // if (!shouldShow) return null;

    return <div ref={rootRef} style={{ width: "100%", height: "100%" }} />;
}
