const { contextBridge, ipcRenderer } = require("electron");

// The notice centre owns no state. It asks for the payload, sends one action,
// reports its measured height so the window can size itself, and subscribes to
// refreshes pushed while it is open. Window position, focus, destruction and
// the store all stay in clawd-notice-center.ts.
contextBridge.exposeInMainWorld("noticeCenterAPI", {
  load: () => ipcRenderer.invoke("notice-center:load"),
  action: (action) => ipcRenderer.invoke("notice-center:action", action),
  copy: (id) => ipcRenderer.invoke("notice-center:copy", id),
  onUpdate: (cb) => ipcRenderer.on("notice-center:update", (_event, payload) => cb(payload)),
  // `options.markRead === false` is the click-away margin: it closes the panel
  // without claiming the user read the list.
  close: (options) => ipcRenderer.send("notice-center:close", options),
  reportHeight: (height) => ipcRenderer.send("notice-center:report-height", height),
});
