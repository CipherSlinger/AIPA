/**
 * clawd-factory.js — Embeddable Clawd desktop pet for AIPA.
 *
 * Wraps clawd-on-desk's standalone main.js into a factory function that
 * AIPA's main process can call to initialize the pet within its own
 * Electron lifecycle.
 *
 * Usage from AIPA:
 *   const createClawd = require('./clawd/src/clawd-factory')
 *   const clawd = createClawd({ mainWindow, isQuitting })
 *   clawd.notifyState('thinking', sessionId)
 */

const { app, BrowserWindow, screen, Menu, ipcMain, globalShortcut, nativeTheme, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { applyStationaryCollectionBehavior } = require("./mac-window");
const hitGeometry = require("./hit-geometry");
const animationCycle = require("./animation-cycle");
const { findNearestWorkArea, computeLooseClamp, SYNTHETIC_WORK_AREA } = require("./work-area");
const { getLaunchSizingWorkArea, getProportionalPixelSize } = require("./size-utils");

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWin = process.platform === "win32";
const LINUX_WINDOW_TYPE = "toolbar";


// ── Windows: AllowSetForegroundWindow via FFI ──
let _allowSetForeground = null;
if (isWin) {
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    _allowSetForeground = user32.func("bool __stdcall AllowSetForegroundWindow(int dwProcessId)");
  } catch (err) {
    console.warn("Clawd: koffi/AllowSetForegroundWindow not available:", err.message);
  }
}


// ── Window size presets ──
const SIZES = {
  S: { width: 200, height: 200 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 360 },
};

// ── Settings (prefs.js + settings-controller.js) ──
const prefsModule = require("./prefs");
const { createSettingsController } = require("./settings-controller");
const loginItemHelpers = require("./login-item");

// In embedded mode, use AIPA's userData path for clawd prefs
const PREFS_PATH = path.join(app.getPath("userData"), "clawd-prefs.json");
const _initialPrefsLoad = prefsModule.load(PREFS_PATH);

function _installAutoStartHook() {
  const { registerHooks } = require("../hooks/install.js");
  registerHooks({ silent: true, autoStart: true, port: getHookServerPort() });
}
function _uninstallAutoStartHook() {
  const { unregisterAutoStart } = require("../hooks/install.js");
  unregisterAutoStart();
}
function _uninstallClaudeHooksNow() {
  const { unregisterHooks } = require("../hooks/install.js");
  unregisterHooks();
}

function _writeSystemOpenAtLogin(enabled) {
  if (isLinux) {
    const launchScript = path.join(__dirname, "..", "launch.js");
    const execCmd = app.isPackaged
      ? `"${process.env.APPIMAGE || app.getPath("exe")}"`
      : `node "${launchScript}"`;
    loginItemHelpers.linuxSetOpenAtLogin(enabled, { execCmd });
    return;
  }
  app.setLoginItemSettings(
    loginItemHelpers.getLoginItemSettings({
      isPackaged: app.isPackaged,
      openAtLogin: enabled,
      execPath: process.execPath,
      appPath: app.getAppPath(),
    })
  );
}
function _readSystemOpenAtLogin() {
  if (isLinux) return loginItemHelpers.linuxGetOpenAtLogin();
  return app.getLoginItemSettings(
    app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] }
  ).openAtLogin;
}

function _deferredStartMonitorForAgent(id) {
  return startMonitorForAgent(id);
}
function _deferredStopMonitorForAgent(id) {
  return stopMonitorForAgent(id);
}
function _deferredClearSessionsByAgent(id) {
  return _state && typeof _state.clearSessionsByAgent === "function"
    ? _state.clearSessionsByAgent(id)
    : 0;
}
function _deferredDismissPermissionsByAgent(id) {
  return _perm && typeof _perm.dismissPermissionsByAgent === "function"
    ? _perm.dismissPermissionsByAgent(id)
    : 0;
}

const _settingsController = createSettingsController({
  prefsPath: PREFS_PATH,
  loadResult: _initialPrefsLoad,
  injectedDeps: {
    installAutoStart: _installAutoStartHook,
    uninstallAutoStart: _uninstallAutoStartHook,
    syncClaudeHooksNow: () => _server.syncClawdHooks(),
    uninstallClaudeHooksNow: _uninstallClaudeHooksNow,
    startClaudeSettingsWatcher: () => _server.startClaudeSettingsWatcher(),
    stopClaudeSettingsWatcher: () => _server.stopClaudeSettingsWatcher(),
    setOpenAtLogin: _writeSystemOpenAtLogin,
    startMonitorForAgent: _deferredStartMonitorForAgent,
    stopMonitorForAgent: _deferredStopMonitorForAgent,
    clearSessionsByAgent: _deferredClearSessionsByAgent,
    dismissPermissionsByAgent: _deferredDismissPermissionsByAgent,
    activateTheme: (id, variantId, overrideMap) => _deferredActivateTheme(id, variantId, overrideMap),
    getThemeInfo: (id) => _deferredGetThemeInfo(id),
    removeThemeDir: (id) => _deferredRemoveThemeDir(id),
  },
});

let lang = _settingsController.get("lang");

function hydrateSystemBackedSettings() {
  if (_settingsController.get("openAtLoginHydrated")) return;
  let systemValue = false;
  try {
    systemValue = !!_readSystemOpenAtLogin();
  } catch (err) {
    console.warn("Clawd: failed to read system openAtLogin during hydration:", err && err.message);
  }
  const result = _settingsController.hydrate({
    openAtLogin: systemValue,
    openAtLoginHydrated: true,
  });
  if (result && result.status === "error") {
    console.warn("Clawd: openAtLogin hydration failed:", result.message);
  }
}

function flushRuntimeStateToPrefs() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  _settingsController.applyBulk({
    x: bounds.x,
    y: bounds.y,
    positionSaved: true,
    size: currentSize,
    miniMode: _mini.getMiniMode(),
    miniEdge: _mini.getMiniEdge(),
    preMiniX: _mini.getPreMiniX(),
    preMiniY: _mini.getPreMiniY(),
  });
}

let _codexMonitor = null;
let _geminiMonitor = null;

function startMonitorForAgent(agentId) {
  if (agentId === "codex" && _codexMonitor) _codexMonitor.start();
  else if (agentId === "gemini-cli" && _geminiMonitor) _geminiMonitor.start();
}
function stopMonitorForAgent(agentId) {
  if (agentId === "codex" && _codexMonitor) _codexMonitor.stop();
  else if (agentId === "gemini-cli" && _geminiMonitor) _geminiMonitor.stop();
}

// ── Theme loader ──
const themeLoader = require("./theme-loader");
themeLoader.init(__dirname, app.getPath("userData"));

const _requestedThemeId = _settingsController.get("theme") || "clawd";
const _initialVariantMap = _settingsController.get("themeVariant") || {};
const _requestedVariantId = _initialVariantMap[_requestedThemeId] || "default";
const _initialThemeOverrides = _settingsController.get("themeOverrides") || {};
const _requestedThemeOverrides = _initialThemeOverrides[_requestedThemeId] || null;
let activeTheme = themeLoader.loadTheme(_requestedThemeId, {
  variant: _requestedVariantId,
  overrides: _requestedThemeOverrides,
});
activeTheme._overrideSignature = JSON.stringify(_requestedThemeOverrides || {});
if (activeTheme._id !== _requestedThemeId || activeTheme._variantId !== _requestedVariantId) {
  const nextVariantMap = { ...(_settingsController.get("themeVariant") || {}) };
  nextVariantMap[activeTheme._id] = activeTheme._variantId;
  if (activeTheme._id !== _requestedThemeId) {
    delete nextVariantMap[_requestedThemeId];
  }
  const result = _settingsController.hydrate({
    theme: activeTheme._id,
    themeVariant: nextVariantMap,
  });
  if (result && result.status === "error") {
    console.warn("Clawd: theme hydrate after fallback failed:", result.message);
  }
}

