import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import { GameStateProvider } from "./game/GameStateProvider";
import MapEditorPage from "./pages/MapEditorPage.jsx"; // create this file below

ReactDOM.createRoot(document.getElementById("root")).render(
    <BrowserRouter>
        <Routes>
            {/* Game route (with your provider) */}
            <Route
                path="/"
                element={
                    <GameStateProvider>
                        <App />
                    </GameStateProvider>
                }
            />

            {/* Editor route (standalone, no game provider) */}
            <Route path="/editor" element={<MapEditorPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </BrowserRouter>
);
