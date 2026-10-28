/**
 * Codex thread life-cycle events → session-list edits, without a reload.
 *
 * Codex reports `thread/name/updated`, `thread/archived` and `thread/deleted`
 * for changes made by *any* client, including the Codex CLI. The bridge already
 * forwards them, but the sidebar used to wait for its next `session:list`, so a
 * rename from the CLI kept its old title and an archived conversation stayed
 * forever. This module owns the one decision the renderer makes about those
 * events, and stays dependency-free so a harness can exercise it without
 * Electron or a store.
 *
 * ── Id mapping: threadId *is* the list's sessionId ──
 *
 * `codex-session-reader.ts` derives each row's `sessionId` from the rollout's
 * `session_meta.payload.id` (falling back to the UUID in the file name), which
 * is the same id `thread/start` returns as `thread.id`. The proof that the two
 * namespaces coincide is already in the app: `session:rename` takes the row's
 * `sessionId` and hands it straight to `thread/name/set` as `threadId`
 * (`src/main/ipc/index.ts` → `renameCodexThread`). So a match is an exact
 * string comparison. Anything cleverer (prefix, slug, project) would rename
 * the wrong row, so none is attempted.
 *
 * ── Internal bridges ──
 *
 * `sessionId` on these payloads is the *bridge* id, not a conversation id.
 * Background turns (`internal-…`) must never touch the user's list — the hook
 * drops their events before the switch, and this reader rejects them again so
 * a leak elsewhere cannot reach the sidebar through this path.
 */

/** Bridge ids reserved for background turns; see `INTERNAL_BRIDGE_PREFIX` in main. */
const INTERNAL_BRIDGE_PREFIX = 'internal-'

export type ThreadLifecycleEvent =
  | { kind: 'rename'; threadId: string; name: string }
  | { kind: 'archive'; threadId: string }
  | { kind: 'delete'; threadId: string }

/** The slice of a session row this module touches. */
export interface ThreadLifecycleRow {
  sessionId: string
  title?: string
}

export type ThreadLifecycleKind = ThreadLifecycleEvent['kind']

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Validate one `cli:thread*` payload into the event this module applies.
 *
 * Returns null for everything that cannot be acted on honestly: a non-object
 * payload, a background bridge, a missing/blank thread id, and a rename whose
 * name is missing, blank or not a string (the wire type is `string | null`,
 * and Codex rejects an empty name at the source, so an empty one here is a
 * malformed event — never "clear the title").
 */
export function readThreadLifecycleEvent(
  kind: ThreadLifecycleKind,
  raw: unknown,
): ThreadLifecycleEvent | null {
  const payload = asRecord(raw)
  if (!payload) return null
  // `sessionId` is optional, but when present it must be the bridge id string.
  // A number/object there means the payload is not one of ours; do not guess.
  if (payload.sessionId !== undefined && typeof payload.sessionId !== 'string') return null

  if (
    typeof payload.sessionId === 'string'
    && payload.sessionId.startsWith(INTERNAL_BRIDGE_PREFIX)
  ) {
    return null
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
  if (!threadId) return null

  if (kind === 'rename') {
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!name) return null
    return { kind: 'rename', threadId, name }
  }
  return kind === 'archive'
    ? { kind: 'archive', threadId }
    : { kind: 'delete', threadId }
}

/**
 * Apply one event to the session list.
 *
 * Returns a *new* array only when something actually changed, or null to tell
 * the caller to leave the store untouched. The null return is what makes the
 * update safe to repeat: an event for an unknown thread, a rename to the title
 * the row already has, or an archive/delete of a row that is already gone is a
 * no-op rather than a state write. That idempotency also covers the same event
 * arriving twice (a replayed notification, or two listeners) — it can never
 * remove a second row or overwrite a title twice.
 *
 * Archive and delete both remove the row: the list is a list of conversations
 * that are still openable, and archived threads are moved out of Codex's
 * `sessions/` tree. The caller deliberately does not touch the open transcript;
 * a later attempt to continue it fails through the existing bridge error path.
 */
export function applyThreadLifecycle<T extends ThreadLifecycleRow>(
  sessions: readonly T[],
  event: ThreadLifecycleEvent,
): T[] | null {
  if (event.kind === 'rename') {
    let changed = false
    const next = sessions.map(row => {
      if (row.sessionId !== event.threadId || row.title === event.name) return row
      changed = true
      return { ...row, title: event.name }
    })
    return changed ? next : null
  }

  if (!sessions.some(row => row.sessionId === event.threadId)) return null
  return sessions.filter(row => row.sessionId !== event.threadId)
}
