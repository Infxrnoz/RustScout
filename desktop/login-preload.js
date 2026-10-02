// Runs in the Rust+ login window. The login page finishes by calling window.ReactNativeWebView.postMessage
// (meant for the Rust+ phone app) with the auth token; this passes that message to the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ReactNativeWebView', {
    postMessage: message => ipcRenderer.send('rustplus-token', String(message))
});
