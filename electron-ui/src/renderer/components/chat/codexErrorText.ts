/**
 * What the Codex protocol actually said about a failed turn, and how a terminal
 * turn ended.
 *
 * `TurnError.codexErrorInfo` is the engine's typed error enum (app-server v2,
 * Codex 0.145), not prose that needs to be regex-matched:
 *
 *   contextWindowExceeded | sessionBudgetExceeded | usageLimitExceeded |
 *   serverOverloaded | cyberPolicy | internalServerError | unauthorized |
 *   badRequest | threadRollbackFailed | sandboxError | other
 *
 * plus tagged objects `{ httpConnectionFailed: { httpStatusCode } }`,
 * `{ responseStreamConnectionFailed }`, `{ responseStreamDisconnected }`,
 * `{ responseTooManyFailedAttempts }` and `{ activeTurnNotSteerable: { turnKind } }`.
 *
 * Rules this module keeps:
 *   - a known code gets its own explanation, never a guess;
 *   - an unrecognised code gets a generic "unrecognised" line and keeps the
 *     engine's raw message — no invented cause;
 *   - a missing code falls back to the legacy text heuristic, but that only
 *     chooses an action; it never becomes an explanation;
 *   - an interrupted turn is neither success nor failure, and a turn without a
 *     status is unknown.
 *
 * Pure module so the harness can bundle and exercise the real mapping.
 */

// ── Typed error vocabulary ────────────────────────────────────────

export const CODEX_ERROR_CODES = [
  'contextWindowExceeded',
  'sessionBudgetExceeded',
  'usageLimitExceeded',
  'serverOverloaded',
  'cyberPolicy',
  'internalServerError',
  'unauthorized',
  'badRequest',
  'threadRollbackFailed',
  'sandboxError',
  'other',
] as const

export const CODEX_ERROR_OBJECT_CODES = [
  'httpConnectionFailed',
  'responseStreamConnectionFailed',
  'responseStreamDisconnected',
  'responseTooManyFailedAttempts',
  'activeTurnNotSteerable',
] as const

export type CodexErrorCode = typeof CODEX_ERROR_CODES[number]
export type CodexErrorObjectCode = typeof CODEX_ERROR_OBJECT_CODES[number]
export type KnownCodexErrorCode = CodexErrorCode | CodexErrorObjectCode

/** Existing app action that follows unambiguously from a typed code. */
export type CodexErrorAction = 'compact' | 'account' | 'permissions'

interface Explanation {
  /** i18n key; every entry is a distinct sentence. */
  key: string
  action: CodexErrorAction | null
}

const EXPLANATIONS: Record<KnownCodexErrorCode, Explanation> = {
  contextWindowExceeded: { key: 'codex.error.contextWindowExceeded', action: 'compact' },
  sessionBudgetExceeded: { key: 'codex.error.sessionBudgetExceeded', action: 'account' },
  usageLimitExceeded: { key: 'codex.error.usageLimitExceeded', action: 'account' },
  serverOverloaded: { key: 'codex.error.serverOverloaded', action: 'account' },
  cyberPolicy: { key: 'codex.error.cyberPolicy', action: null },
  internalServerError: { key: 'codex.error.internalServerError', action: null },
  unauthorized: { key: 'codex.error.unauthorized', action: 'account' },
  badRequest: { key: 'codex.error.badRequest', action: null },
  threadRollbackFailed: { key: 'codex.error.threadRollbackFailed', action: null },
  sandboxError: { key: 'codex.error.sandboxError', action: 'permissions' },
  other: { key: 'codex.error.other', action: null },
  httpConnectionFailed: { key: 'codex.error.httpConnectionFailed', action: null },
  responseStreamConnectionFailed: { key: 'codex.error.responseStreamConnectionFailed', action: null },
  responseStreamDisconnected: { key: 'codex.error.responseStreamDisconnected', action: null },
  responseTooManyFailedAttempts: { key: 'codex.error.responseTooManyFailedAttempts', action: null },
  activeTurnNotSteerable: { key: 'codex.error.activeTurnNotSteerable', action: null },
}

export interface CodexErrorView {
  /** Known protocol code, or null when absent/unrecognised. */
  code: KnownCodexErrorCode | null
  /** Raw code string when the payload carried one, known or not. */
  rawCode: string | null
  /** i18n key for the explanation. Null means: do not claim a cause. */
  explanationKey: string | null
  /** Params for the explanation key. */
  params: Record<string, string>
  /** Existing app action that follows from the code (or the legacy fallback). */
  action: CodexErrorAction | null
  /** True when the old text heuristic was consulted because no known code existed. */
  usedTextFallback: boolean
  /** Raw engine message and additional details, joined; always kept visible. */
  detail: string | null
}

const KNOWN_STRING_CODES = new Set<string>(CODEX_ERROR_CODES)
const KNOWN_OBJECT_CODES = new Set<string>(CODEX_ERROR_OBJECT_CODES)

/** Tagged variants whose payload carries an upstream HTTP status. */
const HTTP_STATUS_CODES = new Set<string>([
  'httpConnectionFailed',
  'responseStreamConnectionFailed',
  'responseStreamDisconnected',
  'responseTooManyFailedAttempts',
])

/**
 * The legacy heuristic the app used before typed errors existed. It only ever
 * picks an action; it must never be presented as the engine's stated cause.
 */
const QUOTA_TEXT_RE = /402|billing|credit|quota|rate.limit|overloaded/i

