// --- Input window: pointer capture, drag, click detection ---
// This is the "controller" — all input decisions happen here.
// Render window is pure "view" — receives reaction commands via IPC relay.

const area = document.getElementById("hit-area");

// ── Theme config (injected via preload-hit.js additionalArguments) ──
let tc = window.hitThemeConfig || {};
let _reactions = (tc && tc.reactions) || {};

// Theme switch: IPC push overrides additionalArguments
if (window.hitAPI && window.hitAPI.onThemeConfig) {
  window.hitAPI.onThemeConfig((cfg) => {
    tc = cfg || {};
    _reactions = (tc && tc.reactions) || {};
  });
}

// --- State synced from main ---
let currentSvg = null;
let currentState = null;
let miniMode = false;
let dndEnabled = false;
// Set while an attention bubble is up. A click on the pet must open that
// session, not play the poke/flail reaction.
let attentionActive = false;

window.hitAPI.onStateSync((data) => {
  if (data.currentSvg !== undefined) currentSvg = data.currentSvg;
  if (data.currentState !== undefined) currentState = data.currentState;
  if (data.miniMode !== undefined) {
    miniMode = data.miniMode;
    area.style.cursor = miniMode ? "default" : "";
  }
  if (data.dndEnabled !== undefined) dndEnabled = data.dndEnabled;
  if (data.attentionActive !== undefined) {
    attentionActive = !!data.attentionActive;
    area.style.cursor = attentionActive && !miniMode ? "pointer" : (miniMode ? "default" : "");
  }
  // DND and mini mode hide the badge (not queue it): the page owns those two
  // gates because main already owns "pref off", "silenced" and "pet hidden".
  renderNeedsYouBadge();
});

// ── Needs-you badge ─────────────────────────────────────────────────────────
// A count of tasks waiting on the user, drawn inside this hit window so it
// moves with the pet and scales with it. Main pushes the count; this page
// decides whether the current pointer state may show it, and turns a click
// into "open the task brief" — a drag that starts on the badge still drags.
const badgeEl = document.getElementById("needs-you-badge");
const badgeCountEl = document.getElementById("needs-you-count");
// Above this, a pill would outgrow a small pet: show a dot instead. The number
// stays reachable through the accessible name/tooltip.
const BADGE_DOT_THRESHOLD = 9;

let needsYouCount = 0;
let needsYouLabel = "";
let badgePress = false;
let badgeBumpTimer = null;

function sizeNeedsYouBadge() {
  // The hit window is sized to the sprite's hit rect, so its width tracks the
  // pet's current scale. A fifth of that width keeps the badge proportional at
  // every P:<ratio>; 11–26px keeps a single digit legible at the smallest pet
  // without the pill swallowing a corner of the sprite.
  const size = Math.round(Math.min(26, Math.max(11, window.innerWidth * 0.22)));
  document.documentElement.style.setProperty("--badge-size", size + "px");
}

function renderNeedsYouBadge(animate) {
  if (!badgeEl) return;
  const visible = needsYouCount > 0 && !dndEnabled && !miniMode;
  const dot = needsYouCount > BADGE_DOT_THRESHOLD;

  badgeEl.hidden = !visible;
  badgeEl.classList.toggle("dot", visible && dot);
  badgeCountEl.textContent = visible && !dot ? String(needsYouCount) : "";
  badgeEl.setAttribute("aria-hidden", visible ? "false" : "true");
  if (needsYouLabel) {
    badgeEl.title = needsYouLabel;
    badgeEl.setAttribute("aria-label", needsYouLabel);
  } else {
    badgeEl.removeAttribute("title");
    badgeEl.removeAttribute("aria-label");
  }

  if (!visible || !animate) return;
  // Restart the keyframes even when a previous bump is still running: a quick
  // +1/+1 should read as two changes, not one.
  badgeEl.classList.remove("bump");
  void badgeEl.offsetWidth;
  badgeEl.classList.add("bump");
  if (badgeBumpTimer) clearTimeout(badgeBumpTimer);
  badgeBumpTimer = setTimeout(function () {
    badgeBumpTimer = null;
    badgeEl.classList.remove("bump");
  }, 260);
}

if (badgeEl) {
  sizeNeedsYouBadge();
  window.addEventListener("resize", sizeNeedsYouBadge);
}

if (window.hitAPI && window.hitAPI.onBadgeSync) {
  window.hitAPI.onBadgeSync((data) => {
    const raw = data && typeof data.count === "number" && isFinite(data.count)
      ? Math.max(0, Math.round(data.count))
      : 0;
    const changed = raw !== needsYouCount;
    needsYouCount = raw;
    if (data && typeof data.label === "string") needsYouLabel = data.label;
    renderNeedsYouBadge(changed);
  });
}

// --- Drag state ---
let isDragging = false;
let didDrag = false;
let lastScreenX, lastScreenY;
let mouseDownX, mouseDownY;
let pendingDx = 0, pendingDy = 0;
let dragRAF = null;
const DRAG_THRESHOLD = 3;

// --- Reaction state (tracked here to gate input) ---
let isReacting = false;
let isDragReacting = false;

// Cancel signal from main (e.g. state change)
window.hitAPI.onCancelReaction(() => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
  isReacting = false;
  isDragReacting = false;
});

