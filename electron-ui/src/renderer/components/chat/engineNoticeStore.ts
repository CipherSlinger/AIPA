/**
 * Composer-adjacent store for the engine's own notices.
 *
 * Why a module store instead of chat-store fields:
 *  - These notices are transient and belong to the composer, not to the
 *    transcript. Writing them into messages would make a warning survive a
 *    scroll back as if the assistant had said it.
 *  - The store is turn-scoped: a new turn clears the reroute line, and the end
 *    of a turn clears the warnings. That is exactly the lifetime the UI needs,
 *    and it keeps a dismissed warning from reappearing in a later turn.
 *
 * Everything here is pure and injectable-free so the wave harness can exercise
 * it without Electron or React.
 */

export const MAX_VISIBLE_ENGINE_WARNINGS = 3

export type EngineWarningKind =
  | 'warning'
  | 'guardianWarning'
  | 'deprecationNotice'
  | 'configWarning'
  | 'worldWritable'
  | 'sandboxSetupFailed'

/** One row of the quiet notice above the composer. `message` is verbatim. */
export interface EngineWarningNotice {
  id: string
  kind: EngineWarningKind
  message: string
  /** `deprecationNotice` / `configWarning` / sandbox failure: verbatim extra text. */
  details: string | null
  /** `sandboxSetupFailed` only: the setup mode the engine reported. */
  mode?: 'elevated' | 'unelevated' | null
}

/**
 * `model/rerouted`. `fromModel` is what the picker/request named, `toModel` is
 * what the engine actually ran. Both stay in the state so the strip can name
 * both; showing only the new model would hide the mismatch.
 */
export interface ModelRerouteNotice {
  fromModel: string
  toModel: string
  reason: string
  turnId: string
}

export interface EngineNoticeSnapshot {
  warnings: EngineWarningNotice[]
  /** Warnings past {@link MAX_VISIBLE_ENGINE_WARNINGS}; shown as a count only. */
  hiddenCount: number
  reroute: ModelRerouteNotice | null
}

export interface EngineNoticeStore {
  /**
   * Ingest a `cli:engineWarning` payload. Returns true when a new row became
   * visible. Duplicate text within the same turn is ignored, and rows past the
   * cap only bump the hidden count — the UI never shows an unbounded stack.
   */
  pushWarning: (payload: unknown) => boolean
  /**
   * Ingest `cli:sandboxSetupCompleted`. Only a failure becomes a notice; a
   * successful setup is deliberately silent. Returns true when a row appeared.
   */
  pushSandboxSetupFailure: (payload: unknown) => boolean
  /** Dismiss one row by id. Dedupe keeps the same text from returning. */
  dismissWarning: (id: string) => void
  /** Ingest `cli:modelRerouted`. Returns false for malformed/no-op payloads. */
  setReroute: (payload: unknown) => boolean
  /** A new turn is starting: its reroute line no longer describes it. */
  beginTurn: () => void
  /** The turn ended: its warnings (and their dedupe memory) are spent. */
  endTurn: () => void
  /** A different conversation is on screen. */
  reset: () => void
  subscribe: (listener: () => void) => () => void
  /** Stable snapshot for `useSyncExternalStore`. */
  getSnapshot: () => EngineNoticeSnapshot
  getVersion: () => number
}