function getObjRect(bounds) {
  const state = _state.getCurrentState();
  const file = _state.getCurrentSvg() || (activeTheme && activeTheme.states && activeTheme.states.idle[0]);
  return hitGeometry.getAssetRectScreen(activeTheme, bounds, state, file)
    || { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
}

let win;
let hitWin;
let tray = null;
let contextMenuOwner = null;
let currentSize = _settingsController.get("size");

const PROPORTIONAL_RATIOS = [8, 10, 12, 15];

function isProportionalMode(size) {
  return typeof (size || currentSize) === "string" && (size || currentSize).startsWith("P:");
}

function getProportionalRatio(size) {
  return parseFloat((size || currentSize).slice(2)) || 10;
}

function getCurrentPixelSize(overrideWa) {
  if (!isProportionalMode()) return SIZES[currentSize] || SIZES.S;
  const ratio = getProportionalRatio();
  let wa = overrideWa;
  if (!wa && win && !win.isDestroyed()) {
    const { x, y, width, height } = win.getBounds();
    wa = getNearestWorkArea(x + width / 2, y + height / 2);
  }
  if (!wa) wa = getPrimaryWorkAreaSafe() || SYNTHETIC_WORK_AREA;
  return getProportionalPixelSize(ratio, wa);
}
let contextMenu;
let doNotDisturb = false;
let isQuitting = false;
let showTray = _settingsController.get("showTray");
let showDock = _settingsController.get("showDock");
let manageClaudeHooksAutomatically = _settingsController.get("manageClaudeHooksAutomatically");
let autoStartWithClaude = _settingsController.get("autoStartWithClaude");
let openAtLogin = _settingsController.get("openAtLogin");
let bubbleFollowPet = _settingsController.get("bubbleFollowPet");
let hideBubbles = _settingsController.get("hideBubbles");
let showSessionId = _settingsController.get("showSessionId");
let soundMuted = _settingsController.get("soundMuted");
let petHidden = false;
const DEFAULT_TOGGLE_SHORTCUT = "CommandOrControl+Shift+Alt+C";

function togglePetVisibility() {
  if (!win || win.isDestroyed()) return;
  if (_mini.getMiniTransitioning()) return;
  if (petHidden) {
    win.showInactive();
    if (isLinux) win.setSkipTaskbar(true);
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.showInactive();
      if (isLinux) hitWin.setSkipTaskbar(true);
    }
    for (const perm of pendingPermissions) {
      if (perm.bubble && !perm.bubble.isDestroyed()) {
        perm.bubble.showInactive();
        if (isLinux) perm.bubble.setSkipTaskbar(true);
      }
    }
    syncUpdateBubbleVisibility();
    reapplyMacVisibility();
    petHidden = false;
  } else {
    win.hide();
    if (hitWin && !hitWin.isDestroyed()) hitWin.hide();
    for (const perm of pendingPermissions) {
      if (perm.bubble && !perm.bubble.isDestroyed()) perm.bubble.hide();
    }
    hideUpdateBubble();
    petHidden = true;
  }
  syncPermissionShortcuts();
  buildTrayMenu();
  buildContextMenu();
}

function registerToggleShortcut() {
  try {
    globalShortcut.register(DEFAULT_TOGGLE_SHORTCUT, togglePetVisibility);
  } catch (err) {
    console.warn("Clawd: failed to register global shortcut:", err.message);
  }
}

function unregisterToggleShortcut() {
  try {
    globalShortcut.unregister(DEFAULT_TOGGLE_SHORTCUT);
  } catch {}
}

function sendToRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}
function sendToHitWin(channel, ...args) {
  if (hitWin && !hitWin.isDestroyed()) hitWin.webContents.send(channel, ...args);
}

function syncHitStateAfterLoad() {
  sendToHitWin("hit-state-sync", {
    currentSvg: _state.getCurrentSvg(),
    currentState: _state.getCurrentState(),
    miniMode: _mini.getMiniMode(),
    dndEnabled: doNotDisturb,
  });
}

function syncRendererStateAfterLoad({ includeStartupRecovery = true } = {}) {
  if (_mini.getMiniMode()) {
    sendToRenderer("mini-mode-change", true, _mini.getMiniEdge());
  }
  if (doNotDisturb) {
    sendToRenderer("dnd-change", true);
    if (_mini.getMiniMode()) {
      applyState("mini-sleep");
    } else {
      applyState("sleeping");
    }
    return;
  }
  if (_mini.getMiniMode()) {
    applyState("mini-idle");
    return;
  }

  if (!includeStartupRecovery) {
    const prev = _state.getCurrentState();
    applyState(prev, getSvgOverride(prev));
    return;
  }

  if (sessions.size > 0) {
    const resolved = resolveDisplayState();
    applyState(resolved, getSvgOverride(resolved));
    return;
  }

  applyState("idle", getSvgOverride("idle"));

  setTimeout(() => {
    if (sessions.size > 0 || doNotDisturb) return;
    detectRunningAgentProcesses((found) => {
      if (found && sessions.size === 0 && !doNotDisturb) {
        _startStartupRecovery();
        resetIdleTimer();
      }
    });
  }, 5000);
}

// ── Sound playback ──
let lastSoundTime = 0;
const SOUND_COOLDOWN_MS = 10000;

function playSound(name) {
  if (soundMuted || doNotDisturb) return;
  const now = Date.now();
  if (now - lastSoundTime < SOUND_COOLDOWN_MS) return;
  const url = themeLoader.getSoundUrl(name);
  if (!url) return;
  lastSoundTime = now;
  sendToRenderer("play-sound", url);
}

function resetSoundCooldown() {
  lastSoundTime = 0;
}