export function looksLikeQuotaText(text: string | null | undefined): boolean {
  return typeof text === 'string' && QUOTA_TEXT_RE.test(text)
}

interface ParsedInfo {
  present: boolean
  code: KnownCodexErrorCode | null
  rawCode: string | null
  params: Record<string, string>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseCodexErrorInfo(info: unknown): ParsedInfo {
  if (info === undefined || info === null) {
    return { present: false, code: null, rawCode: null, params: {} }
  }

  if (typeof info === 'string') {
    return KNOWN_STRING_CODES.has(info)
      ? { present: true, code: info as CodexErrorCode, rawCode: info, params: {} }
      : { present: true, code: null, rawCode: info, params: {} }
  }

  const record = asRecord(info)
  if (!record) {
    return { present: true, code: null, rawCode: null, params: {} }
  }

  const keys = Object.keys(record)
  if (keys.length === 1 && KNOWN_OBJECT_CODES.has(keys[0])) {
    const code = keys[0] as CodexErrorObjectCode
    const params: Record<string, string> = {}
    const value = asRecord(record[code])
    if (value && typeof value.httpStatusCode === 'number' && Number.isFinite(value.httpStatusCode)) {
      params.status = String(value.httpStatusCode)
    }
    if (value && typeof value.turnKind === 'string') {
      params.turnKind = value.turnKind
    }
    return { present: true, code, rawCode: code, params }
  }

  // A tagged shape this build does not know: retain the tag, invent nothing.
  return {
    present: true,
    code: null,
    rawCode: keys.length === 1 ? keys[0] : null,
    params: {},
  }
}

/**
 * Turn a `TurnError` payload into what the UI may say. The caller decides how
 * to render the explanation, the action and the raw detail.
 */
export function describeCodexError(input: {
  codexErrorInfo?: unknown
  message?: unknown
  details?: unknown
}): CodexErrorView {
  const rawMessage = typeof input.message === 'string' && input.message.trim()
    ? input.message.trim()
    : null
  const rawDetails = typeof input.details === 'string' && input.details.trim()
    ? input.details.trim()
    : null
  const detail = [rawMessage, rawDetails].filter(Boolean).join('\n\n') || null

  const parsed = parseCodexErrorInfo(input.codexErrorInfo)

  if (parsed.code) {
    const explanation = EXPLANATIONS[parsed.code]
    const params = { ...parsed.params }
    // Optional wire details are passed as pre-formatted suffixes so the
    // sentence still reads cleanly when the field was absent.
    if (HTTP_STATUS_CODES.has(parsed.code)) {
      params.status = params.status ? ` (HTTP ${params.status})` : ''
    }
    if (parsed.code === 'activeTurnNotSteerable') {
      params.turnKind = params.turnKind ? ` (${params.turnKind})` : ''
    }
    return {
      code: parsed.code,
      rawCode: parsed.rawCode,
      explanationKey: explanation.key,
      params,
      action: explanation.action,
      usedTextFallback: false,
      detail,
    }
  }

  if (parsed.present) {
    // The protocol named a code this build cannot explain. Say that, keep the
    // raw message, and use the legacy text only to choose an action.
    return {
      code: null,
      rawCode: parsed.rawCode,
      explanationKey: 'codex.error.unrecognized',
      params: { code: parsed.rawCode ?? 'unknown' },
      action: looksLikeQuotaText(detail) ? 'account' : null,
      usedTextFallback: true,
      detail,
    }
  }

  return {
    code: null,
    rawCode: null,
    explanationKey: null,
    params: {},
    action: looksLikeQuotaText(detail) ? 'account' : null,
    usedTextFallback: true,
    detail,
  }
}

// ── Terminal turn outcome ─────────────────────────────────────────

export type TurnOutcome = 'completed' | 'interrupted' | 'failed' | 'unknown'

const TURN_OUTCOMES = new Set<string>(['completed', 'interrupted', 'failed', 'unknown'])

/**
 * Resolve the outcome of a `cli:result` payload.
 *
 * `outcome` is emitted by the Codex bridge for every terminal turn. When it is
 * absent the payload is from the legacy Claude bridge, whose only statement is
 * `subtype`; when `status` is present instead (older Codex builds), the wire
 * status is the authority.
 */
export function resolveTurnOutcome(data: {
  outcome?: unknown
  status?: unknown
  subtype?: unknown
} | null | undefined): TurnOutcome {
  if (typeof data?.outcome === 'string') {
    // A protocol outcome that is present but unrecognised is unknown, not a
    // reason to fall through to the legacy field.
    return TURN_OUTCOMES.has(data.outcome) ? data.outcome as TurnOutcome : 'unknown'
  }

  if (typeof data?.status === 'string') {
    switch (data.status) {
      case 'completed':
        return 'completed'
      case 'interrupted':
        return 'interrupted'
      case 'failed':
        return 'failed'
      default:
        return 'unknown'
    }
  }

  // Legacy engines: subtype is their only statement.
  if (data?.subtype === 'success') return 'completed'
  if (data?.subtype === 'error') return 'failed'
  return 'unknown'
}

/** Quiet in-transcript marker for a non-completed protocol turn, if any. */
export function turnEndNoticeKey(outcome: TurnOutcome): string | null {
  if (outcome === 'interrupted') return 'codex.turn.stopped'
  if (outcome === 'unknown') return 'codex.turn.unknown'
  return null
}