const WARNING_KINDS: ReadonlySet<string> = new Set([
  'warning',
  'guardianWarning',
  'deprecationNotice',
  'configWarning',
  'worldWritable',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseWarning(payload: unknown): Omit<EngineWarningNotice, 'id'> | null {
  const record = asRecord(payload)
  if (!record) return null
  if (typeof record.kind !== 'string' || !WARNING_KINDS.has(record.kind)) return null
  const message = nonEmptyString(record.message)
  if (!message) return null
  return {
    kind: record.kind as EngineWarningKind,
    message,
    // Details are optional on the wire and may be null. Keep them only when
    // they add text; the UI renders them verbatim, never reworded.
    details: nonEmptyString(record.details),
  }
}

/**
 * `cli:sandboxSetupCompleted` is only a notice when it failed. The payload
 * carries no message field; `error` is the engine's own text and `mode` is the
 * only target it names. A failure without error text is still shown: the mode
 * alone is specific enough to tell the user setup did not work.
 */
function parseSandboxSetupFailure(
  payload: unknown,
): Omit<EngineWarningNotice, 'id'> | null {
  const record = asRecord(payload)
  if (!record) return null
  if (record.success !== false) return null
  const mode = record.mode === 'elevated' || record.mode === 'unelevated'
    ? record.mode
    : null
  const error = nonEmptyString(record.error)
  return {
    kind: 'sandboxSetupFailed',
    // Rendered by the component from `mode` + the localized label; the engine
    // never sent a sentence here, so nothing is put in `message`.
    message: '',
    details: error,
    mode,
  }
}

function parseReroute(payload: unknown): ModelRerouteNotice | null {
  const record = asRecord(payload)
  if (!record) return null
  const fromModel = nonEmptyString(record.fromModel)
  const toModel = nonEmptyString(record.toModel)
  const turnId = nonEmptyString(record.turnId)
  const reason = nonEmptyString(record.reason)
  if (!fromModel || !toModel || !turnId || !reason) return null
  // "Moved to the same model" is not a reroute. Dropping it keeps the strip
  // from claiming a change that did not happen.
  if (fromModel === toModel) return null
  return { fromModel, toModel, reason, turnId }
}

export function createEngineNoticeStore(): EngineNoticeStore {
  let warnings: EngineWarningNotice[] = []
  let hiddenCount = 0
  let reroute: ModelRerouteNotice | null = null
  // Identical messages are one notice for the life of a turn. Keyed by the
  // verbatim text, because the engine may repeat a warning per retry.
  const seenMessages = new Set<string>()
  let nextId = 0
  let version = 0
  const listeners = new Set<() => void>()
  let snapshot: EngineNoticeSnapshot = { warnings: [], hiddenCount: 0, reroute: null }

  const bump = () => {
    version += 1
    snapshot = { warnings, hiddenCount, reroute }
    for (const listener of listeners) listener()
  }

  const addNotice = (
    notice: Omit<EngineWarningNotice, 'id'>,
    dedupeKey: string,
  ): boolean => {
    if (seenMessages.has(dedupeKey)) return false
    seenMessages.add(dedupeKey)
    if (warnings.length >= MAX_VISIBLE_ENGINE_WARNINGS) {
      hiddenCount += 1
      bump()
      return false
    }
    nextId += 1
    warnings = [...warnings, { id: `engine-warning-${nextId}`, ...notice }]
    bump()
    return true
  }

  return {
    pushWarning: (payload) => {
      const warning = parseWarning(payload)
      if (!warning) return false
      return addNotice(warning, warning.message)
    },

    pushSandboxSetupFailure: (payload) => {
      const failure = parseSandboxSetupFailure(payload)
      if (!failure) return false
      // Two distinct failures can both have no error text (or the same text in
      // different modes), so the dedupe key includes both fields, not just the
      // empty message.
      return addNotice(failure, `sandbox-setup:${failure.mode ?? 'unknown'}:${failure.details ?? ''}`)
    },

    dismissWarning: (id) => {
      const next = warnings.filter(warning => warning.id !== id)
      if (next.length === warnings.length) return
      warnings = next
      bump()
    },

    setReroute: (payload) => {
      const parsed = parseReroute(payload)
      if (!parsed) return false
      reroute = parsed
      bump()
      return true
    },

    beginTurn: () => {
      // Only the reroute is turn-start scoped. Warnings may arrive during
      // bridge initialization, before `turn/started`; clearing them here would
      // flash a config warning for one frame. They live until the turn ends.
      if (!reroute) return
      reroute = null
      bump()
    },

    endTurn: () => {
      if (warnings.length === 0 && hiddenCount === 0 && seenMessages.size === 0) return
      warnings = []
      hiddenCount = 0
      seenMessages.clear()
      bump()
    },

    reset: () => {
      const had = warnings.length > 0 || hiddenCount > 0 || reroute !== null || seenMessages.size > 0
      warnings = []
      hiddenCount = 0
      reroute = null
      seenMessages.clear()
      if (had) bump()
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    getSnapshot: () => snapshot,
    getVersion: () => version,
  }
}

/** One store for the live renderer; the harness builds its own instances. */
export const engineNoticeStore = createEngineNoticeStore()
