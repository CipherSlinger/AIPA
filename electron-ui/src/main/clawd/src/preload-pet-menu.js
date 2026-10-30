const { contextBridge, ipcRenderer } = require("electron");

// The radial menu owns no state: it renders the payload it is handed, reports
// that it painted (so the window is not shown empty), and sends one action id
// back. Everything else — positioning, focus, fallback — stays in pet-menu.js.
contextBridge.exposeInMainWorld("petMenuAPI", {
  onShow: (cb) => ipcRenderer.on("pet-menu-show", (_, payload) => cb(payload)),
  // A fresh CPU/memory reading for a menu that stays open. Separate from
  // `pet-menu-show` on purpose: rebuilding the whole ring every few seconds
  // would reset the layer the user is on.
  onTelemetry: (cb) => ipcRenderer.on("pet-menu-telemetry", (_, data) => cb(data)),
  // The RECENT ring asks for the conversation list only when it is opened;
  // building it into every payload would put a session-store walk in the way
  // of the menu appearing.
  requestSessions: () => ipcRenderer.send("pet-menu-sessions"),
  onSessions: (cb) => ipcRenderer.on("pet-menu-sessions", (_, list) => cb(list)),
  ready: () => ipcRenderer.send("pet-menu-ready"),
  choose: (actionId) => ipcRenderer.send("pet-menu-action", actionId),
  close: () => ipcRenderer.send("pet-menu-close"),
});
