import { EventEmitter } from 'events';
if (EventEmitter?.defaultMaxListeners != null) {
    EventEmitter.defaultMaxListeners = 50; // dev-only convenience
}
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    // <React.StrictMode>
    <App />
    // </React.StrictMode>
);