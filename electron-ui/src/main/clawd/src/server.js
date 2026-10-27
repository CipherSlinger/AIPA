// src/server.js — HTTP server + routes (/state, /permission, /health)
// Extracted from main.js L1337-1528

const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
  DEFAULT_SERVER_PORT,
  clearRuntimeConfig,
  ensureAuthToken,
  getPortCandidates,
  readRuntimePort,
  writeRuntimeConfig,
} = require("../hooks/server-config");

// Request body caps. Kept as constants so the parser can bail before buffering
// an attacker-sized payload.
const MAX_STATE_BODY_BYTES = 1024;
const MAX_PERMISSION_BODY_BYTES = 524288;

/** Constant-time comparison so a local attacker can't recover the token byte-by-byte. */
function tokensMatch(expected, received) {
  if (typeof expected !== "string" || typeof received !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Extract the bearer token from an Authorization header, falling back to the
 * X-AIPA-Token header (handy for tools that can only set custom headers).
 */
function extractRequestToken(req) {
  const auth = req.headers && req.headers["authorization"];
  if (typeof auth === "string") {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  const custom = req.headers && req.headers["x-aipa-token"];
  return typeof custom === "string" ? custom.trim() : null;
}

/**
 * Reject requests that a browser could have originated. A page cannot forge
 * the Host header, and it always attaches an Origin to cross-origin POSTs, so
 * requiring `Host: 127.0.0.1:<port>`/`localhost:<port>` and an absent (or
 * same-origin) Origin closes the DNS-rebinding path even before the token
 * check runs.
 */
function isLocalHostHeader(hostHeader, port) {
  if (typeof hostHeader !== "string" || !hostHeader) return false;
  const expected = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return expected.has(hostHeader.toLowerCase());
}

function isBrowserOrigin(originHeader, port) {
  if (originHeader === undefined || originHeader === null) return false;
  if (typeof originHeader !== "string") return true;
  // Non-browser clients (hook scripts) never send Origin. Anything that does
  // is a web context; only our own loopback page is tolerated, and no page
  // the app ships needs to call these endpoints.
  try {
    const origin = new URL(originHeader);
    return !(origin.protocol === "http:"
      && (origin.hostname === "127.0.0.1" || origin.hostname === "localhost")
      && origin.port === String(port));
  } catch {
    return true;
  }
}

// ExitPlanMode (Plan Review) and AskUserQuestion (elicitation) happen to
// travel through /permission, but they're UX flows — not approvals the
// sub-gate is named for. Silencing them would break plan-mode and leave
// CC hanging on an elicitation.
function shouldBypassCCBubble(ctx, toolName, agentId) {
  if (toolName === "ExitPlanMode" || toolName === "AskUserQuestion") return false;
  if (typeof ctx.isAgentPermissionsEnabled !== "function") return false;
  return !ctx.isAgentPermissionsEnabled(agentId);
}

function shouldBypassOpencodeBubble(ctx) {
  if (typeof ctx.isAgentPermissionsEnabled !== "function") return false;
  return !ctx.isAgentPermissionsEnabled("opencode");
}

module.exports = function initServer(ctx) {

const fsApi = ctx.fs || fs;
const pathApi = ctx.path || path;
const osApi = ctx.os || os;
const createHttpServer = ctx.createHttpServer || http.createServer.bind(http);
const setImmediateFn = ctx.setImmediate || setImmediate;
const setTimeoutFn = ctx.setTimeout || setTimeout;
const clearTimeoutFn = ctx.clearTimeout || clearTimeout;
const nowFn = typeof ctx.now === "function" ? ctx.now : Date.now;
const clearRuntimeConfigFn = ctx.clearRuntimeConfig || clearRuntimeConfig;
const getPortCandidatesFn = ctx.getPortCandidates || getPortCandidates;
const readRuntimePortFn = ctx.readRuntimePort || readRuntimePort;
const writeRuntimeConfigFn = ctx.writeRuntimeConfig || writeRuntimeConfig;
const settingsWatchDebounceMs = Number.isFinite(ctx.settingsWatchDebounceMs) ? ctx.settingsWatchDebounceMs : 1000;
const settingsWatchRateLimitMs = Number.isFinite(ctx.settingsWatchRateLimitMs) ? ctx.settingsWatchRateLimitMs : 5000;

let httpServer = null;
let activeServerPort = null;
let settingsWatcher = null;
let settingsWatchDebounceTimer = null;
let settingsWatchLastSyncTime = 0;

// Strict opt-in: an absent/undefined value (older prefs files, tests that do
// not pass the flag) means "do not touch the user's agent configs".
function shouldManageClaudeHooks() {
  return ctx.manageClaudeHooksAutomatically === true;
}

// Non-Claude agents (Gemini/Cursor/CodeBuddy/Kiro/opencode) share the same
// opt-in switch — there is no separate per-agent consent UI, and silently
// rewriting those tools' configs is exactly what the opt-in exists to prevent.
function shouldManageOtherAgentHooks() {
  return ctx.manageClaudeHooksAutomatically === true;
}

function getClaudeSettingsDir() {
  return typeof ctx.claudeSettingsDir === "string"
    ? ctx.claudeSettingsDir
    : pathApi.join(osApi.homedir(), ".claude");
}

function getClaudeSettingsPath() {
  return typeof ctx.claudeSettingsPath === "string"
    ? ctx.claudeSettingsPath
    : pathApi.join(getClaudeSettingsDir(), SETTINGS_FILENAME);
}

function getHookServerPort() {
  return activeServerPort || readRuntimePortFn() || DEFAULT_SERVER_PORT;
}

function syncClawdHooks() {
  try {
    // The HTTP permission hook embeds the shared token, so make sure one
    // exists before the installer serializes the settings file.
    ensureAuthToken();
    if (typeof ctx.syncClawdHooksImpl === "function") {
      return ctx.syncClawdHooksImpl({
        autoStart: ctx.autoStartWithClaude,
        port: getHookServerPort(),
      });
    }
    const { registerHooks } = require("../hooks/install.js");
    const { added, updated, removed } = registerHooks({
      silent: true,
      autoStart: ctx.autoStartWithClaude,
      port: getHookServerPort(),
    });
    if (added > 0 || updated > 0 || removed > 0) {
      console.log(`Clawd: synced hooks (added ${added}, updated ${updated}, removed ${removed})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync hooks:", err.message);
  }
}

function syncGeminiHooks() {
  try {
    if (typeof ctx.syncGeminiHooksImpl === "function") return ctx.syncGeminiHooksImpl();
    const { registerGeminiHooks } = require("../hooks/gemini-install.js");
    const { added, updated } = registerGeminiHooks({ silent: true });
    if (added > 0 || updated > 0) {
      console.log(`Clawd: synced Gemini hooks (added ${added}, updated ${updated})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync Gemini hooks:", err.message);
  }
}

function syncCodeBuddyHooks() {
  try {
    if (typeof ctx.syncCodeBuddyHooksImpl === "function") return ctx.syncCodeBuddyHooksImpl();
    const { registerCodeBuddyHooks } = require("../hooks/codebuddy-install.js");
    const { added, updated } = registerCodeBuddyHooks({ silent: true });
    if (added > 0 || updated > 0) {
      console.log(`Clawd: synced CodeBuddy hooks (added ${added}, updated ${updated})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync CodeBuddy hooks:", err.message);
  }
}

function syncKiroHooks() {
  try {
    if (typeof ctx.syncKiroHooksImpl === "function") return ctx.syncKiroHooksImpl();
    const { registerKiroHooks } = require("../hooks/kiro-install.js");
    const { added, updated } = registerKiroHooks({ silent: true });
    if (added > 0 || updated > 0) {
      console.log(`Clawd: synced Kiro hooks (added ${added}, updated ${updated})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync Kiro hooks:", err.message);
  }
}

function syncCursorHooks() {
  try {
    if (typeof ctx.syncCursorHooksImpl === "function") return ctx.syncCursorHooksImpl();
    const { registerCursorHooks } = require("../hooks/cursor-install.js");
    const { added, updated } = registerCursorHooks({ silent: true });
    if (added > 0 || updated > 0) {
      console.log(`Clawd: synced Cursor hooks (added ${added}, updated ${updated})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync Cursor hooks:", err.message);
  }
}

function syncOpencodePlugin() {
  try {
    if (typeof ctx.syncOpencodePluginImpl === "function") return ctx.syncOpencodePluginImpl();
    const { registerOpencodePlugin } = require("../hooks/opencode-install.js");
    const { added, created } = registerOpencodePlugin({ silent: true });
    if (added || created) {
      console.log(`Clawd: synced opencode plugin (added=${added}, created=${created})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync opencode plugin:", err.message);
  }
}

/**
 * Sync every non-Claude agent we support.
 *
 * `force` is for callers acting on the user's own click (the settings toggle
 * runs its effect *before* the new value is committed, so the ctx getter still
 * reads the old value at that point).
 */
function syncOtherAgentHooks(options) {
  if (!(options && options.force) && !shouldManageOtherAgentHooks()) return;
  syncGeminiHooks();
  syncCursorHooks();
  syncCodeBuddyHooks();
  syncKiroHooks();
  syncOpencodePlugin();
}

/**
 * Does ~/.claude/settings.json currently contain our hooks? Reported to the
 * settings panel. Deliberately reports false while hook management is off,
 * even if stale entries from an earlier opt-in are still on disk — the UI must
 * not imply that hooks are being managed when they are not.
 */
function areClaudeHooksInstalled() {
  if (!shouldManageClaudeHooks()) return false;
  try {
    const raw = fsApi.readFileSync(getClaudeSettingsPath(), "utf-8");
    return raw.includes(HOOK_MARKER);
  } catch {
    return false;
  }
}

function sendStateHealthResponse(res) {
  const body = JSON.stringify({ ok: true, app: CLAWD_SERVER_ID, port: getHookServerPort() });
  res.writeHead(200, {
    "Content-Type": "application/json",
    [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID,
  });
  res.end(body);
}

// Truncate large string values in objects (recursive) — bubble only needs a preview
const PREVIEW_MAX = 500;
function truncateDeep(obj, depth) {
  if ((depth || 0) > 10) return obj;
  if (Array.isArray(obj)) return obj.map(v => truncateDeep(v, (depth || 0) + 1));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = truncateDeep(v, (depth || 0) + 1);
    return out;
  }
  return typeof obj === "string" && obj.length > PREVIEW_MAX
    ? obj.slice(0, PREVIEW_MAX) + "\u2026" : obj;
}

const HOOK_MARKER = "clawd-hook.js";
const SETTINGS_FILENAME = "settings.json";
// Watch ~/.claude/ directory for settings.json overwrites (e.g. CC-Switch)
// that wipe our hooks. Re-register when hooks disappear.
// Watch the directory (not the file) because atomic rename replaces the inode
// and fs.watch on the old file silently stops firing on Windows.
function stopClaudeSettingsWatcher() {
  if (settingsWatchDebounceTimer) {
    clearTimeoutFn(settingsWatchDebounceTimer);
    settingsWatchDebounceTimer = null;
  }
  settingsWatchLastSyncTime = 0;
  if (!settingsWatcher) return false;
  try {
    settingsWatcher.close();
  } catch {}
  settingsWatcher = null;
  return true;
}

function startClaudeSettingsWatcher() {
  if (settingsWatcher) return false;
  const settingsDir = getClaudeSettingsDir();
  const settingsPath = getClaudeSettingsPath();
  try {
    settingsWatcher = fsApi.watch(settingsDir, (_event, filename) => {
      if (filename && filename !== SETTINGS_FILENAME) return;
      if (settingsWatchDebounceTimer) return;
      settingsWatchDebounceTimer = setTimeoutFn(() => {
        settingsWatchDebounceTimer = null;
        // Rate-limit: don't re-sync within 5s to avoid write wars with CC-Switch
        if (nowFn() - settingsWatchLastSyncTime < settingsWatchRateLimitMs) return;
        try {
          const raw = fsApi.readFileSync(settingsPath, "utf-8");
          if (!raw.includes(HOOK_MARKER)) {
            console.log("Clawd: hooks wiped from settings.json — re-registering");
            settingsWatchLastSyncTime = nowFn();
            syncClawdHooks();
          }
        } catch {}
      }, settingsWatchDebounceMs);
    });
    if (settingsWatcher && typeof settingsWatcher.on === "function") settingsWatcher.on("error", (err) => {
      console.warn("Clawd: settings watcher error:", err.message);
    });
    return true;
  } catch (err) {
    console.warn("Clawd: failed to watch settings directory:", err.message);
    settingsWatcher = null;
    return false;
  }
}

function startHttpServer() {
  // Load (or mint on first run) the shared secret before accepting traffic.
  // Hook scripts read the same file (see hooks/server-config.js) and the
  // optional HTTP hook carries a copy, so the token deliberately survives
  // restarts — see ensureAuthToken().
  const authToken = typeof ctx.authToken === "string" && ctx.authToken
    ? ctx.authToken
    : ensureAuthToken();

  function rejectForbidden(req, res) {
    req.resume(); // drain any body so keep-alive connections stay usable
    res.writeHead(403, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
    res.end("forbidden");
  }

  function rejectUnauthorized(req, res) {
    req.resume();
    res.writeHead(401, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
    res.end("unauthorized");
  }

  httpServer = createHttpServer((req, res) => {
    const requestPort = activeServerPort || readRuntimePortFn() || DEFAULT_SERVER_PORT;

    // ── Boundary checks, before any body is read ──
    // The listener is bound to 127.0.0.1, but check the peer too so a future
    // bind change (or a proxy) cannot silently expose the endpoints.
    // Host must name the loopback listener: browsers set it from the URL, so
    // this blocks DNS-rebinding pages that resolve their own hostname to
    // 127.0.0.1. Origin is refused outright unless it is our own loopback
    // page (nothing the app ships calls these endpoints from a web context).
    const peer = req.socket && req.socket.remoteAddress;
    const isLoopbackPeer = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
    if (!isLoopbackPeer
      || !isLocalHostHeader(req.headers && req.headers.host, requestPort)
      || isBrowserOrigin(req.headers && req.headers.origin, requestPort)) {
      rejectForbidden(req, res);
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      req.resume();
      res.writeHead(405, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID, Allow: "GET, POST" });
      res.end();
      return;
    }
    // GET /state stays open: it is the liveness probe used by hook scripts to
    // discover the port (hooks/server-config.js probePort) and carries no
    // data. Every mutating request below must present the shared token.
    if (req.method === "POST" && !tokensMatch(authToken, extractRequestToken(req))) {
      rejectUnauthorized(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/state") {
      sendStateHealthResponse(res);
    } else if (req.method === "POST" && req.url === "/state") {
      let body = "";
      let bodySize = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        bodySize += chunk.length;
        if (bodySize > MAX_STATE_BODY_BYTES) { tooLarge = true; return; }
        body += chunk;
      });
      req.on("end", () => {
        if (tooLarge) {
          res.writeHead(413);
          res.end("state payload too large");
          return;
        }
        try {
          const data = JSON.parse(body);
          const { state, svg, session_id, event } = data;
          let display_svg;
          if (data.display_svg === null) display_svg = null;
          else if (typeof data.display_svg === "string") display_svg = path.basename(data.display_svg);
          else display_svg = undefined;
          const source_pid = Number.isFinite(data.source_pid) && data.source_pid > 0 ? Math.floor(data.source_pid) : null;
          const cwd = typeof data.cwd === "string" ? data.cwd : "";
          const editor = (data.editor === "code" || data.editor === "cursor") ? data.editor : null;
          const pidChain = Array.isArray(data.pid_chain) ? data.pid_chain.filter(n => Number.isFinite(n) && n > 0) : null;
          const rawAgentPid = data.agent_pid ?? data.claude_pid ?? data.cursor_pid;
          const agentPid = Number.isFinite(rawAgentPid) && rawAgentPid > 0 ? Math.floor(rawAgentPid) : null;
          const agentId = typeof data.agent_id === "string" ? data.agent_id : "claude-code";
          const host = typeof data.host === "string" ? data.host : null;
          const headless = data.headless === true;
          // Agent gate: user disabled this agent in the settings panel. Drop
          // with 204 so hook scripts get a quick no-op response instead of
          // hanging on our HTTP connection. Still surfaces as a success code
          // so hook exit behavior is unchanged.
          if (typeof ctx.isAgentEnabled === "function" && !ctx.isAgentEnabled(agentId)) {
            res.writeHead(204, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end();
            return;
          }
          if (ctx.STATE_SVGS[state]) {
            const sid = session_id || "default";
            if (state.startsWith("mini-") && !svg) {
              res.writeHead(400);
              res.end("mini states require svg override");
              return;
            }
            if (event === "PostToolUse" || event === "PostToolUseFailure" || event === "Stop") {
              for (const perm of [...ctx.pendingPermissions]) {
                if (perm.sessionId === sid) {
                  ctx.resolvePermissionEntry(perm, "deny", "User answered in terminal");
                }
              }
            }
            if (svg) {
              const safeSvg = path.basename(svg);
              ctx.setState(state, safeSvg);
            } else {
              ctx.updateSession(sid, state, event, source_pid, cwd, editor, pidChain, agentPid, agentId, host, headless, display_svg);
            }
            res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end("ok");
          } else {
            res.writeHead(400);
            res.end("unknown state");
          }
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else if (req.method === "POST" && req.url === "/permission") {
      ctx.permLog(`/permission hit | DND=${ctx.doNotDisturb} pending=${ctx.pendingPermissions.length}`);
      let body = "";
      let bodySize = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        bodySize += chunk.length;
        if (bodySize > MAX_PERMISSION_BODY_BYTES) { tooLarge = true; return; }
        body += chunk;
      });
      req.on("end", () => {
        if (tooLarge) {
          ctx.permLog("SKIPPED: permission payload too large");
          ctx.sendPermissionResponse(res, "deny", "Permission request too large for Clawd bubble; answer in terminal");
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end("bad json");
          return;
        }

        try {
          // ── opencode branch ──
          // opencode plugin (agents/opencode.js) posts fire-and-forget. We
          // always 200 ACK immediately; the user's decision routes through
          // a separate REST call to opencode's own server (see permission.js
          // replyOpencodePermission). This means no res is retained on the
          // permEntry, no res.on("close") abort handler, and hideBubbles
          // degrades to "TUI only" (plugin doesn't wait on us).
          //
          // DND handling is branch-specific: opencode cannot observe the
          // HTTP response (fire-and-forget), so a generic HTTP deny would
          // leave the TUI hanging until timeout. Instead we route DND
          // through the same reverse bridge the plugin uses for replies.
          if (data.agent_id === "opencode") {
            res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end("ok");

            // Agent gate: same silent-drop semantics as DND — plugin is
            // fire-and-forget, so 200 ACK satisfies it; skipping the bridge
            // reply lets the opencode TUI fall back to its built-in prompt.
            if (typeof ctx.isAgentEnabled === "function" && !ctx.isAgentEnabled("opencode")) {
              ctx.permLog("opencode disabled → silent drop, TUI fallback");
              return;
            }

            const toolName = typeof data.tool_name === "string" && data.tool_name ? data.tool_name : "unknown";
            const rawInput = data.tool_input && typeof data.tool_input === "object" ? data.tool_input : {};
            const toolInput = truncateDeep(rawInput);
            const sessionId = typeof data.session_id === "string" ? data.session_id : "default";
            const requestId = typeof data.request_id === "string" ? data.request_id : null;
            const bridgeUrl = typeof data.bridge_url === "string" ? data.bridge_url : "";
            const bridgeToken = typeof data.bridge_token === "string" ? data.bridge_token : "";
            const alwaysCandidates = Array.isArray(data.always) ? data.always : [];
            const patterns = Array.isArray(data.patterns) ? data.patterns : [];

            ctx.permLog(`opencode perm: tool=${toolName} session=${sessionId} req=${requestId} bridge=${bridgeUrl} always=${alwaysCandidates.length}`);

            // bridge_url/bridge_token are required — this is the reverse
            // channel Clawd uses to send the decision back to the plugin,
            // which then calls opencode's in-process Hono route. Without it
            // we have no way to resolve the pending permission.
            if (!requestId || !bridgeUrl || !bridgeToken) {
              const missing = !requestId ? "request_id" : (!bridgeUrl ? "bridge_url" : "bridge_token");
              ctx.permLog(`SKIPPED opencode perm: missing ${missing}`);
              return;
            }

            // DND: drop silently — do NOT reply via bridge. opencode TUI
            // will fall back to its built-in permission prompt so the user
            // can confirm in the terminal themselves. Spike 2026-04-06
            // confirmed this works: TUI shows Allow/Reject without hanging.
            if (ctx.doNotDisturb) {
              ctx.permLog(`opencode DND → silent drop, TUI fallback — request=${requestId}`);
              return;
            }

            // No HTTP connection to hold open — only degradation is to
            // not render a bubble and let the TUI prompt handle it.
            const opencodeSubGateBypass = shouldBypassOpencodeBubble(ctx);
            if (ctx.hideBubbles || opencodeSubGateBypass) {
              ctx.permLog(`opencode bubble hidden: tool=${toolName} — TUI fallback (hideBubbles=${ctx.hideBubbles} subGateBypass=${opencodeSubGateBypass})`);
              return;
            }

            const permEntry = {
              res: null,
              abortHandler: null,
              suggestions: [],
              sessionId,
              bubble: null,
              hideTimer: null,
              toolName,
              toolInput,
              resolvedSuggestion: null,
              createdAt: Date.now(),
              agentId: "opencode",
              isOpencode: true,
              opencodeRequestId: requestId,
              opencodeBridgeUrl: bridgeUrl,
              opencodeBridgeToken: bridgeToken,
              opencodeAlwaysCandidates: alwaysCandidates,
              opencodePatterns: patterns,
            };
            ctx.pendingPermissions.push(permEntry);
            ctx.permLog(`opencode showing bubble: tool=${toolName} session=${sessionId}`);
            try {
              ctx.showPermissionBubble(permEntry);
            } catch (bubbleErr) {
              // If bubble creation fails (BrowserWindow error, bad html,
              // window-positioning crash, etc), we have already 200-ACKed
              // the plugin and it is waiting for a bridge reply. Without
              // this rescue the permEntry would linger in pendingPermissions
              // until the opencode TUI hits its own timeout (minutes).
              // Pop the ghost entry and send an immediate reject so the
              // TUI unblocks and the user can re-answer in the terminal.
              ctx.permLog(`opencode bubble failed: ${bubbleErr && bubbleErr.message} — reject via bridge`);
              const popIdx = ctx.pendingPermissions.indexOf(permEntry);
              if (popIdx !== -1) ctx.pendingPermissions.splice(popIdx, 1);
              ctx.replyOpencodePermission({ bridgeUrl, bridgeToken, requestId, reply: "reject", toolName });
            }
            return;
          }

          // ── Claude Code branch ──
          // DND: destroy connection — do NOT send deny on the user's behalf.
          // CC falls back to its built-in chat permission prompt so the user
          // decides themselves. Spike 2026-04-07 confirmed: CC shows Allow/
          // Deny in chat, no hang, no timeout. Same pattern as opencode
          // silent drop (95cbfc7).
          if (ctx.doNotDisturb) {
            ctx.permLog("CC DND → destroy connection, CC chat fallback");
            res.destroy();
            return;
          }

          // Agent gate: mirror DND — destroy the connection so CC (or
          // codebuddy, since they share this path) falls back to its built-in
          // chat prompt. Any non-opencode agent_id passing through here
          // gets the same treatment.
          const ccAgentId = typeof data.agent_id === "string" && data.agent_id ? data.agent_id : "claude-code";
          if (typeof ctx.isAgentEnabled === "function" && !ctx.isAgentEnabled(ccAgentId)) {
            ctx.permLog(`${ccAgentId} disabled → destroy connection, chat fallback`);
            res.destroy();
            return;
          }

          const toolName = typeof data.tool_name === "string" ? data.tool_name : "Unknown";
          const rawInput = data.tool_input && typeof data.tool_input === "object" ? data.tool_input : {};
          const toolInput = truncateDeep(rawInput);
          const sessionId = data.session_id || "default";
          // Tag the permEntry with the source agent. Clawd's HTTP permission
          // path is shared between Claude Code and codebuddy (both set
          // capabilities.permissionApproval=true and POST here). Stamping lets
          // dismissPermissionsByAgent() clean up the right ones when the user
          // disables an agent mid-flight.
          const permAgentId = typeof data.agent_id === "string" && data.agent_id ? data.agent_id : "claude-code";
          const rawSuggestions = Array.isArray(data.permission_suggestions) ? data.permission_suggestions : [];
          // Merge multiple addRules suggestions (e.g. piped commands) into one button
          const addRulesItems = rawSuggestions.filter(s => s && s.type === "addRules");
          const suggestions = addRulesItems.length > 1
            ? [
                ...rawSuggestions.filter(s => s && s.type !== "addRules"),
                {
                  type: "addRules",
                  destination: addRulesItems[0].destination || "localSettings", // CC sends uniform destination per request
                  behavior: addRulesItems[0].behavior || "allow",
                  rules: addRulesItems.flatMap(s =>
                    Array.isArray(s.rules) ? s.rules : [{ toolName: s.toolName, ruleContent: s.ruleContent }]
                  ),
                },
              ]
            : rawSuggestions;

          const existingSession = ctx.sessions.get(sessionId);
          if (existingSession && existingSession.headless) {
            ctx.permLog(`SKIPPED: headless session=${sessionId}`);
            ctx.sendPermissionResponse(res, "deny", "Non-interactive session; auto-denied");
            return;
          }

          if (ctx.PASSTHROUGH_TOOLS.has(toolName)) {
            ctx.permLog(`PASSTHROUGH: tool=${toolName} session=${sessionId}`);
            ctx.sendPermissionResponse(res, "allow");
            return;
          }

          if (shouldBypassCCBubble(ctx, toolName, permAgentId)) {
            ctx.permLog(`${permAgentId} bubbles disabled → destroy connection, chat fallback (tool=${toolName})`);
            res.destroy();
            return;
          }

          // Elicitation (AskUserQuestion) — show notification bubble, not permission bubble.
          // User clicks "Go to Terminal" → deny → Claude Code falls back to terminal.
          if (toolName === "AskUserQuestion") {
            ctx.permLog(`ELICITATION: tool=${toolName} session=${sessionId}`);
            ctx.updateSession(sessionId, "notification", "Elicitation", null, "", null, null, null, "claude-code");

            const permEntry = { res, abortHandler: null, suggestions: [], sessionId, bubble: null, hideTimer: null, toolName, toolInput, resolvedSuggestion: null, createdAt: Date.now(), isElicitation: true, agentId: permAgentId };
            const abortHandler = () => {
              if (res.writableFinished) return;
              ctx.permLog("abortHandler fired (elicitation)");
              ctx.resolvePermissionEntry(permEntry, "deny", "Client disconnected");
            };
            permEntry.abortHandler = abortHandler;
            res.on("close", abortHandler);
            ctx.pendingPermissions.push(permEntry);
            if (!ctx.hideBubbles) ctx.showPermissionBubble(permEntry);
            return;
          }

          const permEntry = { res, abortHandler: null, suggestions, sessionId, bubble: null, hideTimer: null, toolName, toolInput, resolvedSuggestion: null, createdAt: Date.now(), agentId: permAgentId };
          const abortHandler = () => {
            if (res.writableFinished) return;
            ctx.permLog("abortHandler fired");
            ctx.resolvePermissionEntry(permEntry, "deny", "Client disconnected");
          };
          permEntry.abortHandler = abortHandler;
          res.on("close", abortHandler);

          ctx.pendingPermissions.push(permEntry);

          if (ctx.hideBubbles) {
            ctx.permLog(`bubble hidden: tool=${toolName} session=${sessionId} — terminal only`);
          } else {
            ctx.permLog(`showing bubble: tool=${toolName} session=${sessionId} suggestions=${suggestions.length} stack=${ctx.pendingPermissions.length}`);
            ctx.showPermissionBubble(permEntry);
          }
        } catch (err) {
          ctx.permLog(`/permission handler error: ${err && err.message}`);
          // Response may already be sent (opencode branch 200-ACKs before
          // processing), so guard against a second writeHead.
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("internal error");
          }
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const listenPorts = getPortCandidatesFn();
  let listenIndex = 0;
  httpServer.on("error", (err) => {
    if (!activeServerPort && err.code === "EADDRINUSE" && listenIndex < listenPorts.length - 1) {
      listenIndex++;
      httpServer.listen(listenPorts[listenIndex], "127.0.0.1");
      return;
    }
    if (!activeServerPort && err.code === "EADDRINUSE") {
      const firstPort = listenPorts[0];
      const lastPort = listenPorts[listenPorts.length - 1];
      console.warn(`Ports ${firstPort}-${lastPort} are occupied — state sync and permission bubbles are disabled`);
    } else {
      console.error("HTTP server error:", err.message);
    }
  });

  httpServer.on("listening", () => {
    activeServerPort = listenPorts[listenIndex];
    writeRuntimeConfigFn(activeServerPort);
    console.log(`Clawd state server listening on 127.0.0.1:${activeServerPort}`);
    // Defer hook/plugin registration off the startup path. Each sync call
    // reads+parses+writes a config JSON (50-150ms cumulative on slow disks),
    // and all five operate on independent files for independent agents, so
    // none of them need to block the HTTP server from accepting traffic.
    // Nothing is written to any agent's config unless the user opted in
    // (Settings → Startup → Manage Claude hooks automatically).
    setImmediateFn(() => {
      if (shouldManageClaudeHooks()) {
        syncClawdHooks();
        startClaudeSettingsWatcher();
      }
      syncOtherAgentHooks();
    });
  });

  httpServer.listen(listenPorts[listenIndex], "127.0.0.1");
}

function cleanup() {
  clearRuntimeConfigFn();
  // The auth token is intentionally left on disk: hooks already installed in
  // ~/.claude/settings.json (and friends) carry it, and they must keep working
  // across restarts now that hook management is opt-in.
  stopClaudeSettingsWatcher();
  if (httpServer) httpServer.close();
}

return {
  startHttpServer,
  getHookServerPort,
  syncClawdHooks,
  syncOtherAgentHooks,
  shouldManageClaudeHooks,
  areClaudeHooksInstalled,
  syncGeminiHooks,
  syncCursorHooks,
  syncCodeBuddyHooks,
  syncKiroHooks,
  syncOpencodePlugin,
  startClaudeSettingsWatcher,
  stopClaudeSettingsWatcher,
  cleanup,
};

};

module.exports.__test = {
  shouldBypassCCBubble,
  shouldBypassOpencodeBubble,
  extractRequestToken,
  isLocalHostHeader,
  isBrowserOrigin,
  tokensMatch,
};
