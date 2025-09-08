import React from "react";

export function Centered({ children }) {
    return (
        <div
            style={{
                display: "grid",
                placeItems: "center",
                height: "100dvh",
                fontFamily: "sans-serif",
            }}
        >
            {children}
        </div>
    );
}
