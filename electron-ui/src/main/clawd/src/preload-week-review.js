const { contextBridge, ipcRenderer } = require("electron");

// The week review owns no state. It asks for the payload, sends one action,
// reports its measured height so the window can size itself, and closes. The
// window position, focus and destruction all stay in clawd-week-review.ts.
contextBridge.exposeInMainWorld("weekReviewAPI", {
  // `offset` is optional: no argument (or undefined) asks for the week that
  // just ended, 0; negative values walk back one whole week each.
  load: (offset) => ipcRenderer.invoke("week-review:load", offset),
  action: (action) => ipcRenderer.invoke("week-review:action", action),
  close: () => ipcRenderer.send("week-review:close"),
  reportHeight: (height) => ipcRenderer.send("week-review:report-height", height),
});
