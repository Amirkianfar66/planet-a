// electron/main.mjs
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

app.commandLine.appendSwitch('force_high_performance_gpu'); // optional
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env.VITE_DEV_SERVER_URL;

function createWindow() {
    const win = new BrowserWindow({
        width: 1280, height: 800, backgroundColor: '#0b1220', autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
        },
    });
    if (isDev) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    const ok = app.requestSingleInstanceLock();
    if (!ok) { app.quit(); return; }
    app.on('second-instance', () => {
        const [w] = BrowserWindow.getAllWindows(); if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
    });
    createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
