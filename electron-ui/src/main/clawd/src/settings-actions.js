"use strict";

// ── Settings actions (transport-agnostic) ──
//
// Two registries:
//
//   updateRegistry  — single-field updates. Each entry is EITHER:
//
//     (a) a plain function `(value, deps) => { status, message? }` —
//         a PURE VALIDATOR with no side effect. Used for fields whose
//         truth lives entirely inside prefs (lang, soundMuted, ...).
//         Reactive UI projection lives in main.js subscribers.
//
//     (b) an object `{ validate, effect }` — a PRE-COMMIT GATE for
//         fields whose truth depends on the OUTSIDE WORLD (the OS login
//         items database, ~/.claude/settings.json, etc.). The effect
//         actually performs the system call; if it fails, the controller
//         does NOT commit, so prefs cannot drift away from system reality.
//         Effects can be sync or async; effects throw → controller wraps
//         as { status: 'error' }.
//
//     Why both forms coexist: the gate-vs-projection split is real (see
//     plan-settings-panel.md §4.2). Forcing every entry to be a gate
//     would create empty effect functions for pure-data fields and blur
//     the contract. Forcing every effect into a subscriber would make
//     "save the system call's failure" impossible because subscribers
//     run AFTER commit and can't unwind it.
//
//   commandRegistry — non-field actions like `removeTheme`, `installHooks`,
//                     `registerShortcut`. These return
//                     `{ status, message?, commit? }`. If `commit` is present,
//                     the controller calls `_commit(commit)` after success so
//                     commands can update store fields atomically with their
//                     side effects.
//
// This module imports nothing from electron, the store, or the controller.
// All deps that an action needs are passed via the second argument:
//
//   actionFn(value, { snapshot, ...injectedDeps })
//
// `injectedDeps` is whatever main.js passed to `createSettingsController`. For
// effect-bearing entries this MUST include the system helpers the effect
// needs (e.g. `setLoginItem`, `registerHooks`) — actions never `require()`
// electron or fs directly so the test suite can inject mocks.
//
// HYDRATE PATH: `controller.hydrate(partial)` runs only the validator and
// SKIPS the effect. This is how startup imports system-backed values into
// prefs without writing them right back. Object-form entries must therefore
// keep validate side-effect-free.

const { CURRENT_VERSION, AGENT_FLAGS } = require("./prefs");

// ── Validator helpers ──

function requireBoolean(key) {
  return function (value) {
    if (typeof value !== "boolean") {
      return { status: "error", message: `${key} must be a boolean` };
    }
    return { status: "ok" };
  };
}

function requireFiniteNumber(key) {
  return function (value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { status: "error", message: `${key} must be a finite number` };
    }
    return { status: "ok" };
  };
}

function requireEnum(key, allowed) {
  return function (value) {
    if (!allowed.includes(value)) {
      return {
        status: "error",
        message: `${key} must be one of: ${allowed.join(", ")}`,
      };
    }
    return { status: "ok" };
  };
}

function requireString(key, { allowEmpty = false } = {}) {
  return function (value) {
    if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
      return { status: "error", message: `${key} must be a non-empty string` };
    }
    return { status: "ok" };
  };
}

function requirePlainObject(key) {
  return function (value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status: "error", message: `${key} must be a plain object` };
    }
    return { status: "ok" };
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const THEME_OVERRIDE_RESERVED_KEYS = new Set(["states", "tiers", "timings"]);
const TIER_OVERRIDE_GROUPS = new Set(["workingTiers", "jugglingTiers"]);

function cloneStateOverrides(themeMap) {
  const out = {};
  if (!isPlainObject(themeMap)) return out;
  if (isPlainObject(themeMap.states)) {
    for (const [stateKey, entry] of Object.entries(themeMap.states)) {
      if (isPlainObject(entry)) out[stateKey] = { ...entry };
    }
  }
  for (const [key, entry] of Object.entries(themeMap)) {
    if (THEME_OVERRIDE_RESERVED_KEYS.has(key)) continue;
    if (!out[key] && isPlainObject(entry)) out[key] = { ...entry };
  }
  return out;
}