let _lastHitW = 0, _lastHitH = 0;
function syncHitWin() {
  if (!hitWin || hitWin.isDestroyed() || !win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const hit = getHitRectScreen(bounds);
  const x = Math.round(hit.left);
  const y = Math.round(hit.top);
  const w = Math.round(hit.right - hit.left);
  const h = Math.round(hit.bottom - hit.top);
  if (w <= 0 || h <= 0) return;
  hitWin.setBounds({ x, y, width: w, height: h });
  if (w !== _lastHitW || h !== _lastHitH) {
    _lastHitW = w; _lastHitH = h;
    hitWin.setShape([{ x: 0, y: 0, width: w, height: h }]);
  }
}

let mouseOverPet = false;
let dragLocked = false;
let menuOpen = false;
let idlePaused = false;
let forceEyeResend = false;
let themeReloadInProgress = false;

// ── Permission bubble ──
const { isAgentEnabled: _isAgentEnabled, isAgentPermissionsEnabled: _isAgentPermissionsEnabled } = require("./agent-gate");
const _permCtx = {
  get win() { return win; },
  get lang() { return lang; },
  get sessions() { return sessions; },
  get bubbleFollowPet() { return bubbleFollowPet; },
  get permDebugLog() { return permDebugLog; },
  get doNotDisturb() { return doNotDisturb; },
  get hideBubbles() { return hideBubbles; },
  get petHidden() { return petHidden; },
  getNearestWorkArea,
  getHitRectScreen,
  guardAlwaysOnTop,
  reapplyMacVisibility,
  isAgentPermissionsEnabled: (agentId) =>
    _isAgentPermissionsEnabled({ agents: _settingsController.get("agents") }, agentId),
  focusTerminalForSession: (sessionId) => {
    const s = sessions.get(sessionId);
    if (s && s.sourcePid) focusTerminalWindow(s.sourcePid, s.cwd, s.editor, s.pidChain);
  },
};
const _perm = require("./permission")(_permCtx);
const { showPermissionBubble, resolvePermissionEntry, sendPermissionResponse, repositionBubbles, permLog, PASSTHROUGH_TOOLS, showCodexNotifyBubble, clearCodexNotifyBubbles, syncPermissionShortcuts, replyOpencodePermission } = _perm;
const pendingPermissions = _perm.pendingPermissions;
let permDebugLog = null;
let updateDebugLog = null;
let sessionDebugLog = null;

const _updateBubbleCtx = {
  get win() { return win; },
  get bubbleFollowPet() { return bubbleFollowPet; },
  get petHidden() { return petHidden; },
  getPendingPermissions: () => pendingPermissions,
  getNearestWorkArea,
  getHitRectScreen,
  guardAlwaysOnTop,
  reapplyMacVisibility,
};
const _updateBubble = require("./update-bubble")(_updateBubbleCtx);
const {
  showUpdateBubble,
  hideUpdateBubble,
  repositionUpdateBubble,
  handleUpdateBubbleAction,
  handleUpdateBubbleHeight,
  syncVisibility: syncUpdateBubbleVisibility,
} = _updateBubble;

function repositionFloatingBubbles() {
  if (pendingPermissions.length) repositionBubbles();
  repositionUpdateBubble();
}

function reapplyMacVisibility() {
  if (!isMac) return;
  const apply = (w) => {
    if (w && !w.isDestroyed()) {
      const deferUntil = Number(w.__clawdMacDeferredVisibilityUntil) || 0;
      if (deferUntil > Date.now()) return;
      if (deferUntil) delete w.__clawdMacDeferredVisibilityUntil;
      w.setAlwaysOnTop(true, MAC_TOPMOST_LEVEL);
      if (!applyStationaryCollectionBehavior(w)) {
        const opts = { visibleOnFullScreen: true };
        if (!showDock) opts.skipTransformProcessType = true;
        w.setVisibleOnAllWorkspaces(true, opts);
        applyStationaryCollectionBehavior(w);
      }
    }
  };
  apply(win);
  apply(hitWin);
  for (const perm of pendingPermissions) apply(perm.bubble);
  apply(_updateBubble.getBubbleWindow());
  apply(contextMenuOwner);
}

// ── State machine ──
const _stateCtx = {
  get theme() { return activeTheme; },
  get win() { return win; },
  get hitWin() { return hitWin; },
  get doNotDisturb() { return doNotDisturb; },
  set doNotDisturb(v) { doNotDisturb = v; },
  get miniMode() { return _mini.getMiniMode(); },
  get miniTransitioning() { return _mini.getMiniTransitioning(); },
  get mouseOverPet() { return mouseOverPet; },
  get miniSleepPeeked() { return _mini.getMiniSleepPeeked(); },
  set miniSleepPeeked(v) { _mini.setMiniSleepPeeked(v); },
  get miniPeeked() { return _mini.getMiniPeeked(); },
  set miniPeeked(v) { _mini.setMiniPeeked(v); },
  get idlePaused() { return idlePaused; },
  set idlePaused(v) { idlePaused = v; },
  get forceEyeResend() { return forceEyeResend; },
  set forceEyeResend(v) { forceEyeResend = v; },
  get mouseStillSince() { return _tick ? _tick._mouseStillSince : Date.now(); },
  get pendingPermissions() { return pendingPermissions; },
  get showSessionId() { return showSessionId; },
  sendToRenderer,
  sendToHitWin,
  syncHitWin,
  playSound,
  t: (key) => t(key),
  focusTerminalWindow: (...args) => focusTerminalWindow(...args),
  resolvePermissionEntry: (...args) => resolvePermissionEntry(...args),
  miniPeekIn: () => miniPeekIn(),
  miniPeekOut: () => miniPeekOut(),
  buildContextMenu: () => buildContextMenu(),
  buildTrayMenu: () => buildTrayMenu(),
  debugLog: (msg) => sessionLog(msg),
  isOneshotDisabled: (stateKey) => {
    const themeId = activeTheme && activeTheme._id;
    if (!themeId || !stateKey) return false;
    const overrides = _settingsController.get("themeOverrides");
    const themeMap = overrides && overrides[themeId];
    const stateMap = themeMap && themeMap.states;
    const entry = (stateMap && stateMap[stateKey]) || (themeMap && themeMap[stateKey]);
    return !!(entry && entry.disabled === true);
  },
  hasAnyEnabledAgent: () => {
    const agents = _settingsController.get("agents");
    if (!agents || typeof agents !== "object") return true;
    const probe = { agents };
    for (const id of Object.keys(agents)) {
      if (_isAgentEnabled(probe, id)) return true;
    }
    return false;
  },
};
const _state = require("./state")(_stateCtx);
const { setState, applyState, updateSession, resolveDisplayState, getSvgOverride,
        enableDoNotDisturb, disableDoNotDisturb, startStaleCleanup, stopStaleCleanup,
        startWakePoll, stopWakePoll, detectRunningAgentProcesses, buildSessionSubmenu,
        startStartupRecovery: _startStartupRecovery } = _state;
const sessions = _state.sessions;
const STATE_PRIORITY = _state.STATE_PRIORITY;

function getHitRectScreen(bounds) {
  const state = _state.getCurrentState();
  const file = _state.getCurrentSvg() || (activeTheme && activeTheme.states && activeTheme.states.idle[0]);
  const hit = hitGeometry.getHitRectScreen(
    activeTheme,
    bounds,
    state,
    file,
    _state.getCurrentHitBox(),
    {
      padX: _mini.getMiniMode() ? _mini.PEEK_OFFSET : 0,
      padY: _mini.getMiniMode() ? 8 : 0,
    }
  );
  return hit || { left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height };
}

// ── Main tick ──
const _tickCtx = {
  get theme() { return activeTheme; },
  get win() { return win; },
  get currentState() { return _state.getCurrentState(); },
  get currentSvg() { return _state.getCurrentSvg(); },
  get miniMode() { return _mini.getMiniMode(); },
  get miniTransitioning() { return _mini.getMiniTransitioning(); },
  get dragLocked() { return dragLocked; },
  get menuOpen() { return menuOpen; },
  get idlePaused() { return idlePaused; },
  get isAnimating() { return _mini.getIsAnimating(); },
  get miniSleepPeeked() { return _mini.getMiniSleepPeeked(); },
  set miniSleepPeeked(v) { _mini.setMiniSleepPeeked(v); },
  get miniPeeked() { return _mini.getMiniPeeked(); },
  set miniPeeked(v) { _mini.setMiniPeeked(v); },
  get mouseOverPet() { return mouseOverPet; },
  set mouseOverPet(v) { mouseOverPet = v; },
  get forceEyeResend() { return forceEyeResend; },
  set forceEyeResend(v) { forceEyeResend = v; },
  get startupRecoveryActive() { return _state.getStartupRecoveryActive(); },
  sendToRenderer,
  sendToHitWin,
  setState,
  applyState,
  miniPeekIn: () => miniPeekIn(),
  miniPeekOut: () => miniPeekOut(),
  getObjRect,
  getHitRectScreen,
};
const _tick = require("./tick")(_tickCtx);
const { startMainTick, resetIdleTimer } = _tick;

// ── Terminal focus ──
const _focus = require("./focus")({ _allowSetForeground });
const { initFocusHelper, killFocusHelper, focusTerminalWindow, clearMacFocusCooldownTimer } = _focus;

// ── HTTP server ──
const _serverCtx = {
  get manageClaudeHooksAutomatically() { return manageClaudeHooksAutomatically; },
  get autoStartWithClaude() { return autoStartWithClaude; },
  get doNotDisturb() { return doNotDisturb; },
  get hideBubbles() { return hideBubbles; },
  get pendingPermissions() { return pendingPermissions; },
  get PASSTHROUGH_TOOLS() { return PASSTHROUGH_TOOLS; },
  get STATE_SVGS() { return _state.STATE_SVGS; },
  get sessions() { return sessions; },
  isAgentEnabled: (agentId) => _isAgentEnabled({ agents: _settingsController.get("agents") }, agentId),
  isAgentPermissionsEnabled: (agentId) => _isAgentPermissionsEnabled({ agents: _settingsController.get("agents") }, agentId),
  setState,
  updateSession,
  resolvePermissionEntry,
  sendPermissionResponse,
  showPermissionBubble,
  replyOpencodePermission,
  permLog,
};
const _server = require("./server")(_serverCtx);
const { startHttpServer, getHookServerPort } = _server;

const WIN_TOPMOST_LEVEL = "pop-up-menu";
const MAC_TOPMOST_LEVEL = "screen-saver";
const TOPMOST_WATCHDOG_MS = 5_000;
let topmostWatchdog = null;
let hwndRecoveryTimer = null;

function scheduleHwndRecovery() {
  if (!isWin) return;
  if (hwndRecoveryTimer) clearTimeout(hwndRecoveryTimer);
  hwndRecoveryTimer = setTimeout(() => {
    hwndRecoveryTimer = null;
    if (!win || win.isDestroyed()) return;
    win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    if (hitWin && !hitWin.isDestroyed()) hitWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    forceEyeResend = true;
  }, 1000);
}

function guardAlwaysOnTop(w) {
  if (!isWin) return;
  w.on("always-on-top-changed", (_, isOnTop) => {
    if (!isOnTop && w && !w.isDestroyed()) {
      w.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
      if (w === win && !dragLocked && !_mini.getIsAnimating()) {
        forceEyeResend = true;
        const { x, y } = win.getBounds();
        win.setPosition(x + 1, y);
        win.setPosition(x, y);
        syncHitWin();
        scheduleHwndRecovery();
      }
    }
  });
}

function startTopmostWatchdog() {
  if (!isWin || topmostWatchdog) return;
  topmostWatchdog = setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
    for (const perm of pendingPermissions) {
      if (perm.bubble && !perm.bubble.isDestroyed() && perm.bubble.isVisible()) perm.bubble.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
    const updateBubbleWin = _updateBubble.getBubbleWindow();
    if (updateBubbleWin && !updateBubbleWin.isDestroyed() && updateBubbleWin.isVisible()) {
      updateBubbleWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
  }, TOPMOST_WATCHDOG_MS);
}

function stopTopmostWatchdog() {
  if (topmostWatchdog) { clearInterval(topmostWatchdog); topmostWatchdog = null; }
}

function updateLog(msg) {
  if (!updateDebugLog) return;
  const { rotatedAppend } = require("./log-rotate");
  rotatedAppend(updateDebugLog, `[${new Date().toISOString()}] ${msg}\n`);
}

function sessionLog(msg) {
  if (!sessionDebugLog) return;
  const { rotatedAppend } = require("./log-rotate");
  rotatedAppend(sessionDebugLog, `[${new Date().toISOString()}] ${msg}\n`);
}

// ── Menu ──
const _menuCtx = {
  get win() { return win; },
  get sessions() { return sessions; },
  get currentSize() { return currentSize; },
  set currentSize(v) { _settingsController.applyUpdate("size", v); },
  get doNotDisturb() { return doNotDisturb; },
  get lang() { return lang; },
  set lang(v) { _settingsController.applyUpdate("lang", v); },
  get showTray() { return showTray; },
  set showTray(v) { _settingsController.applyUpdate("showTray", v); },
  get showDock() { return showDock; },
  set showDock(v) { _settingsController.applyUpdate("showDock", v); },
  get manageClaudeHooksAutomatically() { return manageClaudeHooksAutomatically; },
  get autoStartWithClaude() { return autoStartWithClaude; },
  set autoStartWithClaude(v) { _settingsController.applyUpdate("autoStartWithClaude", v); },
  get openAtLogin() { return openAtLogin; },
  set openAtLogin(v) { _settingsController.applyUpdate("openAtLogin", v); },
  get bubbleFollowPet() { return bubbleFollowPet; },
  set bubbleFollowPet(v) { _settingsController.applyUpdate("bubbleFollowPet", v); },
  get hideBubbles() { return hideBubbles; },
  set hideBubbles(v) { _settingsController.applyUpdate("hideBubbles", v); },
  get showSessionId() { return showSessionId; },
  set showSessionId(v) { _settingsController.applyUpdate("showSessionId", v); },
  get soundMuted() { return soundMuted; },
  set soundMuted(v) { _settingsController.applyUpdate("soundMuted", v); },
  get pendingPermissions() { return pendingPermissions; },
  repositionBubbles: () => repositionFloatingBubbles(),
  get petHidden() { return petHidden; },
  togglePetVisibility: () => togglePetVisibility(),
  get isQuitting() { return isQuitting; },
  set isQuitting(v) { isQuitting = v; },
  get menuOpen() { return menuOpen; },
  set menuOpen(v) { menuOpen = v; },
  get tray() { return tray; },
  set tray(v) { tray = v; },
  get contextMenuOwner() { return contextMenuOwner; },
  set contextMenuOwner(v) { contextMenuOwner = v; },
  get contextMenu() { return contextMenu; },
  set contextMenu(v) { contextMenu = v; },
  enableDoNotDisturb: () => enableDoNotDisturb(),
  disableDoNotDisturb: () => disableDoNotDisturb(),
  enterMiniViaMenu: () => enterMiniViaMenu(),
  exitMiniMode: () => exitMiniMode(),
  getMiniMode: () => _mini.getMiniMode(),
  getMiniTransitioning: () => _mini.getMiniTransitioning(),
  miniHandleResize: (sizeKey) => _mini.handleResize(sizeKey),
  focusTerminalWindow: (...args) => focusTerminalWindow(...args),
  checkForUpdates: (...args) => checkForUpdates(...args),
  getUpdateMenuItem: () => getUpdateMenuItem(),
  buildSessionSubmenu: () => buildSessionSubmenu(),
  flushRuntimeStateToPrefs,
  settings: _settingsController,
  syncHitWin,
  getCurrentPixelSize,
  isProportionalMode,
  PROPORTIONAL_RATIOS,
  getHookServerPort: () => getHookServerPort(),
  clampToScreen,
  getNearestWorkArea,
  reapplyMacVisibility,
  discoverThemes: () => themeLoader.discoverThemes(),
  getActiveThemeId: () => activeTheme ? activeTheme._id : "clawd",
  ensureUserThemesDir: () => themeLoader.ensureUserThemesDir(),
  openSettingsWindow: () => openSettingsWindow(),
};
const _menu = require("./menu")(_menuCtx);
const { t, buildContextMenu, buildTrayMenu, rebuildAllMenus, createTray,
        destroyTray, showPetContextMenu, popupMenuAt, ensureContextMenuOwner,
        requestAppQuit, applyDockVisibility } = _menu;

const MENU_AFFECTING_KEYS = new Set([
  "lang", "soundMuted", "bubbleFollowPet", "hideBubbles", "showSessionId",
  "manageClaudeHooksAutomatically", "autoStartWithClaude", "openAtLogin", "showTray", "showDock", "theme", "size",
]);
function wireSettingsSubscribers() {
  _settingsController.subscribe(({ changes }) => {
    if ("lang" in changes) lang = changes.lang;
    if ("size" in changes) currentSize = changes.size;
    if ("showTray" in changes) {
      showTray = changes.showTray;
      try { changes.showTray ? createTray() : destroyTray(); } catch (err) {
        console.warn("Clawd: tray toggle failed:", err && err.message);
      }
    }
    if ("showDock" in changes) {
      showDock = changes.showDock;
      try { applyDockVisibility(); } catch (err) {
        console.warn("Clawd: applyDockVisibility failed:", err && err.message);
      }
    }
    if ("manageClaudeHooksAutomatically" in changes) {
      manageClaudeHooksAutomatically = changes.manageClaudeHooksAutomatically;
    }
    if ("autoStartWithClaude" in changes) {
      autoStartWithClaude = changes.autoStartWithClaude;
    }
    if ("openAtLogin" in changes) {
      openAtLogin = changes.openAtLogin;
    }
    if ("bubbleFollowPet" in changes) bubbleFollowPet = changes.bubbleFollowPet;
    if ("hideBubbles" in changes) hideBubbles = changes.hideBubbles;
    if ("showSessionId" in changes) showSessionId = changes.showSessionId;
    if ("soundMuted" in changes) soundMuted = changes.soundMuted;

    if ("hideBubbles" in changes) {
      try { syncPermissionShortcuts(); } catch (err) {
        console.warn("Clawd: syncPermissionShortcuts failed:", err && err.message);
      }
    }
    if ("bubbleFollowPet" in changes) {
      try { repositionFloatingBubbles(); } catch (err) {
        console.warn("Clawd: repositionFloatingBubbles failed:", err && err.message);
      }
    }

    for (const key of Object.keys(changes)) {
      if (MENU_AFFECTING_KEYS.has(key)) {
        try { rebuildAllMenus(); } catch (err) {
          console.warn("Clawd: rebuildAllMenus failed:", err && err.message);
        }
        break;
      }
    }

    try {
      for (const bw of BrowserWindow.getAllWindows()) {
        if (!bw.isDestroyed() && bw.webContents && !bw.webContents.isDestroyed()) {
          bw.webContents.send("settings-changed", { changes, snapshot: _settingsController.getSnapshot() });
        }
      }
    } catch (err) {
      console.warn("Clawd: settings-changed broadcast failed:", err && err.message);
    }
  });
}
wireSettingsSubscribers();

const ANIMATION_OVERRIDE_ASSET_EXTS = new Set([".svg", ".gif", ".apng", ".png", ".webp"]);
let animationOverridePreviewTimer = null;

function _buildFileUrl(absPath) {
  try { return pathToFileURL(absPath).href; }
  catch { return null; }
}

function _resolveAnimationAssetAbsPath(filename) {
  if (!filename || !activeTheme) return null;
  try {
    const absPath = themeLoader.getAssetPath(filename);
    return absPath && fs.existsSync(absPath) ? absPath : null;
  } catch {
    return null;
  }
}

function _resolveAnimationAssetsDir(theme = activeTheme) {
  if (!theme) return null;
  const themeAssetsDir = theme._themeDir ? path.join(theme._themeDir, "assets") : null;
  if (themeAssetsDir && fs.existsSync(themeAssetsDir)) return themeAssetsDir;
  const idleFile = theme.states && theme.states.idle && theme.states.idle[0];
  if (!idleFile) return null;
  const resolved = themeLoader.getAssetPath(idleFile);
  return resolved ? path.dirname(resolved) : null;
}

function _buildAnimationAssetUrl(filename) {
  const absPath = _resolveAnimationAssetAbsPath(filename);
  return absPath ? _buildFileUrl(absPath) : null;
}

function _buildAnimationAssetProbe(file) {
  const absPath = _resolveAnimationAssetAbsPath(file);
  if (!absPath) {
    return { assetCycleMs: null, assetCycleStatus: "unavailable", assetCycleSource: null };
  }
  const probe = animationCycle.probeAssetCycle(absPath);
  return {
    assetCycleMs: Number.isFinite(probe && probe.ms) && probe.ms > 0 ? probe.ms : null,
    assetCycleStatus: (probe && probe.status) || "unavailable",
    assetCycleSource: (probe && probe.source) || null,
  };
}

function _readCurrentThemeOverrideMap() {
  const themeId = activeTheme && activeTheme._id;
  if (!themeId || !_settingsController || typeof _settingsController.getSnapshot !== "function") return null;
  const snapshot = _settingsController.getSnapshot();
  return snapshot && snapshot.themeOverrides ? snapshot.themeOverrides[themeId] || null : null;
}

function _hasExplicitAutoReturnOverride(themeOverrideMap, stateKey) {
  const autoReturn = themeOverrideMap && themeOverrideMap.timings && themeOverrideMap.timings.autoReturn;
  return !!(autoReturn && Object.prototype.hasOwnProperty.call(autoReturn, stateKey));
}

function _buildTimingHint(file, fallbackMs = null) {
  const assetProbe = _buildAnimationAssetProbe(file);
  const suggestedDurationMs = assetProbe.assetCycleMs != null
    ? assetProbe.assetCycleMs
    : (Number.isFinite(fallbackMs) && fallbackMs > 0 ? fallbackMs : null);
  const suggestedDurationStatus = assetProbe.assetCycleMs != null
    ? assetProbe.assetCycleStatus
    : (suggestedDurationMs != null ? "fallback" : "unavailable");
  return { ...assetProbe, suggestedDurationMs, suggestedDurationStatus, previewDurationMs: suggestedDurationMs };
}

function _listAnimationOverrideAssets(theme = activeTheme) {
  if (!theme) return [];
  const dirs = [];
  const primaryDir = _resolveAnimationAssetsDir(theme);
  const sourceDir = theme._themeDir ? path.join(theme._themeDir, "assets") : null;
  const cacheDir = theme._assetsDir || null;
  for (const dir of [primaryDir, sourceDir, cacheDir]) {
    if (!dir || !fs.existsSync(dir)) continue;
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  const seen = new Set();
  const assets = [];
  for (const dir of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { entries = []; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!ANIMATION_OVERRIDE_ASSET_EXTS.has(ext)) continue;
      if (seen.has(entry.name)) continue;
      const absPath = _resolveAnimationAssetAbsPath(entry.name) || path.join(dir, entry.name);
      const previewUrl = _buildFileUrl(absPath);
      const probe = animationCycle.probeAssetCycle(absPath);
      assets.push({
        name: entry.name, fileUrl: previewUrl, ext,
        cycleMs: Number.isFinite(probe && probe.ms) && probe.ms > 0 ? probe.ms : null,
        cycleStatus: (probe && probe.status) || "unavailable",
        cycleSource: (probe && probe.source) || null,
      });
      seen.add(entry.name);
    }
  }
  assets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return assets;
}

function _readResolvedTransition(file) {
  const entry = activeTheme && activeTheme.transitions && activeTheme.transitions[file];
  return {
    in: entry && Number.isFinite(entry.in) ? entry.in : 150,
    out: entry && Number.isFinite(entry.out) ? entry.out : 150,
  };
}

function _buildTierCardGroup(tierGroup, triggerKind, resolvedTiers, baseTiers, baseHintMap) {
  if (!Array.isArray(resolvedTiers)) return [];
  return resolvedTiers.map((tier, index) => {
    const baseTier = Array.isArray(baseTiers) ? baseTiers[index] : null;
    const originalFile = (baseTier && baseTier.originalFile) || tier.file;
    const higherTier = index === 0 ? null : resolvedTiers[index - 1];
    const maxSessions = higherTier ? Math.max(tier.minSessions, higherTier.minSessions - 1) : null;
    const hintTarget = baseHintMap && baseHintMap[originalFile];
    const timingHint = _buildTimingHint(tier.file);
    return {
      id: `${tierGroup}:${originalFile}`, slotType: "tier", tierGroup, triggerKind,
      originalFile, baseFile: originalFile, minSessions: tier.minSessions, maxSessions,
      currentFile: tier.file, currentFileUrl: _buildAnimationAssetUrl(tier.file),
      bindingLabel: `${tierGroup}[${originalFile}]`, transition: _readResolvedTransition(tier.file),
      supportsAutoReturn: false, autoReturnMs: null, hasAutoReturnOverride: false,
      ...timingHint, displayHintWarning: !!(hintTarget && hintTarget !== originalFile),
      displayHintTarget: hintTarget || null,
    };
  });
}

function _buildStateCard(stateKey, triggerKind, themeOverrideMap) {
  const files = activeTheme && activeTheme.states && activeTheme.states[stateKey];
  if (!Array.isArray(files) || !files[0]) return null;
  const currentFile = files[0];
  const autoReturnMap = (activeTheme && activeTheme.timings && activeTheme.timings.autoReturn) || {};
  const supportsAutoReturn = Object.prototype.hasOwnProperty.call(autoReturnMap, stateKey);
  const resolvedAutoReturnMs = supportsAutoReturn ? autoReturnMap[stateKey] : null;
  const timingHint = _buildTimingHint(currentFile, resolvedAutoReturnMs);
  return {
    id: `state:${stateKey}`, slotType: "state", stateKey, triggerKind,
    currentFile, baseFile: (activeTheme._bindingBase && activeTheme._bindingBase.states && activeTheme._bindingBase.states[stateKey]) || currentFile,
    currentFileUrl: _buildAnimationAssetUrl(currentFile), bindingLabel: `states.${stateKey}[0]`,
    transition: _readResolvedTransition(currentFile), supportsAutoReturn,
    autoReturnMs: resolvedAutoReturnMs,
    hasAutoReturnOverride: supportsAutoReturn ? _hasExplicitAutoReturnOverride(themeOverrideMap, stateKey) : false,
    ...timingHint, displayHintWarning: false, displayHintTarget: null,
  };
}

function _buildAnimationOverrideCards() {
  if (!activeTheme) return [];
  const cards = [];
  const themeOverrideMap = _readCurrentThemeOverrideMap();
  const thinking = _buildStateCard("thinking", "thinking", themeOverrideMap);
  if (thinking) cards.push(thinking);
  const baseBindings = activeTheme._bindingBase || {};
  cards.push(..._buildTierCardGroup("workingTiers", "working", activeTheme.workingTiers || [], baseBindings.workingTiers || [], baseBindings.displayHintMap || {}));
  cards.push(..._buildTierCardGroup("jugglingTiers", "juggling", activeTheme.jugglingTiers || [], baseBindings.jugglingTiers || [], baseBindings.displayHintMap || {}));
  for (const [stateKey, triggerKind] of [
    ["error", "error"], ["attention", "attention"], ["notification", "notification"],
    ["sweeping", "sweeping"], ["carrying", "carrying"], ["sleeping", "sleeping"], ["waking", "waking"],
  ]) {
    const card = _buildStateCard(stateKey, triggerKind, themeOverrideMap);
    if (card) cards.push(card);
  }
  return cards;
}

function _buildAnimationOverrideData() {
  if (!activeTheme) return null;
  const meta = themeLoader.getThemeMetadata(activeTheme._id) || {};
  return {
    theme: { id: activeTheme._id, name: meta.name || activeTheme._id, variantId: activeTheme._variantId || "default", assetsDir: _resolveAnimationAssetsDir(activeTheme) },
    assets: _listAnimationOverrideAssets(activeTheme), cards: _buildAnimationOverrideCards(),
  };
}

function _previewAnimationOverride(payload) {
  if (!payload || typeof payload !== "object") {
    return { status: "error", message: "previewAnimationOverride payload must be an object" };
  }
  const { stateKey, file, durationMs } = payload;
  if (typeof stateKey !== "string" || !stateKey) {
    return { status: "error", message: "previewAnimationOverride.stateKey must be a non-empty string" };
  }
  if (typeof file !== "string" || !file) {
    return { status: "error", message: "previewAnimationOverride.file must be a non-empty string" };
  }
  if (!_state || typeof _state.applyState !== "function" || typeof _state.resolveDisplayState !== "function") {
    return { status: "error", message: "previewAnimationOverride requires state runtime" };
  }
  if (animationOverridePreviewTimer) {
    clearTimeout(animationOverridePreviewTimer);
    animationOverridePreviewTimer = null;
  }
  try {
    _state.applyState(stateKey, file);
  } catch (err) {
    return { status: "error", message: `previewAnimationOverride: ${err && err.message}` };
  }
  const fallbackMs = (activeTheme && activeTheme.timings && activeTheme.timings.autoReturn && activeTheme.timings.autoReturn[stateKey]) || 1800;
  const holdMs = (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 300)
    ? durationMs : fallbackMs;
  animationOverridePreviewTimer = setTimeout(() => {
    animationOverridePreviewTimer = null;
    try {
      const resolved = _state.resolveDisplayState();
      _state.applyState(resolved, _state.getSvgOverride(resolved));
    } catch {}
  }, holdMs);
  return { status: "ok" };
}

// ── IPC: settings panel write entry points ──
ipcMain.handle("settings:get-snapshot", () => _settingsController.getSnapshot());
ipcMain.handle("settings:update", (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return { status: "error", message: "settings:update payload must be { key, value }" };
  }
  return _settingsController.applyUpdate(payload.key, payload.value);
});
ipcMain.handle("settings:command", async (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return { status: "error", message: "settings:command payload must be { action, payload }" };
  }
  return _settingsController.applyCommand(payload.action, payload.payload);
});
ipcMain.handle("settings:get-animation-overrides-data", () => _buildAnimationOverrideData());
ipcMain.handle("settings:open-theme-assets-dir", async () => {
  const dir = _resolveAnimationAssetsDir(activeTheme);
  if (!dir || !fs.existsSync(dir)) {
    return { status: "error", message: "theme assets directory unavailable" };
  }
  const result = await shell.openPath(dir);
  if (result) return { status: "error", message: result };
  return { status: "ok", path: dir };
});
ipcMain.handle("settings:preview-animation-override", (_event, payload) => _previewAnimationOverride(payload));

