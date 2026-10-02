// What the app page can ask the desktop shell for. Nothing else from Electron is reachable from the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
    linkSteam: () => ipcRenderer.invoke('link-steam'),
    onLinkProgress: fn => ipcRenderer.on('link-progress', (e, p) => fn(p)),
    show: () => ipcRenderer.send('show-window'),
    // In-game overlay (HUD + crosshair)
    getOverlay: () => ipcRenderer.invoke('overlay-get'),
    setOverlay: settings => ipcRenderer.invoke('overlay-set', settings),
    onOverlay: fn => ipcRenderer.on('overlay-settings', (e, s) => fn(s)),
    displays: () => ipcRenderer.invoke('overlay-displays'),
    onAppOverlay: fn => ipcRenderer.on('app-overlay', (e, on) => fn(on)),
    hotkeys: () => ipcRenderer.invoke('hotkeys')
});
