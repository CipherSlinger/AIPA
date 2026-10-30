/**
 * pet-menu.js — the SAO-style radial quick menu that replaces the pet's native
 * context menu on right-click.
 *
 * One window, created on demand and destroyed on close. A menu is a transient
 * surface: a hidden window kept around would hold a GPU-backed surface for
 * every open/close cycle and would keep answering IPC after the pet was hidden
 * or shut down. It is focusable because Escape and the 1–5 shortcuts need a
 * real focus owner, but it is skipped from the taskbar and sized to the ring so
 * it never covers more of the desktop than it draws on.
 *
 * Failure policy: if the window cannot be created or the page cannot load, the
 * caller falls back to the native context menu. A quick menu that swallows the
 * right-click and then shows nothing would make the pet unusable.
 *
 * The second ring behind MORE is a renderer-only concern: the page swaps
 * layers inside this same window, so no second window, no re-measure and no
 * second reveal handshake are involved. Only the final petal id crosses IPC.
 */
const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const SIZE = 420;
const EDGE_MARGIN = 8;
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";
const WIN_TOPMOST_LEVEL = "pop-up-menu";
const LINUX_WINDOW_TYPE = "toolbar";

// A local file either loads or does not; this only guards the ready handshake
// so a renderer that never reports back cannot leave an invisible, focused
// window sitting over the desktop.
const REVEAL_TIMEOUT_MS = 700;
// The window is revealed after it painted. A blur in the first moment is the
// owner window losing activation, not the user clicking away.
const BLUR_ARM_MS = 250;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = function initPetMenu(ctx) {
  let menuWin = null;
  let previousFocus = null;
  let revealTimer = null;
  let blurArmedAt = 0;
  let fallbackFired = false;

  function isOpen() {
    return !!(menuWin && !menuWin.isDestroyed() && menuWin.isVisible());
  }

  function clearRevealTimer() {
    if (!revealTimer) return;
    clearTimeout(revealTimer);
    revealTimer = null;
  }

  /**
   * Centre the ring on the pet's visible sprite, then clamp to the work area of
   * the display the pet is on. Clamping matters on a secondary monitor whose
   * work area starts left of the primary: the pet may sit near that edge, and
   * the ring must still be fully reachable instead of half off-screen.
   */
  function computeBounds() {
    if (!ctx.win || ctx.win.isDestroyed()) return null;
    const bounds = ctx.win.getBounds();
    const hit = typeof ctx.getHitRectScreen === "function" ? ctx.getHitRectScreen(bounds) : null;
    const cx = hit ? Math.round((hit.left + hit.right) / 2) : Math.round(bounds.x + bounds.width / 2);
    const cy = hit ? Math.round((hit.top + hit.bottom) / 2) : Math.round(bounds.y + bounds.height / 2);
    const wa = ctx.getNearestWorkArea(cx, cy);
    const x = clamp(Math.round(cx - SIZE / 2), wa.x + EDGE_MARGIN, wa.x + wa.width - SIZE - EDGE_MARGIN);
    const y = clamp(Math.round(cy - SIZE / 2), wa.y + EDGE_MARGIN, wa.y + wa.height - SIZE - EDGE_MARGIN);
    return { x, y, width: SIZE, height: SIZE };
  }

  function reveal() {
    if (!menuWin || menuWin.isDestroyed() || menuWin.isVisible()) return;
    clearRevealTimer();
    const focused = BrowserWindow.getFocusedWindow();
    previousFocus = focused && focused !== menuWin ? focused : null;
    // Applied before the first show: on Windows a transparent, focusable window
    // otherwise gets a taskbar button for the fraction of a second it is up.
    if (typeof ctx.hideFromTaskbar === "function") ctx.hideFromTaskbar(menuWin);
    menuWin.show();
    menuWin.focus();
    blurArmedAt = Date.now() + BLUR_ARM_MS;
    if (isWin) menuWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    if (typeof ctx.reapplyMacVisibility === "function") ctx.reapplyMacVisibility();
  }

  /**
   * Destroy the menu. Destroy rather than hide: the next open starts from a
   * clean renderer, so a stuck animation or a stale state flag cannot survive
   * an open/close cycle.
   *
   * `restoreFocus` is false on the click-away path. There the user already
   * chose where focus should go by clicking; handing it back to the pet would
   * undo that choice and steal focus from the app they just switched to.
   */
  function close(restoreFocus = true) {
    clearRevealTimer();
    blurArmedAt = 0;
    const win = menuWin;
    menuWin = null;
    if (win && !win.isDestroyed()) {
      try { win.destroy(); } catch (err) {
        console.warn("Clawd: pet menu destroy failed:", err.message);
      }
    }
    const restore = previousFocus;
    previousFocus = null;
    // Restoring the window that owned focus before the menu opened is what
    // keeps the menu from holding the keyboard away from a text field.
    if (restoreFocus && restore && !restore.isDestroyed() && restore.isVisible()) {
      try { restore.focus(); } catch { /* window may be on its way out */ }
    }
  }

  function fail() {
    if (fallbackFired) return;
    fallbackFired = true;
    close();
    if (typeof ctx.onUnavailable === "function") ctx.onUnavailable();
  }

  function open() {
    if (isOpen()) {
      close();
      return true;
    }
    if (menuWin && !menuWin.isDestroyed()) close();
    if (!ctx.win || ctx.win.isDestroyed()) return false;

    const bounds = computeBounds();
    if (!bounds) return false;

    fallbackFired = false;
    try {
      menuWin = new BrowserWindow({
        ...bounds,
        show: false,
        frame: false,
        transparent: true,
        alwaysOnTop: !isMac,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        focusable: true,
        ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
        ...(isMac ? { type: "panel", roundedCorners: false } : {}),
        webPreferences: {
          preload: path.join(__dirname, "preload-pet-menu.js"),
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      });
    } catch (err) {
      menuWin = null;
      console.warn("Clawd: pet menu window creation failed:", err.message);
      return false;
    }

    if (isWin) menuWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    if (isLinux) menuWin.setSkipTaskbar(true);
    if (typeof ctx.guardAlwaysOnTop === "function") ctx.guardAlwaysOnTop(menuWin);

    menuWin.on("blur", () => {
      // Click-away: the menu is the only window that should hold focus while
      // it is up. An early blur during reveal is ignored.
      if (Date.now() < blurArmedAt) return;
      close(false);
    });
    menuWin.on("closed", () => {
      clearRevealTimer();
      menuWin = null;
      previousFocus = null;
    });

    menuWin.webContents.once("did-finish-load", () => {
      if (!menuWin || menuWin.isDestroyed()) return;
      menuWin.webContents.send("pet-menu-show", ctx.getPayload());
    });
    menuWin.webContents.on("did-fail-load", (_event, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame === false) return;
      fail();
    });
    menuWin.webContents.on("render-process-gone", () => fail());

    menuWin.loadFile(path.join(__dirname, "pet-menu.html"));

    // If the page never reports that it painted, showing it would leave an
    // invisible window that still swallows clicks. Hand the click back to the
    // native menu instead.
    revealTimer = setTimeout(fail, REVEAL_TIMEOUT_MS);
    revealTimer.unref?.();
    return true;
  }

  function isSender(event) {
    if (!menuWin || menuWin.isDestroyed()) return false;
    return BrowserWindow.fromWebContents(event.sender) === menuWin;
  }

  /**
   * Close first, act second. An action that brings AIPA forward must not be
   * undone by the menu's own focus restore a moment later.
   *
   * Every petal — including the second ring behind MORE — is one action id.
   * The nested ring itself lives in the renderer, so by the time anything
   * arrives here it is already a decision, not a navigation step.
   */
  function finish(actionId) {
    close();
    setTimeout(() => {
      if (typeof ctx.onAction === "function") ctx.onAction(actionId);
    }, 0);
  }

  const handleReady = (event) => {
    if (!isSender(event)) return;
    reveal();
  };
  const handleAction = (event, actionId) => {
    if (!isSender(event)) return;
    if (typeof actionId !== "string" || !actionId) return;
    finish(actionId);
  };
  const handleClose = (event) => {
    if (!isSender(event)) return;
    close();
  };
  /**
   * The RECENT ring asks for the conversation list on demand. Building it into
   * every payload would put a session-store walk between the page loading and
   * the menu appearing, inside the reveal budget. A reply that arrives after
   * the menu closed is simply never sent.
   */
  const handleSessions = (event) => {
    if (!isSender(event)) return;
    let list = [];
    try {
      list = typeof ctx.getSessions === "function" ? ctx.getSessions() : [];
    } catch (err) {
      console.warn("Clawd: pet menu session list failed:", err.message);
      list = [];
    }
    if (!menuWin || menuWin.isDestroyed()) return;
    try {
      menuWin.webContents.send("pet-menu-sessions", list);
    } catch {
      // The window went away between the guard and the send.
    }
  };

  ipcMain.on("pet-menu-ready", handleReady);
  ipcMain.on("pet-menu-action", handleAction);
  ipcMain.on("pet-menu-close", handleClose);
  ipcMain.on("pet-menu-sessions", handleSessions);

  function cleanup() {
    close(false);
    ipcMain.removeListener("pet-menu-ready", handleReady);
    ipcMain.removeListener("pet-menu-action", handleAction);
    ipcMain.removeListener("pet-menu-close", handleClose);
    ipcMain.removeListener("pet-menu-sessions", handleSessions);
  }

  return {
    open,
    close,
    isOpen,
    cleanup,
    getWindow: () => menuWin,
  };
};
