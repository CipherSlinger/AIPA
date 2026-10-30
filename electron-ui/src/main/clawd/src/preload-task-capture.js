/**
 * preload-task-capture — the bridge between the capture page and the main-side
 * task store.
 *
 * One line in, one task out. The page cannot name a directory, a status or a
 * task id: it says "save this text" and main decides what a task is.
 */
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const handler = (_event, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("taskCaptureAPI", {
  onShow: (cb) => subscribe("task-capture-show", cb),
  onError: (cb) => subscribe("task-capture-error", cb),
  onFocus: (cb) => subscribe("task-capture-focus", cb),
  ready: () => ipcRenderer.send("task-capture-ready"),
  save: (title) => ipcRenderer.send("task-capture-save", String(title || "")),
  close: () => ipcRenderer.send("task-capture-close"),
});