// --- Pointer handlers ---
area.addEventListener("pointerdown", (e) => {
  if (e.button === 0) {
    // A press that lands on the badge is still a press on the pet: the drag
    // path below runs unchanged, and pointerup decides between the two.
    badgePress = !!(badgeEl && !badgeEl.hidden && badgeEl.contains(e.target));
    if (miniMode) { didDrag = false; badgePress = false; return; }
    area.setPointerCapture(e.pointerId);
    isDragging = true;
    didDrag = false;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    pendingDx = 0;
    pendingDy = 0;
    window.hitAPI.dragLock(true);
    area.classList.add("dragging");
  }
});

document.addEventListener("pointermove", (e) => {
  if (isDragging) {
    pendingDx += e.screenX - lastScreenX;
    pendingDy += e.screenY - lastScreenY;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;

    if (!didDrag) {
      const totalDx = e.clientX - mouseDownX;
      const totalDy = e.clientY - mouseDownY;
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag = true;
        startDragReaction();
      }
    }

    if (!dragRAF) {
      dragRAF = setTimeout(() => {
        window.hitAPI.moveWindowBy(pendingDx, pendingDy);
        pendingDx = 0;
        pendingDy = 0;
        dragRAF = null;
      }, 0);
    }
  }
});

function stopDrag() {
  if (!isDragging) { badgePress = false; return; }
  isDragging = false;
  badgePress = false;
  window.hitAPI.dragLock(false);
  area.classList.remove("dragging");
  if (pendingDx !== 0 || pendingDy !== 0) {
    if (dragRAF) { clearTimeout(dragRAF); dragRAF = null; }
    window.hitAPI.moveWindowBy(pendingDx, pendingDy);
    pendingDx = 0; pendingDy = 0;
  }
  if (didDrag) {
    window.hitAPI.dragEnd();
  }
  endDragReaction();
}

document.addEventListener("pointerup", (e) => {
  if (e.button === 0) {
    const wasDrag = didDrag;
    // Badge press + no movement = open the brief. Any movement above the drag
    // threshold was a drag, so it must not also open a card.
    const wasBadge = badgePress && !wasDrag;
    stopDrag();
    if (!wasDrag) {
      if (wasBadge) {
        window.hitAPI.openTaskBrief();
      } else if (e.ctrlKey || e.metaKey) {
        window.hitAPI.showSessionMenu();
      } else {
        handleClick(e.clientX);
      }
    }
  }
});

area.addEventListener("pointercancel", () => stopDrag());
area.addEventListener("lostpointercapture", () => { if (isDragging) stopDrag(); });
window.addEventListener("blur", stopDrag);

// --- Click reaction logic (2-click = poke, 4-click = flail) ---
const CLICK_WINDOW_MS = 400;

let clickCount = 0;
let clickTimer = null;
let firstClickDir = null;

function _getReaction(name) {
  return _reactions[name] || null;
}

function handleClick(clientX) {
  if (miniMode) {
    window.hitAPI.exitMiniMode();
    return;
  }
  // One click on a pet that is showing attention is a navigation gesture.
  if (attentionActive) {
    window.hitAPI.openAttention();
    return;
  }
  if (isReacting || isDragReacting) return;

  // Non-idle: focus terminal, no reaction
  if (currentState !== "idle") {
    window.hitAPI.focusTerminal();
    return;
  }

  clickCount++;
  if (clickCount === 1) {
    firstClickDir = clientX < area.offsetWidth / 2 ? "left" : "right";
    window.hitAPI.focusTerminal();
  }

  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

  const doubleReact = _getReaction("double");
  const annoyedReact = _getReaction("annoyed");
  const leftReact = _getReaction("clickLeft");
  const rightReact = _getReaction("clickRight");

  if (clickCount >= 4 && doubleReact) {
    clickCount = 0;
    firstClickDir = null;
    const files = doubleReact.files || [doubleReact.file];
    const file = files[Math.floor(Math.random() * files.length)];
    playReaction(file, doubleReact.duration || 3500);
  } else if (clickCount >= 2) {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
      if (annoyedReact && Math.random() < 0.5) {
        firstClickDir = null;
        playReaction(annoyedReact.file, annoyedReact.duration || 3500);
      } else if (leftReact && rightReact) {
        const react = firstClickDir === "left" ? leftReact : rightReact;
        firstClickDir = null;
        playReaction(react.file, react.duration || 2500);
      } else {
        firstClickDir = null;
      }
    }, CLICK_WINDOW_MS);
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
      firstClickDir = null;
    }, CLICK_WINDOW_MS);
  }
}

function playReaction(svg, duration) {
  if (!svg) return;
  isReacting = true;
  window.hitAPI.playClickReaction(svg, duration);
  // Local timer to ungate input after duration
  setTimeout(() => { isReacting = false; }, duration);
}

// --- Drag reaction ---
function startDragReaction() {
  if (isDragReacting) return;
  if (dndEnabled) return;

  if (isReacting) {
    isReacting = false;
  }

  isDragReacting = true;
  window.hitAPI.startDragReaction();
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  window.hitAPI.endDragReaction();
}

// --- Right-click context menu ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.hitAPI.showContextMenu();
});
