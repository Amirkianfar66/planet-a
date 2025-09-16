// electron/preload.mjs
import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('native', {}); // secure by default
