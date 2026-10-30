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
  // `dueOn` is a bare local day ("YYYY-MM-DD") or null. Main refuses any other
  // shape, so the page can only ever name a day it has already resolved.
  // `repeat` is sent only when a cadence is set: on create an absent argument
  // means a one-off, and main refuses any cadence it does not know.
  save: (title, dueOn, repeat) =>
    ipcRenderer.send(
      "task-capture-save",
      String(title || ""),
      dueOn == null ? null : String(dueOn),
      ...(repeat == null ? [] : [String(repeat)])
    ),
  close: () => ipcRenderer.send("task-capture-close"),
  // The page measures its remembered-titles strip; main owns the ceiling and
  // the work-area clamp, so this is only "I need this many more pixels".
  resize: (extra) =>
    ipcRenderer.send("task-capture-resize", { extra: Number(extra) || 0 }),
});