ipcMain.handle("settings:list-themes", () => {
  try {
    const activeId = activeTheme ? activeTheme._id : "clawd";
    return themeLoader.listThemesWithMetadata().map((t) => ({ ...t, active: t.id === activeId }));
  } catch (err) {
    console.warn("Clawd: settings:list-themes failed:", err && err.message);
    return [];
  }
});

const REMOVE_THEME_DIALOG_STRINGS = {
  en: { delete: "Delete", cancel: "Cancel", message: (name) => `Delete theme "${name}"?`, detail: "This cannot be undone. All files for this theme will be removed from disk." },
  zh: { delete: "删除", cancel: "取消", message: (name) => `确认删除主题 "${name}"？`, detail: "此操作不可撤销。主题的所有文件将从磁盘移除。" },
  ko: { delete: "삭제", cancel: "취소", message: (name) => `테마 "${name}"을(를) 삭제할까요?`, detail: "이 작업은 되돌릴 수 없습니다. 이 테마의 모든 파일이 디스크에서 제거됩니다。" },
};
ipcMain.handle("settings:confirm-remove-theme", async (event, themeId) => {
  if (typeof themeId !== "string" || !themeId) return { confirmed: false };
  const meta = themeLoader.getThemeMetadata(themeId);
  const displayName = (meta && meta.name) || themeId;
  const parent = BrowserWindow.fromWebContents(event.sender) || settingsWindow || null;
  const s = REMOVE_THEME_DIALOG_STRINGS[lang] || REMOVE_THEME_DIALOG_STRINGS.en;
  try {
    const { response } = await dialog.showMessageBox(parent, {
      type: "warning", buttons: [s.delete, s.cancel], defaultId: 1, cancelId: 1,
      message: s.message(displayName), detail: s.detail, noLink: true,
    });
    return { confirmed: response === 0 };
  } catch (err) {
    console.warn("Clawd: confirm-remove-theme dialog failed:", err && err.message);
    return { confirmed: false };
  }
});

