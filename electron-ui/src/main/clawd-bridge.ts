/**
 * clawd-bridge.ts — Fire-and-forget HTTP bridge to the Clawd desktop pet.
 *
 * Clawd runs its own HTTP server on a port in [23333, 23337] and writes the
 * active port to ~/.clawd/runtime.json.  AIPA notifies Clawd of session state
 * changes so the pet can react to AI activity.
 *
 * Design principles:
 *   - All errors are silently swallowed.  If Clawd is not running, every call
 *     is a no-op.  AIPA must never fail because the pet is offline.
 *   - The actual HTTP request is fire-and-forget: we do not await or inspect
 *     the response.
 *   - A 500 ms debounce is applied to notifyClawdState() so that rapid
 *     textDelta bursts do not flood the Clawd HTTP server.
 */

import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { createLogger } from './utils/logger'

const log = createLogger('clawd-bridge')

// Runtime config path matches hooks/server-config.js RUNTIME_CONFIG_PATH
const RUNTIME_CONFIG_PATH = path.join(os.homedir(), '.clawd', 'runtime.json')
const DEFAULT_PORT = 23333
const CLAWD_LAUNCH_PATH = path.join(__dirname, '..', '..', '..', 'clawd-on-desk', 'launch.js')

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
  const port = readRuntimePort()
  return new Promise((resolve) => {
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
 * The call is debounced at 500 ms to handle rapid textDelta bursts.
 * If Clawd is not running the HTTP request will simply fail silently.
 */
export function notifyClawdState(state: string, sessionId: string): void {
  const port = readRuntimePort()
  const body = JSON.stringify({ state, session_id: sessionId, event: 'aipa' })
  // Use sessionId+state as debounce key so different state types are not merged
  debouncedPost(`${sessionId}:${state}`, port, body, 500)
}

/**
 * Launch Clawd as a detached background process.
 * Calls to this function are idempotent in the sense that they do not check
 * whether Clawd is already running — callers should gate on isClawdRunning()
 * if they want to avoid duplicate launches.
 */
export function launchClawd(): void {
  try {
    const child = spawn(process.execPath, [CLAWD_LAUNCH_PATH], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        // Strip ELECTRON_RUN_AS_NODE so the child launch.js can start Electron in GUI mode
        ELECTRON_RUN_AS_NODE: undefined as unknown as string,
      },
    })
    child.unref()
    log.info('Clawd launch requested, pid:', child.pid)
  } catch (err) {
    log.warn('Failed to launch Clawd:', String(err))
  }
}
