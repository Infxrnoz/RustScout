const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ReactNativeWebView', {
    postMessage: message => ipcRenderer.send('rustplus-token', String(message))
});