const CLAUDE_HOOKS_DIALOG_STRINGS = {
  en: { disableTitle: "Turn off automatic Claude hook management?", disableDetail: "Existing Claude hooks in ~/.claude/settings.json stay in place unless you remove them now.", disableOnly: "Disable automatic management only", disableAndRemove: "Disable and remove installed hooks", cancel: "Cancel", disconnectTitle: "Disconnect Claude hooks?", disconnectDetail: "This removes Clawd-managed Claude hooks from ~/.claude/settings.json and turns off automatic management.", disconnect: "Disconnect hooks" },
  zh: { disableTitle: "关闭 Claude hooks 自动管理？", disableDetail: "如果不选择立即移除，`~/.claude/settings.json` 里当前已安装的 Claude hooks 会继续保留。", disableOnly: "只关闭自动管理", disableAndRemove: "关闭并移除当前 hooks", cancel: "取消", disconnectTitle: "断开 Claude hooks？", disconnectDetail: "这会从 `~/.claude/settings.json` 移除 Clawd 管理的 Claude hooks，并关闭自动管理。", disconnect: "断开 hooks" },
  ko: { disableTitle: "Claude hooks 자동 관리를 끌까요?", disableDetail: "지금 제거하지 않으면 `~/.claude/settings.json`에 설치된 Claude hooks는 그대로 유지됩니다.", disableOnly: "자동 관리만 끄기", disableAndRemove: "끄고 설치된 hooks 제거", cancel: "취소", disconnectTitle: "Claude hooks 연결을 해제할까요?", disconnectDetail: "`~/.claude/settings.json`에서 Clawd가 관리하는 Claude hooks를 제거하고 자동 관리를 끕니다.", disconnect: "hooks 연결 해제" },
};
function _getSettingsDialogParent(event) {
  return BrowserWindow.fromWebContents(event.sender) || settingsWindow || null;
}
ipcMain.handle("settings:confirm-disable-claude-hooks", async (event) => {
  const s = CLAUDE_HOOKS_DIALOG_STRINGS[lang] || CLAUDE_HOOKS_DIALOG_STRINGS.en;
  try {
    const { response } = await dialog.showMessageBox(_getSettingsDialogParent(event), {
      type: "warning", buttons: [s.disableAndRemove, s.disableOnly, s.cancel],
      defaultId: 1, cancelId: 2, message: s.disableTitle, detail: s.disableDetail, noLink: true,
    });
    if (response === 0) return { choice: "disconnect" };
    if (response === 1) return { choice: "disable" };
    return { choice: "cancel" };
  } catch (err) {
    console.warn("Clawd: confirm-disable-claude-hooks dialog failed:", err && err.message);
    return { choice: "cancel" };
  }
});
ipcMain.handle("settings:confirm-disconnect-claude-hooks", async (event) => {
  const s = CLAUDE_HOOKS_DIALOG_STRINGS[lang] || CLAUDE_HOOKS_DIALOG_STRINGS.en;
  try {
    const { response } = await dialog.showMessageBox(_getSettingsDialogParent(event), {
      type: "warning", buttons: [s.disconnect, s.cancel], defaultId: 1, cancelId: 1,
      message: s.disconnectTitle, detail: s.disconnectDetail, noLink: true,
    });
    return { confirmed: response === 0 };
  } catch (err) {
    console.warn("Clawd: confirm-disconnect-claude-hooks dialog failed:", err && err.message);
    return { confirmed: false };
  }
});