function cloneTierOverrides(themeMap, tierGroup) {
  const out = {};
  if (!isPlainObject(themeMap) || !isPlainObject(themeMap.tiers)) return out;
  const group = themeMap.tiers[tierGroup];
  if (!isPlainObject(group)) return out;
  for (const [originalFile, entry] of Object.entries(group)) {
    if (isPlainObject(entry)) out[originalFile] = { ...entry };
  }
  return out;
}

function cloneAutoReturnOverrides(themeMap) {
  const out = {};
  if (!isPlainObject(themeMap) || !isPlainObject(themeMap.timings)) return out;
  const autoReturn = themeMap.timings.autoReturn;
  if (!isPlainObject(autoReturn)) return out;
  for (const [stateKey, value] of Object.entries(autoReturn)) {
    if (typeof value === "number" && Number.isFinite(value)) out[stateKey] = value;
  }
  return out;
}

function buildThemeOverrideMap({ states, workingTiers, jugglingTiers, autoReturn }) {
  const out = {};
  if (states && Object.keys(states).length > 0) out.states = states;
  const tiers = {};
  if (workingTiers && Object.keys(workingTiers).length > 0) tiers.workingTiers = workingTiers;
  if (jugglingTiers && Object.keys(jugglingTiers).length > 0) tiers.jugglingTiers = jugglingTiers;
  if (Object.keys(tiers).length > 0) out.tiers = tiers;
  if (autoReturn && Object.keys(autoReturn).length > 0) out.timings = { autoReturn };
  return out;
}

function normalizeTransitionPayload(transition) {
  if (!isPlainObject(transition)) return null;
  const out = {};
  if (typeof transition.in === "number" && Number.isFinite(transition.in) && transition.in >= 0) out.in = transition.in;
  if (typeof transition.out === "number" && Number.isFinite(transition.out) && transition.out >= 0) out.out = transition.out;
  return Object.keys(out).length > 0 ? out : null;
}

// ── updateRegistry ──
// Maps prefs field name → validator. Controller looks up by key and runs.

