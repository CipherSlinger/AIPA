/**
 * Session-scoped reasoning-effort overrides.
 *
 * Effort used to be a single global preference: picking "high" for one hard
 * problem changed every other conversation, and reopening a conversation
 * tomorrow brought back whatever the global value happened to be by then.
 * It now behaves like the model: an explicit pick belongs to the conversation
 * it was made in, and only conversations without a pick follow the default.
 *
 * Storage mirrors the model override (`aipa:session-model:<id>`): an in-memory
 * store field for the live conversation and a localStorage record once the
 * session has an id. `'auto'` is never stored — see `writeSessionEffortOverride`.
 */

export type EffortLevel = 'auto' | 'low' | 'medium' | 'high' | 'max'

export const EFFORT_LEVELS: readonly EffortLevel[] = ['auto', 'low', 'medium', 'high', 'max']

const EFFORT_SET = new Set<string>(EFFORT_LEVELS)

/** Anything unrecognised (a stale pref, a hand-edited profile) means "let the engine decide". */
export function normalizeEffort(value: string | undefined | null): EffortLevel {
  return value && EFFORT_SET.has(value) ? (value as EffortLevel) : 'auto'
}

export function sessionEffortStorageKey(sessionId: string): string {
  return `aipa:session-effort:${sessionId}`
}

/**
 * Read the persisted override, tolerating a profile where localStorage is off.
 *
 * A stored `'auto'` reads as "no override": the menu treats auto as "follow the
 * global default", so persisting it would freeze nothing useful and would make
 * the conversation ignore a later change to that default.
 */
export function readSessionEffortOverride(sessionId: string): EffortLevel | undefined {
  try {
    const raw = localStorage.getItem(sessionEffortStorageKey(sessionId))
    if (!raw || raw === 'auto' || !EFFORT_SET.has(raw)) return undefined
    return raw as EffortLevel
  } catch {
    return undefined
  }
}

/**
 * Persist or clear this conversation's override.
 *
 * `undefined` and `'auto'` both delete the record rather than writing the
 * current global value: "follow the default" has to stay a live relationship,
 * not a snapshot of today's default.
 */
export function writeSessionEffortOverride(sessionId: string, level: EffortLevel | undefined): void {
  try {
    if (level && level !== 'auto') {
      localStorage.setItem(sessionEffortStorageKey(sessionId), level)
    } else {
      localStorage.removeItem(sessionEffortStorageKey(sessionId))
    }
  } catch {
    // localStorage unavailable — the live session still works.
  }
}

/** Forget a conversation's record when it is deleted for good. */
export function dropSessionEffortOverride(sessionId: string): void {
  try {
    localStorage.removeItem(sessionEffortStorageKey(sessionId))
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

/**
 * The effort a turn actually runs on: session override, else the global
 * default, else `'auto'`. A draft with no session id has no override yet, so
 * it gets the global default.
 */
export function resolveEffectiveEffort(
  globalEffort: string | undefined,
  override: string | undefined,
): EffortLevel {
  if (override && normalizeEffort(override) !== 'auto') return normalizeEffort(override)
  return normalizeEffort(globalEffort)
}

/**
 * True when this conversation really runs on something other than the global
 * default. Equal values are not an override worth a badge: the two mechanisms
 * happened to agree, and the user cannot tell them apart from the value alone.
 */
export function isEffortOverridden(
  globalEffort: string | undefined,
  override: string | undefined,
): boolean {
  return resolveEffectiveEffort(globalEffort, override) !== normalizeEffort(globalEffort)
}

/**
 * What a pick in the menu should write, and where.
 *
 * With a conversation open the pick is scoped to it. `'auto'` there means
 * "follow the global default from now on", which is the absence of an override
 * — never the current default written into a record, or the conversation would
 * stop following the default the moment it changed. A concrete level equal to
 * the default is also stored as absence: the two mechanisms agree, and a record
 * would only make the "this chat" marker claim a difference that is not there.
 *
 * With nothing open there is nothing to scope to, so the pick is the default
 * for new conversations.
 */
export type EffortPickPlan =
  | { scope: 'session'; override: EffortLevel | undefined }
  | { scope: 'global'; level: EffortLevel }

export function planEffortPick(
  hasConversation: boolean,
  level: EffortLevel,
  globalEffort: string | undefined,
): EffortPickPlan {
  if (!hasConversation) return { scope: 'global', level }
  if (level === 'auto' || level === normalizeEffort(globalEffort)) {
    return { scope: 'session', override: undefined }
  }
  return { scope: 'session', override: level }
}

/**
 * The `effort` field of a `cli:send` request.
 *
 * `'auto'` means "let the engine decide", so it is not sent at all — the main
 * process would drop it again if the model does not advertise it.
 */
export function effortSendField(effort: EffortLevel): { effort?: EffortLevel } {
  return effort === 'auto' ? {} : { effort }
}