ipcMain.handle("settings:list-agents", () => {
  try {
    const { getAllAgents } = require("../agents/registry");
    return getAllAgents().map((a) => ({ id: a.id, name: a.name, eventSource: a.eventSource, capabilities: a.capabilities || {} }));
  } catch (err) {
    console.warn("Clawd: settings:list-agents failed:", err && err.message);
    return [];
  }
});

// ── Auto-updater (kept for standalone compatibility, no-op in embedded mode) ──
const _updaterCtx = {
  get doNotDisturb() { return doNotDisturb; },
  get miniMode() { return _mini.getMiniMode(); },
  get lang() { return lang; },
  t, rebuildAllMenus, updateLog,
  showUpdateBubble: (payload) => showUpdateBubble(payload),
  hideUpdateBubble: () => hideUpdateBubble(),
  setUpdateVisualState: (kind) => _state.setUpdateVisualState(kind),
  applyState: (state, svgOverride) => applyState(state, svgOverride),
  resolveDisplayState: () => resolveDisplayState(),
  getSvgOverride: (state) => getSvgOverride(state),
  resetSoundCooldown: () => resetSoundCooldown(),
};
const _updater = require("./updater")(_updaterCtx);
const { setupAutoUpdater, checkForUpdates, getUpdateMenuItem, getUpdateMenuLabel } = _updater;

// ── Settings panel window ──
let settingsWindow = null;

