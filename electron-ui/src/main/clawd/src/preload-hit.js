const { contextBridge, ipcRenderer } = require("electron");

// Parse hit-renderer theme config from additionalArguments (synchronous, available on first load)
const hitThemeArg = process.argv.find(a => a.startsWith("--hit-theme-config="));
const hitThemeConfig = hitThemeArg ? JSON.parse(hitThemeArg.slice("--hit-theme-config=".length)) : null;

contextBridge.exposeInMainWorld("hitThemeConfig", hitThemeConfig);

contextBridge.exposeInMainWorld("hitAPI", {
  // Theme config push (for hot-switch; additionalArguments won't update on reload)
  onThemeConfig: (cb) => ipcRenderer.on("theme-config", (_, cfg) => cb(cfg)),
  // Sends → main
  dragLock: (locked) => ipcRenderer.send("drag-lock", locked),
  moveWindowBy: (dx, dy) => ipcRenderer.send("move-window-by", dx, dy),
  dragEnd: () => ipcRenderer.send("drag-end"),
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  focusTerminal: () => ipcRenderer.send("focus-terminal"),
  exitMiniMode: () => ipcRenderer.send("exit-mini-mode"),
  showSessionMenu: () => ipcRenderer.send("show-session-menu"),
  openAttention: () => ipcRenderer.send("attention-open"),
  openTaskBrief: () => ipcRenderer.send("pet-badge-open-brief"),
  // Reaction triggers → main → renderWin
  startDragReaction: () => ipcRenderer.send("start-drag-reaction"),
  endDragReaction: () => ipcRenderer.send("end-drag-reaction"),
  playClickReaction: (svg, duration) => ipcRenderer.send("play-click-reaction", svg, duration),
  // State sync ← main
  onStateSync: (cb) => ipcRenderer.on("hit-state-sync", (_, data) => cb(data)),
  // Needs-you badge: count pushed by AIPA, 0 hides it. Separate from the state
  // sync so a task change does not repaint the pointer state.
  onBadgeSync: (cb) => ipcRenderer.on("pet-badge-sync", (_, data) => cb(data)),
  onCancelReaction: (cb) => ipcRenderer.on("hit-cancel-reaction", () => cb()),
});
