// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig(({ mode }) => ({
    base: mode === 'electron' ? './' : '/', // crucial for file:// packaging
    plugins: [
        react(),
        electron({
            main: { entry: 'electron/main.mjs' },
            preload: { input: { preload: 'electron/preload.mjs' } },
        }),
    ],
    build: { target: 'es2020', sourcemap: false },
}));
