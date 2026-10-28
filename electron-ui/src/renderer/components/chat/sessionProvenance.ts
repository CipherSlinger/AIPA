// Provenance of the open conversation, derived from the current session list.
//
// The list is the only authority. A session that is no longer in it — its job
// was deleted, an older run was evicted — gets no provenance rather than a
// remembered or guessed label: the transcript must never be attributed to a
// source the app can no longer vouch for.
import type { SessionListItem, SessionOrigin } from '../../types/app.types'

export interface SessionProvenance {
  origin: SessionOrigin
  /** Epoch ms the run began (the session's first message, when known). */
  startedAt: number
}

/**
 * The origin of `sessionId` as it exists in `sessions`, or null when the session
 * is absent, user-started, or not open at all.
 */
export function sessionProvenance(
  sessions: readonly SessionListItem[],
  sessionId: string | null | undefined,
): SessionProvenance | null {
  if (!sessionId) return null
  const session = sessions.find(s => s.sessionId === sessionId)
  if (!session?.origin) return null
  // The first message is when the job/plugin actually started the run;
  // `timestamp` is the last activity and would make an old run look fresh.
  return {
    origin: session.origin,
    startedAt: session.firstTimestamp ?? session.timestamp,
  }
}
