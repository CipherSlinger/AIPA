/**
 * preload-quick-command — the narrow bridge between the quick command page and
 * the main-process module that owns its window.
 *
 * One payload in, one prompt out. Nothing here can name a window, a path or a
 * session: the bar only says "this text" and the main process decides what a
 * turn is and where its answer goes.
 */
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const handler = (_event, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("quickCommandAPI", {
  onShow: (cb) => subscribe("quick-command-show", cb),
  onPending: (cb) => subscribe("quick-command-pending", cb),
  onError: (cb) => subscribe("quick-command-error", cb),
  onFocus: (cb) => subscribe("quick-command-focus", cb),
  ready: () => ipcRenderer.send("quick-command-ready"),
  submit: (text) => ipcRenderer.send("quick-command-submit", String(text || "")),
  close: () => ipcRenderer.send("quick-command-close"),
});