const updateRegistry = {
  // ── Window state ──
  x: requireFiniteNumber("x"),
  y: requireFiniteNumber("y"),
  size(value) {
    if (typeof value !== "string") {
      return { status: "error", message: "size must be a string" };
    }
    if (value === "S" || value === "M" || value === "L") return { status: "ok" };
    if (/^P:\d+(?:\.\d+)?$/.test(value)) return { status: "ok" };
    return {
      status: "error",
      message: `size must be S/M/L or P:<num>, got: ${value}`,
    };
  },

  // ── Mini mode persisted state ──
  miniMode: requireBoolean("miniMode"),
  miniEdge: requireEnum("miniEdge", ["left", "right"]),
  preMiniX: requireFiniteNumber("preMiniX"),
  preMiniY: requireFiniteNumber("preMiniY"),
  positionSaved: requireBoolean("positionSaved"),

  // ── Pure data prefs (function-form: validator only) ──
  lang: requireEnum("lang", ["en", "zh", "ko"]),
  soundMuted: requireBoolean("soundMuted"),
  bubbleFollowPet: requireBoolean("bubbleFollowPet"),
  hideBubbles: requireBoolean("hideBubbles"),
  showSessionId: requireBoolean("showSessionId"),

  // ── System-backed prefs (object-form: validate + effect pre-commit gate) ──
  //
  // autoStartWithClaude: writes/removes a SessionStart hook in
  //   ~/.claude/settings.json via hooks/install.js. Failure to write the file
  //   (permission denied, disk full, corrupt JSON) MUST prevent the prefs
  //   commit so the UI never shows "on" while the file is unchanged.
  autoStartWithClaude: {
    validate: requireBoolean("autoStartWithClaude"),
    effect(value, deps) {
      if (deps && deps.snapshot && deps.snapshot.manageClaudeHooksAutomatically === false) {
        return { status: "ok", noop: true };
      }
      if (!deps || typeof deps.installAutoStart !== "function" || typeof deps.uninstallAutoStart !== "function") {
        return {
          status: "error",
          message: "autoStartWithClaude effect requires installAutoStart/uninstallAutoStart deps",
        };
      }
      try {
        if (value) deps.installAutoStart();
        else deps.uninstallAutoStart();
        return { status: "ok" };
      } catch (err) {
        return {
          status: "error",
          message: `autoStartWithClaude: ${err && err.message}`,
        };
      }
    },
  },

  manageClaudeHooksAutomatically: {
    validate: requireBoolean("manageClaudeHooksAutomatically"),
    effect(value, deps) {
      if (
        !deps
        || typeof deps.syncClaudeHooksNow !== "function"
        || typeof deps.startClaudeSettingsWatcher !== "function"
        || typeof deps.stopClaudeSettingsWatcher !== "function"
      ) {
        return {
          status: "error",
          message: "manageClaudeHooksAutomatically effect requires syncClaudeHooksNow/startClaudeSettingsWatcher/stopClaudeSettingsWatcher deps",
        };
      }
      try {
        if (value) {
          deps.syncClaudeHooksNow();
          deps.startClaudeSettingsWatcher();
        } else {
          deps.stopClaudeSettingsWatcher();
        }
        return { status: "ok" };
      } catch (err) {
        return {
          status: "error",
          message: `manageClaudeHooksAutomatically: ${err && err.message}`,
        };
      }
    },
  },

  // openAtLogin: writes the OS login item entry. Truth lives in the OS
  //   (LaunchAgent on macOS, Registry Run key on Windows, ~/.config/autostart
  //   on Linux). Effect proxies to a deps-injected setter so platform branching
  //   stays in main.js. See main.js's hydrateSystemBackedSettings() for the
  //   inverse direction (system → prefs on first run).
  openAtLogin: {
    validate: requireBoolean("openAtLogin"),
    effect(value, deps) {
      if (!deps || typeof deps.setOpenAtLogin !== "function") {
        return {
          status: "error",
          message: "openAtLogin effect requires setOpenAtLogin dep",
        };
      }
      try {
        deps.setOpenAtLogin(value);
        return { status: "ok" };
      } catch (err) {
        return {
          status: "error",
          message: `openAtLogin: ${err && err.message}`,
        };
      }
    },
  },

  // openAtLoginHydrated is set exactly once by hydrateSystemBackedSettings()
  //   on first run after the openAtLogin field is added. Pure validator —
  //   no effect. After hydration prefs becomes the source of truth and the
  //   user-visible toggle goes through the openAtLogin gate above.
  openAtLoginHydrated: requireBoolean("openAtLoginHydrated"),

  // ── macOS visibility (cross-field validation) ──
  showTray(value, { snapshot }) {
    if (typeof value !== "boolean") {
      return { status: "error", message: "showTray must be a boolean" };
    }
    if (!value && snapshot && snapshot.showDock === false) {
      return {
        status: "error",
        message: "Cannot hide Menu Bar while Dock is also hidden — Clawd would become unquittable.",
      };
    }
    return { status: "ok" };
  },
  showDock(value, { snapshot }) {
    if (typeof value !== "boolean") {
      return { status: "error", message: "showDock must be a boolean" };
    }
    if (!value && snapshot && snapshot.showTray === false) {
      return {
        status: "error",
        message: "Cannot hide Dock while Menu Bar is also hidden — Clawd would become unquittable.",
      };
    }
    return { status: "ok" };
  },

  // Strict activation gate. Startup uses the lenient path + hydrate() so
  // a deleted theme can't brick boot without polluting this effect.
  theme: {
    validate: requireString("theme"),
    effect(value, deps) {
      if (!deps || typeof deps.activateTheme !== "function") {
        return {
          status: "error",
          message: "theme effect requires activateTheme dep",
        };
      }
      try {
        const snapshot = (deps && deps.snapshot) || {};
        const currentOverrides = snapshot.themeOverrides || {};
        deps.activateTheme(value, null, currentOverrides[value] || null);
        return { status: "ok" };
      } catch (err) {
        return {
          status: "error",
          message: `theme: ${err && err.message}`,
        };
      }
    },
  },

  // ── Phase 2/3 placeholders — schema reserves these so applyUpdate accepts them ──
  agents: requirePlainObject("agents"),
  themeOverrides: requirePlainObject("themeOverrides"),

  // Phase 3b-swap: per-theme variant selection. NO effect — the runtime switch
  // runs through the `setThemeSelection` command which atomically commits
  // `theme` + `themeVariant` after calling activateTheme(themeId, variantId).
  // Letting this field have an effect would double-activate when the UI
  // updates `theme` and `themeVariant` separately.
  themeVariant: requirePlainObject("themeVariant"),

  // ── Internal — version is owned by prefs.js / migrate(), shouldn't normally
  //    be set via applyUpdate, but we accept it so programmatic upgrades work. ──
  version(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
      return { status: "error", message: "version must be a positive number" };
    }
    if (value > CURRENT_VERSION) {
      return {
        status: "error",
        message: `version ${value} is newer than supported (${CURRENT_VERSION})`,
      };
    }
    return { status: "ok" };
  },
};

