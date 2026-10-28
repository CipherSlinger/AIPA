// Attaching a persona to the employee a department is about to hire.
//
// `setSessionPersonaId` is the one mapping mechanism (it owns both the in-memory
// value and the `aipa:session-persona:<id>` record), but it can only persist once
// the session has an id. A freshly hired employee has none until its first turn
// completes and `cli:result` assigns one. So bind twice: set the persona now so
// the mounted chat runs as it, then re-apply when the id lands, which is what
// writes the persistent mapping. Nothing here duplicates the store — it only
// calls its existing action.

import { useChatStore } from '../../store'

/** How long a hire may stay unassigned before we stop waiting for its id. */
const BIND_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Make the new session actually run as the persona, not merely show its badge.
 *
 * This used to copy the persona's model and prompt into global prefs, which is
 * how the send path found them. Personas are per-session now, so the profile is
 * read from the session's own binding at send time — writing the globals here
 * would leak a hired employee's settings into every unrelated conversation.
 */
export function bindPersonaToNewSession(personaId: string | undefined): void {
  if (!personaId) return

  useChatStore.getState().setSessionPersonaId(personaId)

  let done = false
  let applying = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe: (() => void) | null = null

  const stop = () => {
    if (done) return
    done = true
    if (timer) clearTimeout(timer)
    unsubscribe?.()
  }

  unsubscribe = useChatStore.subscribe((state) => {
    if (done || applying) return
    // The user changed persona (or started over) before the first turn ended:
    // their choice wins, and there is no new session left to bind to.
    if (state.sessionPersonaId !== personaId) {
      stop()
      return
    }
    if (!state.currentSessionId) return
    applying = true
    // Re-applying through the action is what records the mapping for this id.
    useChatStore.getState().setSessionPersonaId(personaId)
    stop()
  })

  timer = setTimeout(stop, BIND_TIMEOUT_MS)
}
