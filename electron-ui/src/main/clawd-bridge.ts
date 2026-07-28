/**
 * clawd-bridge.ts — Compatibility layer for the Clawd desktop pet.
 *
 * State notifications go directly to the in-process clawd instance via
 * clawd-integration.ts.
 *
 * Design principles:
 *   - All errors are silently swallowed.  If Clawd is not running, every call
 *     is a no-op.  AIPA must never fail because the pet is offline.
 */

import { createLogger } from './utils/logger'
import {
  notifyClawdState as notifyEmbeddedState,
  isClawdRunning as isEmbeddedRunning,
  launchClawd as launchEmbedded,
} from './clawd-integration'

const log = createLogger('clawd-bridge')

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Check whether Clawd is reachable.
 */
export function isClawdRunning(): Promise<boolean> {
  return isEmbeddedRunning()
}

/**
 * Notify Clawd of an AIPA session state change.
 * Errors are silently swallowed.
 */
export function notifyClawdState(state: string, sessionId: string): void {
  try {
    notifyEmbeddedState(state, sessionId)
  } catch {
    // Silent no-op
  }
}

/**
 * Launch Clawd as a detached background process.
 * Calls to this function are idempotent — callers should gate on
 * isClawdRunning() if they want to avoid duplicate launches.
 */
export function launchClawd(): void {
  try {
    launchEmbedded()
  } catch (err) {
    log.warn('Failed to launch Clawd:', String(err))
  }
}