// ── commandRegistry ──
// Non-field actions. Phase 0 has only stubs — they'll be filled in by later phases.

function notImplemented(name) {
  return function () {
    return {
      status: "error",
      message: `${name}: not implemented yet (Phase 0 stub)`,
    };
  };
}

// setAgentFlag — atomic single-agent, single-flag toggle.
// Payload `{ agentId, flag, value }` where flag ∈ AGENT_FLAGS.
//
// Flags:
//   enabled             — master: event stream on/off
//   permissionsEnabled  — sub: bubble UI on/off (events still flow)
//
// Main + sub share one command so rapid toggles serialize under the same
// controller lockKey — two separate commands would lost-update the
// agents object.
const _validateAgentFlagId = requireString("setAgentFlag.agentId");
const _validateAgentFlagValue = requireBoolean("setAgentFlag.value");
function setAgentFlag(payload, deps) {
  if (!payload || typeof payload !== "object") {
    return { status: "error", message: "setAgentFlag: payload must be an object" };
  }
  const { agentId, flag, value } = payload;
  const idCheck = _validateAgentFlagId(agentId);
  if (idCheck.status !== "ok") return idCheck;
  if (typeof flag !== "string" || !AGENT_FLAGS.includes(flag)) {
    return {
      status: "error",
      message: `setAgentFlag.flag must be one of: ${AGENT_FLAGS.join(", ")}`,
    };
  }
  const valueCheck = _validateAgentFlagValue(value);
  if (valueCheck.status !== "ok") return valueCheck;
  const snapshot = deps && deps.snapshot;
  const currentAgents = (snapshot && snapshot.agents) || {};
  const currentEntry = currentAgents[agentId];
  const currentValue =
    currentEntry && typeof currentEntry[flag] === "boolean" ? currentEntry[flag] : true;
  if (currentValue === value) {
    return { status: "ok", noop: true };
  }

  try {
    if (flag === "enabled") {
      if (!value) {
        if (typeof deps.stopMonitorForAgent === "function") deps.stopMonitorForAgent(agentId);
        if (typeof deps.clearSessionsByAgent === "function") deps.clearSessionsByAgent(agentId);
        if (typeof deps.dismissPermissionsByAgent === "function") deps.dismissPermissionsByAgent(agentId);
      } else {
        if (typeof deps.startMonitorForAgent === "function") deps.startMonitorForAgent(agentId);
      }
    } else if (flag === "permissionsEnabled") {
      if (!value && typeof deps.dismissPermissionsByAgent === "function") {
        deps.dismissPermissionsByAgent(agentId);
      }
    }
  } catch (err) {
    return {
      status: "error",
      message: `setAgentFlag side effect threw: ${err && err.message}`,
    };
  }

  const nextEntry = { ...(currentEntry || {}), [flag]: value };
  const nextAgents = { ...currentAgents, [agentId]: nextEntry };
  return { status: "ok", commit: { agents: nextAgents } };
}

