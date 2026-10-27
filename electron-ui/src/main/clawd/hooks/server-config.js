const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const CLAWD_SERVER_ID = "clawd-on-desk";
const CLAWD_SERVER_HEADER = "x-clawd-server";
const DEFAULT_SERVER_PORT = 23333;
const SERVER_PORT_COUNT = 5;
const SERVER_PORTS = Array.from({ length: SERVER_PORT_COUNT }, (_, i) => DEFAULT_SERVER_PORT + i);
const STATE_PATH = "/state";
const PERMISSION_PATH = "/permission";

// Both the server and the hook scripts run as the same desktop user, so a
// token file in the user's home is the one location each side can resolve
// without knowing the other's install path (the hooks are ordinary Node
// processes launched by Claude/Cursor/Gemini, and have no access to Electron's
// `app.getPath('userData')`). `~/.clawd/` is created 0700 and the token 0600
// on POSIX; on Windows the per-user profile ACL provides the equivalent
// isolation (Node's chmod only toggles the read-only bit there).
const CLAWD_DIR = path.join(os.homedir(), ".clawd");
const AUTH_TOKEN_PATH = path.join(CLAWD_DIR, "auth-token");
const AUTH_TOKEN_MIN_LENGTH = 32;
const RUNTIME_CONFIG_PATH = path.join(CLAWD_DIR, "runtime.json");

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && SERVER_PORTS.includes(port) ? port : null;
}

const HOST_PREFIX_PATH = path.join(os.homedir(), ".claude", "hooks", "clawd-host-prefix");

function readHostPrefix() {
  let prefix = null;
  try { prefix = fs.readFileSync(HOST_PREFIX_PATH, "utf8").trim(); } catch {}
  return prefix || os.hostname().split(".")[0];
}

function readRuntimeConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    const port = normalizePort(raw.port);
    return port ? { port } : null;
  } catch {
    return null;
  }
}

// ── Shared-secret auth for the local HTTP server ──
//
// The server binds to 127.0.0.1, but loopback is not an authorization
// boundary: any process running as this user — including a browser page via
// DNS rebinding or a malicious local tool — can POST /permission and approve
// tool use on the user's behalf. Mutating endpoints therefore require a
// bearer token that only processes able to read the user's profile can obtain.

function isValidAuthToken(value) {
  return typeof value === "string" && value.length >= AUTH_TOKEN_MIN_LENGTH;
}

/**
 * Read the shared server token written by the running Clawd/AIPA instance.
 * Returns null when the file is missing/unreadable — callers should then send
 * no Authorization header and let the request fail closed with 401.
 */
