const { contextBridge, ipcRenderer } = require("electron");

// The radial menu owns no state: it renders the payload it is handed, reports
// that it painted (so the window is not shown empty), and sends one action id
// back. Everything else — positioning, focus, fallback — stays in pet-menu.js.
contextBridge.exposeInMainWorld("petMenuAPI", {
  onShow: (cb) => ipcRenderer.on("pet-menu-show", (_, payload) => cb(payload)),
  ready: () => ipcRenderer.send("pet-menu-ready"),
  choose: (actionId) => ipcRenderer.send("pet-menu-action", actionId),
  close: () => ipcRenderer.send("pet-menu-close"),
});
