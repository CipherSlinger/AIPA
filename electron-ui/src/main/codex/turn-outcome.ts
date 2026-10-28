/**
 * Terminal turn outcome, derived from the protocol's `Turn.status`.
 *
 * The app-server v2 schema (`TurnStatus`, generated from Codex 0.145) defines:
 *
 *     completed | interrupted | failed | inProgress
 *
 * `turn/completed` is the terminal notification. A status this build does not
 * know — or no status at all — is `unknown`; it is never success. The bridge
 * used to default a missing status to `completed`, which made a user's Stop
 * look like a normal finish.
 *
 * Pure module (no Electron / Node imports) so the harness can bundle it.
 */

export type CodexTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress' | 'unknown'

/** Normalized terminal outcome carried over IPC next to the raw wire status. */
export type CodexTurnOutcome = 'completed' | 'interrupted' | 'failed' | 'unknown'

/**
 * The legacy `subtype` field keeps its success/error meaning for Claude, and
 * gains two honest values for Codex. A consumer that only understands
 * `success` must treat everything else as "not a completed turn".
 */
export type CodexResultSubtype = 'success' | 'error' | 'interrupted' | 'unknown'

export interface CodexTurnErrorView {
  message: string
  details?: string
  /** `TurnError.codexErrorInfo`, verbatim. String enum or tagged object. */
  codexErrorInfo?: unknown
}

export interface CodexTurnCompletedView {
  /** Raw wire status, or null when the notification did not carry one. */
  statusOnWire: string | null
  status: CodexTurnStatus
  outcome: CodexTurnOutcome
  subtype: CodexResultSubtype
  durationMs: number | null
  /** Present only when the notification carried a TurnError. */
  error: CodexTurnErrorView | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function normalizeTurnStatus(raw: unknown): CodexTurnStatus {
  return raw === 'completed' || raw === 'interrupted' || raw === 'failed' || raw === 'inProgress'
    ? raw
    : 'unknown'
}

export function outcomeForStatus(status: CodexTurnStatus): CodexTurnOutcome {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'interrupted':
      return 'interrupted'
    case 'failed':
      return 'failed'
    // `inProgress` on a terminal notification is not a statement that the turn
    // finished, and an unrecognised status is no statement at all.
    default:
      return 'unknown'
  }
}

export function subtypeForStatus(status: CodexTurnStatus): CodexResultSubtype {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'interrupted':
      return 'interrupted'
    default:
      return 'unknown'
  }
}

/**
 * Normalize the `turn` payload of a `turn/completed` notification. Accepts the
 * raw params so missing fields stay missing rather than being guessed.
 */
export function normalizeTurnCompleted(
  turn: Record<string, unknown> | null | undefined,
): CodexTurnCompletedView {
  const statusOnWire = typeof turn?.status === 'string' ? turn.status : null
  const status = normalizeTurnStatus(statusOnWire)
  const durationMs = typeof turn?.durationMs === 'number' && Number.isFinite(turn.durationMs)
    ? turn.durationMs
    : null

  const rawError = asRecord(turn?.error)
  const message = typeof rawError?.message === 'string' ? rawError.message : null
  const error: CodexTurnErrorView | null = message
    ? {
        message,
        ...(typeof rawError?.additionalDetails === 'string'
          ? { details: rawError.additionalDetails }
          : {}),
        ...(rawError?.codexErrorInfo !== undefined && rawError?.codexErrorInfo !== null
          ? { codexErrorInfo: rawError.codexErrorInfo }
          : {}),
      }
    : null

  return {
    statusOnWire,
    status,
    outcome: outcomeForStatus(status),
    subtype: subtypeForStatus(status),
    durationMs,
    error,
  }
}