const _validateRemoveThemeId = requireString("removeTheme.themeId");
async function removeTheme(payload, deps) {
  const themeId = typeof payload === "string" ? payload : (payload && payload.themeId);
  const idCheck = _validateRemoveThemeId(themeId);
  if (idCheck.status !== "ok") return idCheck;

  if (!deps || typeof deps.getThemeInfo !== "function" || typeof deps.removeThemeDir !== "function") {
    return {
      status: "error",
      message: "removeTheme effect requires getThemeInfo and removeThemeDir deps",
    };
  }

  let info;
  try {
    info = deps.getThemeInfo(themeId);
  } catch (err) {
    return { status: "error", message: `removeTheme: ${err && err.message}` };
  }
  if (!info) {
    return { status: "error", message: `removeTheme: theme "${themeId}" not found` };
  }
  if (info.builtin) {
    return { status: "error", message: `removeTheme: cannot delete built-in theme "${themeId}"` };
  }
  if (info.active) {
    return {
      status: "error",
      message: `removeTheme: cannot delete active theme "${themeId}" — switch to another theme first`,
    };
  }

  try {
    await deps.removeThemeDir(themeId);
  } catch (err) {
    return { status: "error", message: `removeTheme: ${err && err.message}` };
  }

  const snapshot = deps.snapshot || {};
  const currentOverrides = snapshot.themeOverrides || {};
  const currentVariantMap = snapshot.themeVariant || {};
  const nextCommit = {};
  if (currentOverrides[themeId]) {
    const nextOverrides = { ...currentOverrides };
    delete nextOverrides[themeId];
    nextCommit.themeOverrides = nextOverrides;
  }
  if (currentVariantMap[themeId] !== undefined) {
    const nextVariantMap = { ...currentVariantMap };
    delete nextVariantMap[themeId];
    nextCommit.themeVariant = nextVariantMap;
  }
  if (Object.keys(nextCommit).length > 0) {
    return { status: "ok", commit: nextCommit };
  }
  return { status: "ok" };
}

// Phase 3b-swap: atomic theme + variant switch.
//   payload: { themeId: string, variantId?: string }
// Why a dedicated command vs. letting the `theme` field effect handle it:
// the theme effect only commits `{theme}`, so the dirty "author deleted the
// variant user had selected" scenario leaves `themeVariant[themeId]` pointing
// at a dead variantId. Fix: call activateTheme which lenient-fallbacks unknown
// variants, read back the actually-resolved variantId, and commit both fields.
// See docs/plan-settings-panel-3b-swap.md §6.2 "Runtime 切换路径".
const _validateSetThemeSelectionThemeId = requireString("setThemeSelection.themeId");
function setThemeSelection(payload, deps) {
  const themeId = typeof payload === "string" ? payload : (payload && payload.themeId);
  const variantIdInput = (payload && typeof payload === "object") ? payload.variantId : null;
  const idCheck = _validateSetThemeSelectionThemeId(themeId);
  if (idCheck.status !== "ok") return idCheck;
  if (variantIdInput != null && (typeof variantIdInput !== "string" || !variantIdInput)) {
    return { status: "error", message: "setThemeSelection.variantId must be a non-empty string when provided" };
  }

  if (!deps || typeof deps.activateTheme !== "function") {
    return { status: "error", message: "setThemeSelection effect requires activateTheme dep" };
  }

  const snapshot = deps.snapshot || {};
  const currentVariantMap = snapshot.themeVariant || {};
  const currentOverrides = snapshot.themeOverrides || {};
  const targetVariant = variantIdInput || currentVariantMap[themeId] || "default";
  const targetOverrideMap = currentOverrides[themeId] || null;

  let resolved;
  try {
    resolved = deps.activateTheme(themeId, targetVariant, targetOverrideMap);
  } catch (err) {
    return { status: "error", message: `setThemeSelection: ${err && err.message}` };
  }
  // activateTheme returns { themeId, variantId } — the variantId here reflects
  // lenient fallback (dead variant → "default"). We commit the resolved value
  // so prefs self-heal away from stale ids.
  const resolvedVariant = (resolved && typeof resolved === "object" && typeof resolved.variantId === "string")
    ? resolved.variantId
    : targetVariant;

  const nextVariantMap = { ...currentVariantMap, [themeId]: resolvedVariant };
  return {
    status: "ok",
    commit: { theme: themeId, themeVariant: nextVariantMap },
  };
}

