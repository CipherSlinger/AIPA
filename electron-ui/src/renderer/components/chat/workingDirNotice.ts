/**
 * A conversation whose recorded folder is gone.
 *
 * A Codex transcript remembers the folder it ran in. Opening it in a folder
 * that no longer exists would make the next turn fail at launch, so the open
 * path checks first and, when the stat proves the folder is missing, leaves
 * the conversation on the current preference instead. That substitution must
 * be said out loud: continuing silently in a different project is exactly the
 * kind of quiet wrong-folder work this app must not do.
 *
 * Keyed by session id and pure (no React) so the harness can drive it. The
 * observation is retired when the user picks a folder for that conversation —
 * at that point the choice is theirs and the old record describes nothing.
 */

import { sameWorkingDir } from '../../lib/workingDir'

export interface WorkingDirGoneNotice {
  sessionId: string
  /** The folder the transcript was recorded in. */
  recordedDir: string
}

/** The notice to show for the session on screen, or null. */
export function selectWorkingDirGone(
  state: WorkingDirGoneNotice | null,
  sessionId: string | null,
): string | null {
  if (!state || !sessionId || state.sessionId !== sessionId) return null
  return state.recordedDir
}

export interface WorkingDirGoneStore {
  /** Record that `recordedDir` is gone for this conversation. */
  setGone: (sessionId: string, recordedDir: string) => boolean
  /** Retire the notice — the user has chosen a folder, or the session changed. */
  clear: () => boolean
  /** Retire it only if it belongs to `sessionId`; another session's notice stays. */
  clearFor: (sessionId: string | null) => boolean
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => WorkingDirGoneNotice | null
  getVersion: () => number
}

export function createWorkingDirGoneStore(): WorkingDirGoneStore {
  let state: WorkingDirGoneNotice | null = null
  let version = 0
  const listeners = new Set<() => void>()

  const bump = () => {
    version += 1
    for (const listener of listeners) listener()
  }

  return {
    setGone: (sessionId, recordedDir) => {
      const dir = typeof recordedDir === 'string' ? recordedDir.trim() : ''
      if (!sessionId || !dir) return false
      if (state && state.sessionId === sessionId && sameWorkingDir(state.recordedDir, dir)) return false
      state = { sessionId, recordedDir: dir }
      bump()
      return true
    },
    clear: () => {
      if (!state) return false
      state = null
      bump()
      return true
    },
    clearFor: (sessionId) => {
      if (!state || !sessionId || state.sessionId !== sessionId) return false
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
export const workingDirGoneStore = createWorkingDirGoneStore()
