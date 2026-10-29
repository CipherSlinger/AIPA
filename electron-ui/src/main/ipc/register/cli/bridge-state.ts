/**
 * Attention bookkeeping shared by every bridge in the CLI group.
 *
 * Bridge events carry the bridge's own id, but opening a conversation needs an
 * openable session id: the Codex thread id, or the Claude JSONL session id.
 * Both can arrive after the first approval event, so the mapping is filled in
 * lazily and the attention queue is re-keyed when it changes.
 */
import { bindAttentionSession } from '../../../clawd-attention'

const bridgeSessions = new Map<string, string>()

/**
 * Per-bridge turn state for the attention path. A deliberately aborted bridge
 * exits non-zero, and a failed turn is reported twice (result + exit); neither
 * may produce a second "task failed" bubble.
 */
const bridgeTurns = new Map<string, { sawResult: boolean; aborted: boolean }>()

export function trackBridge(bridgeId: string): void {
  bridgeTurns.set(bridgeId, { sawResult: false, aborted: false })
}

export function noteBridgeSession(bridgeId: string, sessionId: unknown): void {
  if (typeof sessionId !== 'string' || !sessionId) return
  bridgeSessions.set(bridgeId, sessionId)
  bindAttentionSession(bridgeId, sessionId)
}

export function sessionForBridge(bridgeId: string): string | null {
  return bridgeSessions.get(bridgeId) || null
}

export function markBridgeResult(bridgeId: string): void {
  const state = bridgeTurns.get(bridgeId)
  if (state) state.sawResult = true
}

export function markBridgeAborted(bridgeId: string): void {
  const state = bridgeTurns.get(bridgeId)
  if (state) state.aborted = true
}

/** True when an exit code is the first and only failure signal for a bridge. */
export function shouldRaiseExitFailure(bridgeId: string): boolean {
  const state = bridgeTurns.get(bridgeId)
  return !!state && !state.aborted && !state.sawResult
}

export function forgetBridge(bridgeId: string): void {
  bridgeSessions.delete(bridgeId)
  bridgeTurns.delete(bridgeId)
}

/** Keep a CLI error message short enough to read in a pet bubble. */
export function clipDetail(value: unknown, max = 90): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