// Phase 3b: 仅允许 override 这 5 个"打扰态"——其他 state 要么不走 theme.states
// 这条路（idle/working/juggling 走 tiers/闭包），要么不是打扰（idle/sleeping 等
// 关了会让桌宠消失）。白名单硬钉在 action 层，UI 只是表象。
const ONESHOT_OVERRIDE_STATES = new Set([
  "attention", "error", "sweeping", "notification", "carrying",
]);

const _validateThemeOverrideThemeId = requireString("setThemeOverrideDisabled.themeId");
function setThemeOverrideDisabled(payload, deps) {
  if (!payload || typeof payload !== "object") {
    return { status: "error", message: "setThemeOverrideDisabled: payload must be an object" };
  }
  const { themeId, stateKey, disabled } = payload;
  const idCheck = _validateThemeOverrideThemeId(themeId);
  if (idCheck.status !== "ok") return idCheck;
  if (typeof stateKey !== "string" || !ONESHOT_OVERRIDE_STATES.has(stateKey)) {
    return {
      status: "error",
      message: `setThemeOverrideDisabled.stateKey must be one of: ${[...ONESHOT_OVERRIDE_STATES].join(", ")}`,
    };
  }
  if (typeof disabled !== "boolean") {
    return { status: "error", message: "setThemeOverrideDisabled.disabled must be a boolean" };
  }

  const snapshot = (deps && deps.snapshot) || {};
  const currentOverrides = snapshot.themeOverrides || {};
  const currentThemeMap = currentOverrides[themeId] || {};
  const currentStates = cloneStateOverrides(currentThemeMap);
  const currentEntry = currentStates[stateKey];
  const currentDisabled = !!(currentEntry && currentEntry.disabled === true);
  if (currentDisabled === disabled) {
    return { status: "ok", noop: true };
  }

  const nextStates = { ...currentStates };
  if (disabled) {
    nextStates[stateKey] = { ...(currentEntry || {}), disabled: true };
  } else {
    const preserved = { ...(currentEntry || {}) };
    delete preserved.disabled;
    if (Object.keys(preserved).length > 0) nextStates[stateKey] = preserved;
    else delete nextStates[stateKey];
  }

  const nextThemeMap = buildThemeOverrideMap({
    states: nextStates,
    workingTiers: cloneTierOverrides(currentThemeMap, "workingTiers"),
    jugglingTiers: cloneTierOverrides(currentThemeMap, "jugglingTiers"),
    autoReturn: cloneAutoReturnOverrides(currentThemeMap),
  });
  const nextOverrides = { ...currentOverrides };
  if (Object.keys(nextThemeMap).length > 0) {
    nextOverrides[themeId] = nextThemeMap;
  } else {
    delete nextOverrides[themeId];
  }
  return { status: "ok", commit: { themeOverrides: nextOverrides } };
}