function getSettingsWindowIcon() {
  if (isMac) return undefined;
  if (isWin) {
    return app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.join(__dirname, "..", "assets", "icon.ico");
  }
  return undefined;
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const iconPath = getSettingsWindowIcon();
  const opts = {
    width: 800, height: 560, minWidth: 640, minHeight: 480, show: false,
    frame: true, transparent: false, resizable: true, minimizable: true,
    maximizable: true, skipTaskbar: false, alwaysOnTop: false, title: "Clawd Settings",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1c1f" : "#f5f5f7",
    webPreferences: {
      preload: path.join(__dirname, "preload-settings.js"),
      nodeIntegration: false, contextIsolation: true,
    },
  };
  if (iconPath) opts.icon = iconPath;
  settingsWindow = new BrowserWindow(opts);
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.once("ready-to-show", () => { settingsWindow.show(); settingsWindow.focus(); });
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

function createWindow() {
  const prefs = _settingsController.getSnapshot();
  if (SIZES[prefs.size]) {
    const wa = getPrimaryWorkAreaSafe() || SYNTHETIC_WORK_AREA;
    const px = SIZES[prefs.size].width;
    const ratio = Math.round(px / wa.width * 100);
    const migrated = `P:${Math.max(1, Math.min(75, ratio))}`;
    _settingsController.applyUpdate("size", migrated);
  }
  if (isMac) { applyDockVisibility(); }
  const launchSizingWorkArea = getLaunchSizingWorkArea(
    prefs, getPrimaryWorkAreaSafe() || SYNTHETIC_WORK_AREA, getNearestWorkArea,
  );
  const size = getCurrentPixelSize(launchSizingWorkArea);

  let startX, startY;
  if (prefs.miniMode) {
    const miniPos = _mini.restoreFromPrefs(prefs, size);
    startX = miniPos.x; startY = miniPos.y;
  } else if (prefs.positionSaved) {
    const clamped = clampToScreen(prefs.x, prefs.y, size.width, size.height);
    startX = clamped.x; startY = clamped.y;
  } else {
    const workArea = getPrimaryWorkAreaSafe() || SYNTHETIC_WORK_AREA;
    startX = workArea.x + workArea.width - size.width - 20;
    startY = workArea.y + workArea.height - size.height - 20;
  }

  win = new BrowserWindow({
    width: size.width, height: size.height, x: startX, y: startY,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false, fullscreenable: false,
    enableLargerThanScreen: true,
    ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
    ...(isMac ? { type: "panel", roundedCorners: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      additionalArguments: [
        "--theme-config=" + JSON.stringify(themeLoader.getRendererConfig()),
      ],
    },
  });

  win.setFocusable(false);

  if (isLinux) {
    win.on("close", (event) => {
      if (!isQuitting) { event.preventDefault(); if (!win.isVisible()) win.showInactive(); }
    });
    win.on("unresponsive", () => {
      if (isQuitting) return;
      console.warn("Clawd: renderer unresponsive — reloading");
      win.webContents.reload();
    });
  }

  if (isWin) {
    win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    win.setSkipTaskbar(true);
  }
  win.loadFile(path.join(__dirname, "index.html"));
  win.showInactive();
  if (isLinux) win.setSkipTaskbar(true);
  reapplyMacVisibility();

  if (isMac) {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      applyDockVisibility();
    }, 0);
  }

  buildContextMenu();
  if (!isMac || showTray) createTray();
  ensureContextMenuOwner();

  // ── Create input window (hitWin) ──
  {
    const initBounds = win.getBounds();
    const initHit = getHitRectScreen(initBounds);
    const hx = Math.round(initHit.left), hy = Math.round(initHit.top);
    const hw = Math.round(initHit.right - initHit.left);
    const hh = Math.round(initHit.bottom - initHit.top);

    hitWin = new BrowserWindow({
      width: hw, height: hh, x: hx, y: hy,
      frame: false, transparent: true, alwaysOnTop: true, resizable: false,
      skipTaskbar: true, hasShadow: false, fullscreenable: false,
      enableLargerThanScreen: true,
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: "panel", roundedCorners: false } : {}),
      focusable: !isLinux,
      webPreferences: {
        preload: path.join(__dirname, "preload-hit.js"),
        backgroundThrottling: false,
        additionalArguments: [
          "--hit-theme-config=" + JSON.stringify(themeLoader.getHitRendererConfig()),
        ],
      },
    });
    hitWin.setShape([{ x: 0, y: 0, width: hw, height: hh }]);
    hitWin.setIgnoreMouseEvents(false);
    if (isMac) hitWin.setFocusable(false);
    hitWin.showInactive();
    if (isLinux) hitWin.setSkipTaskbar(true);
    if (isWin) {
      hitWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
      hitWin.setSkipTaskbar(true);
    }
    reapplyMacVisibility();
    hitWin.loadFile(path.join(__dirname, "hit.html"));
    if (isWin) guardAlwaysOnTop(hitWin);

    const syncFloatingWindows = () => { syncHitWin(); if (bubbleFollowPet) repositionFloatingBubbles(); else repositionUpdateBubble(); };
    win.on("move", syncFloatingWindows);
    win.on("resize", syncFloatingWindows);

    hitWin.webContents.on("did-finish-load", () => {
      sendToHitWin("theme-config", themeLoader.getHitRendererConfig());
      if (themeReloadInProgress) return;
      syncHitStateAfterLoad();
    });

    hitWin.webContents.on("render-process-gone", (_event, details) => {
      console.error("hitWin renderer crashed:", details.reason);
      hitWin.webContents.reload();
    });
  }

  ipcMain.on("show-context-menu", showPetContextMenu);

  ipcMain.on("move-window-by", (event, dx, dy) => {
    if (_mini.getMiniMode() || _mini.getMiniTransitioning()) return;
    const { x, y } = win.getBounds();
    const size = getCurrentPixelSize();
    const newX = x + dx, newY = y + dy;
    const looseClamped = looseClampToDisplays(newX, newY, size.width, size.height);
    win.setBounds({ ...looseClamped, width: size.width, height: size.height });
    syncHitWin();
    if (bubbleFollowPet) repositionFloatingBubbles();
  });

  ipcMain.on("pause-cursor-polling", () => { idlePaused = true; });
  ipcMain.on("resume-from-reaction", () => {
    idlePaused = false;
    if (_mini.getMiniTransitioning()) return;
    sendToRenderer("state-change", _state.getCurrentState(), _state.getCurrentSvg());
  });

  ipcMain.on("drag-lock", (event, locked) => {
    dragLocked = !!locked;
    if (locked) mouseOverPet = true;
  });

  // Reaction relay
  ipcMain.on("start-drag-reaction", () => sendToRenderer("start-drag-reaction"));
  ipcMain.on("end-drag-reaction", () => sendToRenderer("end-drag-reaction"));
  ipcMain.on("play-click-reaction", (_, svg, duration) => {
    sendToRenderer("play-click-reaction", svg, duration);
  });

  ipcMain.on("drag-end", () => {
    if (!_mini.getMiniMode() && !_mini.getMiniTransitioning()) {
      checkMiniModeSnap();
      if (win && !win.isDestroyed()) {
        const size = getCurrentPixelSize();
        const { x, y } = win.getBounds();
        const clamped = clampToScreen(x, y, size.width, size.height);
        win.setBounds({ ...clamped, width: size.width, height: size.height });
        syncHitWin();
        repositionUpdateBubble();
      }
    }
  });

  ipcMain.on("exit-mini-mode", () => { if (_mini.getMiniMode()) exitMiniMode(); });

  ipcMain.on("focus-terminal", () => {
    let best = null, bestTime = 0, bestPriority = -1;
    for (const [, s] of sessions) {
      if (!s.sourcePid) continue;
      const pri = STATE_PRIORITY[s.state] || 0;
      if (pri > bestPriority || (pri === bestPriority && s.updatedAt > bestTime)) {
        best = s; bestTime = s.updatedAt; bestPriority = pri;
      }
    }
    if (best) focusTerminalWindow(best.sourcePid, best.cwd, best.editor, best.pidChain);
  });

  ipcMain.on("show-session-menu", () => { popupMenuAt(Menu.buildFromTemplate(buildSessionSubmenu())); });

  ipcMain.on("bubble-height", (event, height) => _perm.handleBubbleHeight(event, height));
  ipcMain.on("permission-decide", (event, behavior) => _perm.handleDecide(event, behavior));
  ipcMain.on("update-bubble-height", (event, height) => handleUpdateBubbleHeight(event, height));
  ipcMain.on("update-bubble-action", (event, actionId) => handleUpdateBubbleAction(event, actionId));

  initFocusHelper();
  startMainTick();
  startHttpServer();
  startStaleCleanup();

  win.webContents.on("did-finish-load", () => {
    sendToRenderer("theme-config", themeLoader.getRendererConfig());
    if (themeReloadInProgress) return;
    syncRendererStateAfterLoad();
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer crashed:", details.reason);
    dragLocked = false; idlePaused = false; mouseOverPet = false;
    win.webContents.reload();
  });

  guardAlwaysOnTop(win);
  startTopmostWatchdog();

  screen.on("display-metrics-changed", () => {
    reapplyMacVisibility();
    if (!win || win.isDestroyed()) return;
    if (_mini.getMiniMode()) { _mini.handleDisplayChange(); return; }
    const size = getCurrentPixelSize();
    const { x, y } = win.getBounds();
    const clamped = clampToScreen(x, y, size.width, size.height);
    if (isProportionalMode() || clamped.x !== x || clamped.y !== y) {
      win.setBounds({ ...clamped, width: size.width, height: size.height });
      syncHitWin();
      repositionUpdateBubble();
    }
  });
  screen.on("display-removed", () => {
    reapplyMacVisibility();
    if (!win || win.isDestroyed()) return;
    if (_mini.getMiniMode()) { exitMiniMode(); return; }
    const size = getCurrentPixelSize();
    const { x, y } = win.getBounds();
    const clamped = clampToScreen(x, y, size.width, size.height);
    win.setBounds({ ...clamped, width: size.width, height: size.height });
    syncHitWin();
    repositionUpdateBubble();
  });
  screen.on("display-added", () => { reapplyMacVisibility(); repositionUpdateBubble(); });
}

function getPrimaryWorkAreaSafe() {
  try {
    const primary = screen.getPrimaryDisplay();
    return (primary && primary.workArea) || null;
  } catch { return null; }
}

function getNearestWorkArea(cx, cy) {
  return findNearestWorkArea(screen.getAllDisplays(), getPrimaryWorkAreaSafe(), cx, cy);
}

function looseClampToDisplays(x, y, w, h) {
  return computeLooseClamp(screen.getAllDisplays(), getPrimaryWorkAreaSafe(), x, y, w, h);
}

function clampToScreen(x, y, w, h) {
  const nearest = getNearestWorkArea(x + w / 2, y + h / 2);
  const mLeft  = Math.round(w * 0.25);
  const mRight = Math.round(w * 0.25);
  const mTop   = Math.round(h * 0.6);
  const mBot   = Math.round(h * 0.04);
  return {
    x: Math.max(nearest.x - mLeft, Math.min(x, nearest.x + nearest.width - w + mRight)),
    y: Math.max(nearest.y - mTop,  Math.min(y, nearest.y + nearest.height - h + mBot)),
  };
}

// ── Mini Mode ──
const _miniCtx = {
  get theme() { return activeTheme; },
  get win() { return win; },
  get currentSize() { return currentSize; },
  get doNotDisturb() { return doNotDisturb; },
  set doNotDisturb(v) { doNotDisturb = v; },
  SIZES, getCurrentPixelSize, isProportionalMode,
  sendToRenderer, sendToHitWin, syncHitWin,
  applyState, resolveDisplayState, getSvgOverride,
  stopWakePoll, clampToScreen, getNearestWorkArea,
  get bubbleFollowPet() { return bubbleFollowPet; },
  get pendingPermissions() { return pendingPermissions; },
  repositionBubbles: () => repositionFloatingBubbles(),
  buildContextMenu: () => buildContextMenu(),
  buildTrayMenu: () => buildTrayMenu(),
};
const _mini = require("./mini")(_miniCtx);
const { enterMiniMode, exitMiniMode, enterMiniViaMenu, miniPeekIn, miniPeekOut,
        checkMiniModeSnap, cancelMiniTransition, animateWindowX, animateWindowParabola } = _mini;

Object.defineProperties(this || {}, {});

