/**
 * clawd-bridge.ts — Compatibility layer for the Clawd desktop pet.
 *
 * In embedded mode (default), state notifications go directly to the
 * in-process clawd instance via clawd-integration.ts.  The old HTTP
 * and spawn-based launch code is kept as a fallback for external
 * clawd-on-desk installations.
 *
 * Design principles:
 *   - All errors are silently swallowed.  If Clawd is not running, every call
 *     is a no-op.  AIPA must never fail because the pet is offline.
 *   - Embedded mode bypasses HTTP entirely; external mode uses fire-and-forget.
 */

import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { createLogger } from './utils/logger'
import {
  notifyClawdState as notifyEmbeddedState,
  isClawdRunning as isEmbeddedRunning,
  launchClawd as launchEmbedded,
} from './clawd-integration'

const log = createLogger('clawd-bridge')

// Runtime config path matches hooks/server-config.js RUNTIME_CONFIG_PATH
const RUNTIME_CONFIG_PATH = path.join(os.homedir(), '.clawd', 'runtime.json')
const DEFAULT_PORT = 23333
const CLAWD_DIR = path.join(__dirname, '..', '..', '..', 'clawd-on-desk')

// Valid port range used by Clawd (23333–23337)
const PORT_MIN = 23333
const PORT_MAX = 23337

// ------------------------------------------------------------------
// Port resolution
// ------------------------------------------------------------------

function readRuntimePort(): number {
  try {
    const raw = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, 'utf8'))
    if (raw && typeof raw.port === 'number' && raw.port >= PORT_MIN && raw.port <= PORT_MAX) {
      return raw.port
    }
  } catch {
    // File missing or malformed — use default
  }
  return DEFAULT_PORT
}

// ------------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------------

/**
 * Fire-and-forget POST to /state.  Errors are swallowed.
 */
function postState(port: number, body: string): void {
  try {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/state',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 500,
      },
      (res) => {
        // Drain the response body so Node does not hold the socket open
        res.resume()
      }
    )
    req.on('error', () => { /* no-op */ })
    req.on('timeout', () => { req.destroy() })
    req.end(body)
  } catch {
    // Silently ignore any synchronous errors (e.g. invalid port type)
  }
}

/**
 * Check whether Clawd is reachable on the given port via GET /health.
 * Resolves true if the server responds 2xx, false otherwise.
 */
export function isClawdRunning(): Promise<boolean> {
  // Try embedded path first
  return isEmbeddedRunning().then((embedded) => {
    if (embedded) return true
    // Fall back to HTTP health check for external clawd-on-desk
    const port = readRuntimePort()
    return new Promise<boolean>((resolve) => {
      try {
        const req = http.get(
          { hostname: '127.0.0.1', port, path: '/health', timeout: 500 },
          (res) => {
            res.resume()
            resolve(res.statusCode !== undefined && res.statusCode < 400)
          }
        )
        req.on('error', () => resolve(false))
        req.on('timeout', () => { req.destroy(); resolve(false) })
      } catch {
        resolve(false)
      }
    })
  })
}

// ------------------------------------------------------------------
// Debounce
// ------------------------------------------------------------------

const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

/**
 * Debounced fire-and-forget POST.  Multiple calls within `delayMs` for the
 * same `key` are collapsed into one.
 */
function debouncedPost(key: string, port: number, body: string, delayMs: number): void {
  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    postState(port, body)
  }, delayMs)
  debounceTimers.set(key, timer)
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Notify Clawd of an AIPA session state change.
 *
 * Primary path: direct call to the embedded clawd instance (no HTTP).
 * Fallback: fire-and-forget HTTP POST to external clawd-on-desk.
 * Debounce is handled by the embedded instance's state machine.
 */
export function notifyClawdState(state: string, sessionId: string): void {
  // Try embedded path first
  try {
    notifyEmbeddedState(state, sessionId)
  } catch {
    // Fall back to HTTP for external clawd-on-desk
    try {
      const port = readRuntimePort()
      const body = JSON.stringify({ state, session_id: sessionId, event: 'aipa' })
      debouncedPost(`${sessionId}:${state}`, port, body, 500)
    } catch {
      // Both paths failed — silent no-op
    }
  }
}

/**
 * Launch Clawd as a detached background process.
 * Calls to this function are idempotent in the sense that they do not check
 * whether Clawd is already running — callers should gate on isClawdRunning()
 * if they want to avoid duplicate launches.
 */
export function launchClawd(): void {
  // Try embedded path first
  try {
    launchEmbedded()
    return
  } catch {
    // Fall through to external launch
  }

  // External clawd-on-desk launch (legacy fallback)
  try {
    if (!fs.existsSync(CLAWD_DIR)) {
      log.warn('clawd-on-desk directory not found at:', CLAWD_DIR)
      return
    }
    // Prefer clawd-on-desk's own electron binary (present after `npm install`).
    const clawdElectronCmd = path.join(CLAWD_DIR, 'node_modules', '.bin',
      process.platform === 'win32' ? 'electron.cmd' : 'electron')
    const clawdElectronExe = path.join(CLAWD_DIR, 'node_modules', 'electron',
      'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')

    let electronBin = ''
    if (fs.existsSync(clawdElectronCmd)) {
      electronBin = clawdElectronCmd
    } else if (fs.existsSync(clawdElectronExe)) {
      electronBin = clawdElectronExe
    }

    // Strip ELECTRON_RUN_AS_NODE so Electron starts in GUI (browser) mode.
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    let child
    if (electronBin) {
      // clawd has its own electron installed — run it directly in its own directory
      child = spawn(electronBin, ['.'], { detached: true, stdio: 'ignore', cwd: CLAWD_DIR, env })
    } else {
      // No separate electron found — use AIPA's own Electron binary.
      // We must pass a built entry file, not the directory, because Electron will
      // fail with "Cannot find module '<dir>'" if the package.json main is missing/unbuilt.
      let clawdEntry = ''
      const pkgJsonPath = path.join(CLAWD_DIR, 'package.json')
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { main?: string }
          if (pkg.main) {
            const candidate = path.join(CLAWD_DIR, pkg.main)
            if (fs.existsSync(candidate)) {
              clawdEntry = candidate
            }
          }
        } catch {
          // malformed package.json
        }
      }
      if (!clawdEntry) {
        log.warn(
          'clawd-on-desk entry file not found. Please run: cd clawd-on-desk && npm install && npm run build'
        )
        return
      }
      child = spawn(process.execPath, [clawdEntry], { detached: true, stdio: 'ignore', env })
    }
    child.unref()
    log.info('Clawd launch requested, pid:', child.pid, 'bin:', electronBin || process.execPath)
  } catch (err) {
    log.warn('Failed to launch Clawd:', String(err))
  }
}