const _validateAnimationOverrideThemeId = requireString("setAnimationOverride.themeId");
function setAnimationOverride(payload, deps) {
  if (!isPlainObject(payload)) {
    return { status: "error", message: "setAnimationOverride: payload must be an object" };
  }
  const { themeId, slotType } = payload;
  const idCheck = _validateAnimationOverrideThemeId(themeId);
  if (idCheck.status !== "ok") return idCheck;
  if (slotType !== "state" && slotType !== "tier") {
    return { status: "error", message: "setAnimationOverride.slotType must be 'state' or 'tier'" };
  }

  const touchesFile = Object.prototype.hasOwnProperty.call(payload, "file");
  const touchesTransition = Object.prototype.hasOwnProperty.call(payload, "transition");
  const touchesAutoReturn = Object.prototype.hasOwnProperty.call(payload, "autoReturnMs");
  if (!touchesFile && !touchesTransition && !touchesAutoReturn) {
    return { status: "error", message: "setAnimationOverride must change file, transition, or autoReturnMs" };
  }

  if (touchesFile && payload.file !== null && (typeof payload.file !== "string" || !payload.file)) {
    return { status: "error", message: "setAnimationOverride.file must be null or a non-empty string" };
  }
  if (touchesTransition && payload.transition !== null && !normalizeTransitionPayload(payload.transition)) {
    return { status: "error", message: "setAnimationOverride.transition must contain finite non-negative in/out values" };
  }
  if (touchesAutoReturn && payload.autoReturnMs !== null) {
    if (typeof payload.autoReturnMs !== "number" || !Number.isFinite(payload.autoReturnMs)) {
      return { status: "error", message: "setAnimationOverride.autoReturnMs must be null or a finite number" };
    }
    if (payload.autoReturnMs < 500 || payload.autoReturnMs > 60000) {
      return { status: "error", message: "setAnimationOverride.autoReturnMs must be between 500 and 60000" };
    }
  }

  const snapshot = (deps && deps.snapshot) || {};
  const currentOverrides = snapshot.themeOverrides || {};
  const currentThemeMap = currentOverrides[themeId] || {};
  const nextStates = cloneStateOverrides(currentThemeMap);
  const nextWorkingTiers = cloneTierOverrides(currentThemeMap, "workingTiers");
  const nextJugglingTiers = cloneTierOverrides(currentThemeMap, "jugglingTiers");
  const nextAutoReturn = cloneAutoReturnOverrides(currentThemeMap);

  if (slotType === "state") {
    if (typeof payload.stateKey !== "string" || !payload.stateKey) {
      return { status: "error", message: "setAnimationOverride.stateKey must be a non-empty string for state slots" };
    }
    const stateKey = payload.stateKey;
    const nextEntry = { ...(nextStates[stateKey] || {}) };
    if (touchesFile) {
      if (payload.file === null) {
        delete nextEntry.file;
        delete nextEntry.sourceThemeId;
      } else {
        nextEntry.file = payload.file;
      }
    }
    if (touchesTransition) {
      if (payload.transition === null) delete nextEntry.transition;
      else nextEntry.transition = normalizeTransitionPayload(payload.transition);
    }
    if (Object.keys(nextEntry).length > 0) nextStates[stateKey] = nextEntry;
    else delete nextStates[stateKey];

    if (touchesAutoReturn) {
      if (payload.autoReturnMs === null) delete nextAutoReturn[stateKey];
      else nextAutoReturn[stateKey] = payload.autoReturnMs;
    }
  } else {
    const { tierGroup, originalFile } = payload;
    if (!TIER_OVERRIDE_GROUPS.has(tierGroup)) {
      return { status: "error", message: "setAnimationOverride.tierGroup must be workingTiers or jugglingTiers" };
    }
    if (typeof originalFile !== "string" || !originalFile) {
      return { status: "error", message: "setAnimationOverride.originalFile must be a non-empty string for tier slots" };
    }
    if (touchesAutoReturn) {
      return { status: "error", message: "setAnimationOverride.autoReturnMs is only supported for state slots" };
    }
    const tierMap = tierGroup === "workingTiers" ? nextWorkingTiers : nextJugglingTiers;
    const nextEntry = { ...(tierMap[originalFile] || {}) };
    if (touchesFile) {
      if (payload.file === null) {
        delete nextEntry.file;
        delete nextEntry.sourceThemeId;
      } else {
        nextEntry.file = payload.file;
      }
    }
    if (touchesTransition) {
      if (payload.transition === null) delete nextEntry.transition;
      else nextEntry.transition = normalizeTransitionPayload(payload.transition);
    }
    if (Object.keys(nextEntry).length > 0) tierMap[originalFile] = nextEntry;
    else delete tierMap[originalFile];
  }

  const nextThemeMap = buildThemeOverrideMap({
    states: nextStates,
    workingTiers: nextWorkingTiers,
    jugglingTiers: nextJugglingTiers,
    autoReturn: nextAutoReturn,
  });
  const nextOverrides = { ...currentOverrides };
  if (Object.keys(nextThemeMap).length > 0) nextOverrides[themeId] = nextThemeMap;
  else delete nextOverrides[themeId];

  if (JSON.stringify(nextOverrides) === JSON.stringify(currentOverrides)) {
    return { status: "ok", noop: true };
  }

  const activeThemeId = snapshot.theme;
  if (themeId === activeThemeId) {
    if (!deps || typeof deps.activateTheme !== "function") {
      return { status: "error", message: "setAnimationOverride effect requires activateTheme dep for the active theme" };
    }
    try {
      deps.activateTheme(themeId, null, nextThemeMap);
    } catch (err) {
      return { status: "error", message: `setAnimationOverride: ${err && err.message}` };
    }
  }

  return { status: "ok", commit: { themeOverrides: nextOverrides } };
}