// ── Theme switching ──
function activateTheme(themeId, variantId) {
  if (!win || win.isDestroyed()) {
    throw new Error("theme switch requires ready windows");
  }
  const currentVariantMap = _settingsController.get("themeVariant") || {};
  const targetVariant = (typeof variantId === "string" && variantId) ? variantId
    : (currentVariantMap[themeId] || "default");
  const currentOverrides = _settingsController.get("themeOverrides") || {};
  const targetOverrideMap = arguments.length >= 3 ? arguments[2] : (currentOverrides[themeId] || null);
  const targetOverrideSignature = JSON.stringify(targetOverrideMap || {});

  if (
    activeTheme &&
    activeTheme._id === themeId &&
    activeTheme._variantId === targetVariant &&
    (activeTheme._overrideSignature || "{}") === targetOverrideSignature
  ) {
    return { themeId, variantId: activeTheme._variantId };
  }

  const newTheme = themeLoader.loadTheme(themeId, {
    strict: true, variant: targetVariant, overrides: targetOverrideMap,
  });
  newTheme._overrideSignature = targetOverrideSignature;
  if (animationOverridePreviewTimer) {
    clearTimeout(animationOverridePreviewTimer);
    animationOverridePreviewTimer = null;
  }

  _state.cleanup();
  _tick.cleanup();
  _mini.cleanup();

  if (_mini.getMiniMode() && !newTheme.miniMode.supported) {
    _mini.exitMiniMode();
  }

  activeTheme = newTheme;
  _mini.refreshTheme();
  _state.refreshTheme();
  _tick.refreshTheme();
  if (_mini.getMiniMode()) _mini.handleDisplayChange();

  themeReloadInProgress = true;
  win.webContents.reload();
  hitWin.webContents.reload();

  let ready = 0;
  const onReady = () => {
    if (++ready < 2) return;
    themeReloadInProgress = false;
    syncHitStateAfterLoad();
    syncRendererStateAfterLoad({ includeStartupRecovery: false });
    syncHitWin();
    startMainTick();
  };
  win.webContents.once("did-finish-load", onReady);
  hitWin.webContents.once("did-finish-load", onReady);

  flushRuntimeStateToPrefs();
  return { themeId, variantId: newTheme._variantId };
}

function _deferredActivateTheme(themeId, variantId, overrideMap) {
  return activateTheme(themeId, variantId, overrideMap);
}
function _deferredGetThemeInfo(themeId) {
  const all = themeLoader.discoverThemes();
  const entry = all.find((t) => t.id === themeId);
  if (!entry) return null;
  return { builtin: !!entry.builtin, active: activeTheme && activeTheme._id === themeId };
}
function _deferredRemoveThemeDir(themeId) {
  const userThemesDir = themeLoader.ensureUserThemesDir();
  if (!userThemesDir) throw new Error("user themes directory unavailable");
  const target = path.resolve(path.join(userThemesDir, themeId));
  const root = path.resolve(userThemesDir);
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`theme path escapes user themes directory: ${themeId}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
  try { rebuildAllMenus(); } catch { /* best-effort */ }
}

// ── Auto-install VS Code / Cursor terminal-focus extension ──
const EXT_ID = "clawd.clawd-terminal-focus";
const EXT_VERSION = "0.1.0";
const EXT_DIR_NAME = `${EXT_ID}-${EXT_VERSION}`;

function installTerminalFocusExtension() {
  const os = require("os");
  const home = os.homedir();

  let extSrc = path.join(__dirname, "..", "extensions", "vscode");
  extSrc = extSrc.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);

  if (!fs.existsSync(extSrc)) {
    console.log("Clawd: terminal-focus extension source not found, skipping auto-install");
    return;
  }

  const targets = [
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".cursor", "extensions"),
  ];

  const filesToCopy = ["package.json", "extension.js"];
  let installed = 0;

  for (const extRoot of targets) {
    if (!fs.existsSync(extRoot)) continue;
    const dest = path.join(extRoot, EXT_DIR_NAME);
    if (fs.existsSync(path.join(dest, "package.json"))) continue;
    try {
      fs.mkdirSync(dest, { recursive: true });
      for (const file of filesToCopy) {
        fs.copyFileSync(path.join(extSrc, file), path.join(dest, file));
      }
      installed++;
      console.log(`Clawd: installed terminal-focus extension to ${dest}`);
    } catch (err) {
      console.warn(`Clawd: failed to install extension to ${dest}:`, err.message);
    }
  }
  if (installed > 0) {
    console.log(`Clawd: terminal-focus extension installed to ${installed} editor(s). Restart VS Code/Cursor to activate.`);
  }
}

// ── Factory export ──
module.exports = function createClawdIntegration(aipaContext) {
  // aipaContext: { mainWindow, isQuitting: () => boolean, onQuit: (fn) => void }
  const { isQuitting: isAipaQuitting, onQuit } = aipaContext;

  // Wire AIPA's quit state into clawd's isQuitting
  Object.defineProperty(global, '__clawdIsQuitting', {
    get: () => isAipaQuitting(),
    configurable: true,
  });

  // Register cleanup
  onQuit(() => {
    isQuitting = true;
    flushRuntimeStateToPrefs();
    unregisterToggleShortcut();
    globalShortcut.unregisterAll();
    _perm.cleanup();
    _server.cleanup();
    _updateBubble.cleanup();
    _state.cleanup();
    _tick.cleanup();
    _mini.cleanup();
    if (_codexMonitor) _codexMonitor.stop();
    if (_geminiMonitor) _geminiMonitor.stop();
    stopTopmostWatchdog();
    if (hwndRecoveryTimer) { clearTimeout(hwndRecoveryTimer); hwndRecoveryTimer = null; }
    _focus.cleanup();
    if (hitWin && !hitWin.isDestroyed()) hitWin.destroy();
  });

  // Setup auto-updater (no-op in embedded mode)
  try { setupAutoUpdater(); } catch (err) {
    console.warn("Clawd: auto-updater setup skipped:", err.message);
  }

  // Hydrate system-backed settings
  hydrateSystemBackedSettings();

  // Create clawd windows
  permDebugLog = path.join(app.getPath("userData"), "permission-debug.log");
  updateDebugLog = path.join(app.getPath("userData"), "update-debug.log");
  sessionDebugLog = path.join(app.getPath("userData"), "session-debug.log");

  createWindow();

  // Register global shortcut for toggling pet visibility
  registerToggleShortcut();

  // Construct log monitors
  try {
    const CodexLogMonitor = require("../agents/codex-log-monitor");
    const codexAgent = require("../agents/codex");
    _codexMonitor = new CodexLogMonitor(codexAgent, (sid, state, event, extra) => {
      if (state === "codex-permission") {
        updateSession(sid, "notification", event, null, extra.cwd, null, null, null, "codex");
        showCodexNotifyBubble({ sessionId: sid, command: extra.permissionDetail?.command || "" });
        return;
      }
      clearCodexNotifyBubbles(sid);
      updateSession(sid, state, event, null, extra.cwd, null, null, null, "codex");
    });
    if (_isAgentEnabled(_settingsController.getSnapshot(), "codex")) {
      _codexMonitor.start();
    }
  } catch (err) {
    console.warn("Clawd: Codex log monitor not started:", err.message);
  }

  try {
    const GeminiLogMonitor = require("../agents/gemini-log-monitor");
    const geminiAgent = require("../agents/gemini-cli");
    _geminiMonitor = new GeminiLogMonitor(geminiAgent, (sid, state, event, extra) => {
      updateSession(sid, state, event, null, extra.cwd, null, null, null, "gemini-cli");
    });
    if (_isAgentEnabled(_settingsController.getSnapshot(), "gemini-cli")) {
      _geminiMonitor.start();
    }
  } catch (err) {
    console.warn("Clawd: Gemini log monitor not started:", err.message);
  }

  // Auto-install VS Code/Cursor terminal-focus extension
  try { installTerminalFocusExtension(); } catch (err) {
    console.warn("Clawd: failed to auto-install terminal-focus extension:", err.message);
  }

  // Install terminal-focus extension
  autoInstallTerminalFocusExtension();

  // Public API for AIPA to call
  return {
    /** Notify clawd of AIPA session state changes */
    notifyState: (state, sessionId) => {
      updateSession(sessionId, state, "aipa", null, null, null, null, null, "aipa");
    },
    /** Check if clawd windows are alive */
    isRunning: () => win && !win.isDestroyed(),
    /** Get current state for debugging */
    getState: () => _state.getCurrentState(),
    /** Get sessions map */
    getSessions: () => sessions,
    /** Get window refs */
    getWindows: () => ({ win, hitWin }),
  };
};

function autoInstallTerminalFocusExtension() {
  try {
    const os = require("os");
    const home = os.homedir();
    const extSrc = path.join(__dirname, "..", "extensions", "vscode");
    const EXT_ID = "clawd.clawd-terminal-focus";
    const EXT_VERSION = "0.1.0";
    const EXT_DIR_NAME = `${EXT_ID}-${EXT_VERSION}`;
    const filesToCopy = ["package.json", "extension.js"];

    for (const extRoot of [path.join(home, ".vscode", "extensions"), path.join(home, ".cursor", "extensions")]) {
      if (!fs.existsSync(extRoot)) continue;
      const dest = path.join(extRoot, EXT_DIR_NAME);
      if (fs.existsSync(path.join(dest, "package.json"))) continue;
      fs.mkdirSync(dest, { recursive: true });
      for (const file of filesToCopy) {
        fs.copyFileSync(path.join(extSrc, file), path.join(dest, file));
      }
    }
  } catch (err) {
    console.warn("Clawd: terminal-focus extension auto-install failed:", err.message);
  }
}
