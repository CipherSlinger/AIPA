const { contextBridge, ipcRenderer } = require("electron");

// The week review owns no state. It asks for the payload, sends one action,
// reports its measured height so the window can size itself, and closes. The
// window position, focus and destruction all stay in clawd-week-review.ts.
contextBridge.exposeInMainWorld("weekReviewAPI", {
  load: () => ipcRenderer.invoke("week-review:load"),
  action: (action) => ipcRenderer.invoke("week-review:action", action),
  close: () => ipcRenderer.send("week-review:close"),
  reportHeight: (height) => ipcRenderer.send("week-review:report-height", height),
});
