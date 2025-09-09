import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
// in main.jsx (or inside App's root component)
import { GameStateProvider } from "./game/GameStateProvider";

ReactDOM.createRoot(document.getElementById("root")).render(
    <GameStateProvider>
        <App />
    </GameStateProvider>
);
