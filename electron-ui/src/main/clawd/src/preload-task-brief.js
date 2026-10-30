const { contextBridge, ipcRenderer } = require("electron");

// The brief owns no state. It asks for the payload, sends one action, reports
// its measured height so the window can size itself, and subscribes to
// refreshes pushed while it is open. Window position, focus, destruction and
// the task store all stay in clawd-task-brief.ts.
function subscribe(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("taskBriefAPI", {
  load: () => ipcRenderer.invoke("task-brief:load"),
  action: (action) => ipcRenderer.invoke("task-brief:action", action),
  onUpdate: (cb) => subscribe("task-brief:update", cb),
  close: () => ipcRenderer.send("task-brief:close"),
  reportHeight: (height) => ipcRenderer.send("task-brief:report-height", height),
});