function readAuthToken() {
  try {
    const token = fs.readFileSync(AUTH_TOKEN_PATH, "utf8").trim();
    return isValidAuthToken(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * Create (or replace) the shared server token.
 *
 * The token is deliberately persistent across launches: the optional HTTP
 * hook that Claude Code / CodeBuddy read from the agent's settings.json has to
 * carry the secret literally (those agents run in the user's terminal and
 * cannot read Electron's userData or resolve our env vars), so rotating it on
 * every start would break permission bubbles until the next settings sync.
 * `ensureAuthToken()` is what startup calls; this function exists for forced
 * rotation and tests.
 */
function writeAuthToken() {
  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(CLAWD_DIR, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(CLAWD_DIR, 0o700); } catch {}
  const tmpPath = path.join(CLAWD_DIR, `.auth-token.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, token, { encoding: "utf8", mode: 0o600 });
    try { fs.chmodSync(tmpPath, 0o600); } catch {}
    fs.renameSync(tmpPath, AUTH_TOKEN_PATH);
    try { fs.chmodSync(AUTH_TOKEN_PATH, 0o600); } catch {}
    return token;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch {}
    return null;
  }
}

/**
 * Return the shared token, generating one on first run. Tightens the file
 * mode if an older install left it group/world-readable.
 */
function ensureAuthToken() {
  const existing = readAuthToken();
  if (existing) {
    try { fs.chmodSync(AUTH_TOKEN_PATH, 0o600); } catch {}
    return existing;
  }
  return writeAuthToken();
}

function clearAuthToken() {
  try {
    fs.unlinkSync(AUTH_TOKEN_PATH);
    return true;
  } catch {
    return false;
  }
}

/** Authorization header for hook → server POSTs (empty object when no token). */
function buildAuthHeaders(token) {
  const value = isValidAuthToken(token) ? token : readAuthToken();
  return value ? { Authorization: `Bearer ${value}` } : {};
}

function readRuntimePort() {
  const config = readRuntimeConfig();
  return config ? config.port : null;
}

function writeRuntimeConfig(port) {
  const safePort = normalizePort(port);
  if (!safePort) return false;

  const dir = path.dirname(RUNTIME_CONFIG_PATH);
  const tmpPath = path.join(dir, `.runtime.${process.pid}.${Date.now()}.tmp`);
  const body = JSON.stringify({ app: CLAWD_SERVER_ID, port: safePort }, null, 2);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tmpPath, body, "utf8");
    fs.renameSync(tmpPath, RUNTIME_CONFIG_PATH);
    return true;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch {}
    return false;
  }
}

function clearRuntimeConfig(filePath = RUNTIME_CONFIG_PATH) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function getPortCandidates(preferredPort, options = {}) {
  const ports = [];
  const seen = new Set();
  const runtimePort = normalizePort(
    Object.prototype.hasOwnProperty.call(options, "runtimePort")
      ? options.runtimePort
      : readRuntimePort()
  );
  const add = (value) => {
    const port = normalizePort(value);
    if (!port || seen.has(port)) return;
    seen.add(port);
    ports.push(port);
  };

  if (Array.isArray(preferredPort)) preferredPort.forEach(add);
  else add(preferredPort);
  add(runtimePort);
  SERVER_PORTS.forEach(add);
  return ports;
}

function splitPortCandidates(preferredPort, options = {}) {
  const runtimePort = normalizePort(
    Object.prototype.hasOwnProperty.call(options, "runtimePort")
      ? options.runtimePort
      : readRuntimePort()
  );
  const all = getPortCandidates(preferredPort, { runtimePort });
  const direct = [];
  const fallback = [];
  const directSeen = new Set();

  const addDirect = (port) => {
    if (!port || directSeen.has(port)) return;
    directSeen.add(port);
    direct.push(port);
  };

  if (Array.isArray(preferredPort)) preferredPort.forEach((port) => addDirect(normalizePort(port)));
  else addDirect(normalizePort(preferredPort));
  addDirect(runtimePort);

  for (const port of all) {
    if (directSeen.has(port)) continue;
    fallback.push(port);
  }

  return { direct, fallback, all };
}

function buildPermissionUrl(port) {
  const safePort = normalizePort(port) || DEFAULT_SERVER_PORT;
  return `http://127.0.0.1:${safePort}${PERMISSION_PATH}`;
}

function readHeader(res, headerName) {
  const value = res.headers && res.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
}

function isClawdResponse(res, body) {
  if (readHeader(res, CLAWD_SERVER_HEADER) === CLAWD_SERVER_ID) return true;
  if (!body) return false;
  try {
    const data = JSON.parse(body);
    return data && data.app === CLAWD_SERVER_ID;
  } catch {
    return false;
  }
}

function probePort(port, timeoutMs, callback, options = {}) {
  const httpGet = options.httpGet || http.get;
  const req = httpGet(
    { hostname: "127.0.0.1", port, path: STATE_PATH, timeout: timeoutMs },
    (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        if (body.length < 256) body += chunk;
      });
      res.on("end", () => callback(isClawdResponse(res, body)));
    }
  );

  req.on("error", () => callback(false));
  req.on("timeout", () => {
    req.destroy();
    callback(false);
  });
}

function postStateToPort(port, payload, timeoutMs, callback, options = {}) {
  const httpRequest = options.httpRequest || http.request;
  const authHeaders = options.authToken !== undefined
    ? buildAuthHeaders(options.authToken)
    : buildAuthHeaders();
  const req = httpRequest(
    {
      hostname: "127.0.0.1",
      port,
      path: STATE_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...authHeaders,
      },
      timeout: timeoutMs,
    },
    (res) => {
      if (readHeader(res, CLAWD_SERVER_HEADER) === CLAWD_SERVER_ID) {
        res.resume();
        callback(true, port);
        return;
      }

      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        if (responseBody.length < 256) responseBody += chunk;
      });
      res.on("end", () => callback(isClawdResponse(res, responseBody), port));
    }
  );

  req.on("error", () => callback(false, port));
  req.on("timeout", () => {
    req.destroy();
    callback(false, port);
  });
  req.end(payload);
}

function discoverClawdPort(options, callback) {
  const timeoutMs = options && options.timeoutMs ? options.timeoutMs : 100;
  const ports = getPortCandidates(options && options.preferredPort, options);
  const probe = options && options.probePort ? options.probePort : probePort;
  let index = 0;

  const tryNext = () => {
    if (index >= ports.length) {
      callback(null);
      return;
    }

    const port = ports[index++];
    probe(port, timeoutMs, (ok) => {
      if (ok) {
        callback(port);
        return;
      }
      tryNext();
    }, options);
  };

  tryNext();
}

