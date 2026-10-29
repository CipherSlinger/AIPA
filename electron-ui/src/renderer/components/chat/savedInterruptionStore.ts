/**
 * What the saved transcript looked like when it was opened.
 *
 * `session:detectInterruption` reads the JSONL file and answers one of three
 * things. `none` is not evidence of a clean finish — a Codex session has no
 * JSONL file at all, and a failed read answers nothing — so only the two
 * non-none values ever become a line on screen. The state is keyed by session
 * id; a late answer for a conversation the user already left is never shown.
 *
 * The observation describes the file at load time, so it lives outside
 * `messages` and is cleared when a later turn ends: at that point it is a
 * statement about a file that no longer describes the open conversation.
 * Pure (no React) so the harness can drive it directly.
 */

export type SavedInterruptionResult = 'interrupted_prompt' | 'interrupted_turn'

export interface SavedInterruption {
  sessionId: string
  result: SavedInterruptionResult
}

/**
 * i18n key for one detect result. `none`, a refused call, a missing answer or
 * an unknown value all mean "say nothing": absent is not zero, and a failed
 * check is not an interruption either.
 */
export function interruptionNoticeKey(
  result: unknown,
): 'interruption.prompt' | 'interruption.turn' | null {
  if (result === 'interrupted_prompt') return 'interruption.prompt'
  if (result === 'interrupted_turn') return 'interruption.turn'
  return null
}

/** The result to show for the session on screen, or null. */
export function selectSavedInterruption(
  state: SavedInterruption | null,
  sessionId: string | null,
): SavedInterruptionResult | null {
  if (!state || !sessionId || state.sessionId !== sessionId) return null
  return state.result
}

export interface SavedInterruptionStore {
  /**
   * Record the answer for a freshly loaded session. A non-interruption (or an
   * absent answer) records nothing and retires any previous line.
   */
  setFromLoad: (sessionId: string, result: unknown) => boolean
  clear: () => boolean
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => SavedInterruption | null
  getVersion: () => number
}

export function createSavedInterruptionStore(): SavedInterruptionStore {
  let state: SavedInterruption | null = null
  let version = 0
  const listeners = new Set<() => void>()

  const bump = () => {
    version += 1
    for (const listener of listeners) listener()
  }

  return {
    setFromLoad: (sessionId, result) => {
      const key = interruptionNoticeKey(result)
      if (!sessionId || !key) {
        if (!state) return false
        state = null
        bump()
        return false
      }
      const next = { sessionId, result: result as SavedInterruptionResult }
      if (state && state.sessionId === next.sessionId && state.result === next.result) {
        return false
      }
      state = next
      bump()
      return true
    },
    clear: () => {
      if (!state) return false
      state = null
      bump()
      return true
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    getVersion: () => version,
  }
}

/** One store for the live renderer; the harness builds its own instances. */
export const savedInterruptionStore = createSavedInterruptionStore()