const _validateResetOverridesThemeId = requireString("resetThemeOverrides.themeId");
function resetThemeOverrides(payload, deps) {
  const themeId = typeof payload === "string" ? payload : (payload && payload.themeId);
  const idCheck = _validateResetOverridesThemeId(themeId);
  if (idCheck.status !== "ok") return idCheck;

  const snapshot = (deps && deps.snapshot) || {};
  const currentOverrides = snapshot.themeOverrides || {};
  if (!currentOverrides[themeId]) {
    return { status: "ok", noop: true };
  }

  const activeThemeId = snapshot.theme;
  if (themeId === activeThemeId) {
    if (!deps || typeof deps.activateTheme !== "function") {
      return { status: "error", message: "resetThemeOverrides effect requires activateTheme dep for the active theme" };
    }
    try {
      deps.activateTheme(themeId, null, null);
    } catch (err) {
      return { status: "error", message: `resetThemeOverrides: ${err && err.message}` };
    }
  }

  const nextOverrides = { ...currentOverrides };
  delete nextOverrides[themeId];
  return { status: "ok", commit: { themeOverrides: nextOverrides } };
}

function installHooks(_payload, deps) {
  if (!deps || typeof deps.syncClaudeHooksNow !== "function") {
    return {
      status: "error",
      message: "installHooks requires syncClaudeHooksNow dep",
    };
  }
  try {
    deps.syncClaudeHooksNow();
    return { status: "ok" };
  } catch (err) {
    return { status: "error", message: `installHooks: ${err && err.message}` };
  }
}

function uninstallHooks(_payload, deps) {
  if (
    !deps
    || typeof deps.uninstallClaudeHooksNow !== "function"
    || typeof deps.stopClaudeSettingsWatcher !== "function"
  ) {
    return {
      status: "error",
      message: "uninstallHooks requires uninstallClaudeHooksNow and stopClaudeSettingsWatcher deps",
    };
  }

  const shouldRestoreWatcher = !!(deps.snapshot && deps.snapshot.manageClaudeHooksAutomatically);
  try {
    deps.stopClaudeSettingsWatcher();
    deps.uninstallClaudeHooksNow();
    return { status: "ok", commit: { manageClaudeHooksAutomatically: false } };
  } catch (err) {
    if (shouldRestoreWatcher && typeof deps.startClaudeSettingsWatcher === "function") {
      try { deps.startClaudeSettingsWatcher(); } catch {}
    }
    return { status: "error", message: `uninstallHooks: ${err && err.message}` };
  }
}

const commandRegistry = {
  removeTheme,
  installHooks,
  uninstallHooks,
  registerShortcut: notImplemented("registerShortcut"),
  setAgentFlag,
  setAnimationOverride,
  setThemeOverrideDisabled,
  resetThemeOverrides,
  setThemeSelection,
};

module.exports = {
  updateRegistry,
  commandRegistry,
  ONESHOT_OVERRIDE_STATES,
  // Exposed for tests
  requireBoolean,
  requireFiniteNumber,
  requireEnum,
  requireString,
  requirePlainObject,
};