function postStateToRunningServer(body, options, callback) {
  const timeoutMs = options && options.timeoutMs ? options.timeoutMs : 100;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const { direct, fallback } = splitPortCandidates(options && options.preferredPort, options);
  const probe = options && options.probePort ? options.probePort : probePort;
  const post = options && options.postStateToPort ? options.postStateToPort : postStateToPort;
  let directIndex = 0;
  let fallbackIndex = 0;

  const tryFallback = () => {
    if (fallbackIndex >= fallback.length) {
      callback(false, null);
      return;
    }

    const port = fallback[fallbackIndex++];
    probe(port, timeoutMs, (ok) => {
      if (!ok) {
        tryFallback();
        return;
      }
      post(port, payload, timeoutMs, (posted, confirmedPort) => {
        if (posted) {
          callback(true, confirmedPort);
          return;
        }
        tryFallback();
      }, options);
    }, options);
  };

  const tryDirect = () => {
    if (directIndex >= direct.length) {
      tryFallback();
      return;
    }

    const port = direct[directIndex++];
    post(port, payload, timeoutMs, (posted, confirmedPort) => {
      if (posted) {
        callback(true, confirmedPort);
        return;
      }
      tryDirect();
    }, options);
  };

  tryDirect();
}

/**
 * Resolve the absolute path to the Node.js binary for hook commands.
 * On macOS/Linux, Claude Code runs hooks with a minimal PATH (/usr/bin:/bin)
 * that excludes Homebrew, nvm, volta, fnm, etc.  We embed the full path in
 * hook commands so they work regardless of the hook runner's PATH.
 *
 * @param {object} [options] — for testing
 * @param {string} [options.platform]
 * @param {string} [options.homeDir]
 * @param {Function} [options.execFileSync]
 * @param {Function} [options.accessSync]
 * @param {string} [options.execPath]
 * @param {boolean} [options.isElectron]
 * @returns {string|null} absolute path, "node" (Windows), or null (detection failed)
 */
function resolveNodeBin(options = {}) {
  const platform = options.platform || process.platform;

  // Windows: bare `node` works fine (PATH is inherited properly)
  if (platform === "win32") return "node";

  const isElectron = options.isElectron !== undefined
    ? options.isElectron
    : !!process.versions.electron;

  // Non-Electron Node.js: process.execPath IS the node binary
  if (!isElectron) {
    return options.execPath || process.execPath;
  }

  // Electron on macOS/Linux: need to find system node
  const homeDir = options.homeDir || os.homedir();
  const access = options.accessSync || fs.accessSync;

  // Strategy 1: Check well-known paths (fast, no shell spawn)
  const candidates = [
    "/opt/homebrew/bin/node",                          // Homebrew ARM Mac
    "/usr/local/bin/node",                             // Homebrew Intel Mac / official .pkg
    path.join(homeDir, ".volta", "bin", "node"),       // Volta
    path.join(homeDir, ".local", "bin", "node"),       // pipx-style / manual
    "/usr/bin/node",                                   // system package manager
  ];

  for (const candidate of candidates) {
    try {
      access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }

  // Strategy 2: Login + interactive shell (sources both .zprofile AND .zshrc/.bashrc,
  // needed because nvm/fnm initialize in rc files, not profile files)
  const execFileSync = options.execFileSync || require("child_process").execFileSync;
  const shells = ["/bin/zsh", "/bin/bash"];
  for (const shell of shells) {
    try {
      const raw = execFileSync(shell, ["-lic", "which node"], {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      });
      // Interactive shells may produce extra output (Oh My Zsh, Powerlevel10k, etc.)
      // before `which node`. Take the last line that looks like an absolute path.
      const lines = raw.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("/")) return line;
      }
    } catch {}
  }

  // Detection failed — return null so callers can preserve existing config
  // instead of destructively overwriting an absolute path with bare "node"
  return null;
}

module.exports = {
  AUTH_TOKEN_PATH,
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
  DEFAULT_SERVER_PORT,
  PERMISSION_PATH,
  RUNTIME_CONFIG_PATH,
  SERVER_PORTS,
  STATE_PATH,
  buildAuthHeaders,
  buildPermissionUrl,
  clearAuthToken,
  clearRuntimeConfig,
  discoverClawdPort,
  ensureAuthToken,
  getPortCandidates,
  isValidAuthToken,
  postStateToRunningServer,
  probePort,
  readAuthToken,
  readHostPrefix,
  readRuntimePort,
  resolveNodeBin,
  splitPortCandidates,
  postStateToPort,
  writeAuthToken,
  writeRuntimeConfig,
};
