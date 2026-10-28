/**
 * Pure rules for "ask your history from the conversation you are in".
 *
 * The IPC returns codes, not prose: `busy`, `timeout`, `empty_response`, and a
 * zero-source success are different outcomes and must not collapse into the
 * same "nothing found". Everything that decides what the row says lives here,
 * without React, so the harness can check the mapping (and the wording, via the
 * i18n fragment) on its own.
 */
import type {
  HistoryAskNotice,
  HistoryAskSource,
  HistoryAskStatus,
} from '../../types/app.types'

/** Same threshold the overlay uses: too short a string is not a question. */
export const ASK_MIN_QUESTION = 4
/** The main process rejects anything longer; do not send a doomed invoke. */
export const ASK_MAX_QUESTION = 500
/** The main process caps sources at 8; this is only a defensive ceiling. */
const MAX_SOURCES = 50

export type AskQuestionCheck =
  | { ok: true; question: string }
  | { ok: false; code: 'empty' | 'tooShort' | 'tooLong' }

export function validateAskQuestion(raw: unknown): AskQuestionCheck {
  if (typeof raw !== 'string') return { ok: false, code: 'empty' }
  const question = raw.trim()
  if (!question) return { ok: false, code: 'empty' }
  if (question.length < ASK_MIN_QUESTION) return { ok: false, code: 'tooShort' }
  if (question.length > ASK_MAX_QUESTION) return { ok: false, code: 'tooLong' }
  return { ok: true, question }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Validate one source. Returns null when the entry cannot be revealed: a
 * citation without a session id or an engine has nowhere to go.
 */
function normalizeSource(raw: unknown): HistoryAskSource | null {
  const entry = asRecord(raw)
  if (!entry) return null
  const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId.trim() : ''
  if (!sessionId) return null
  const engine = entry.engine === 'codex' ? 'codex' : entry.engine === 'claude' ? 'claude' : null
  if (!engine) return null
  const timestamp = finiteNumber(entry.timestamp)
  if (timestamp === null) return null

  const source: HistoryAskSource = {
    sessionId,
    project: typeof entry.project === 'string' ? entry.project : '',
    matchType: 'content',
    engine,
    timestamp,
    snippet: typeof entry.snippet === 'string' ? entry.snippet : '',
    matchedTerm: typeof entry.matchedTerm === 'string' ? entry.matchedTerm : '',
  }
  if (typeof entry.title === 'string' && entry.title) source.title = entry.title
  const messageTimestamp = finiteNumber(entry.messageTimestamp)
  if (messageTimestamp !== null) source.messageTimestamp = messageTimestamp
  if (entry.messageRole === 'user' || entry.messageRole === 'assistant') {
    source.messageRole = entry.messageRole
  }
  return source
}

/**
 * All-or-nothing on purpose. `[n]` is positional: dropping one malformed entry
 * would renumber the rest and make `[2]` open the session that was really
 * source 3. If any entry is unusable, the list is not a citation map — return
 * none, and every marker stays plain text.
 */
export function normalizeAskSources(raw: unknown): HistoryAskSource[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (raw.length > MAX_SOURCES) return []
  const sources: HistoryAskSource[] = []
  for (const entry of raw) {
    const source = normalizeSource(entry)
    if (!source) return []
    sources.push(source)
  }
  return sources
}

/** The subset of `AskHistoryResultData` the mapping needs, kept total. */
export interface AskResultLike {
  ok?: unknown
  answer?: unknown
  sources?: unknown
  indexing?: unknown
  error?: unknown
  available?: unknown
  reason?: unknown
}

export interface ClassifiedAsk {
  status: HistoryAskStatus
  answer: string
  sources: HistoryAskSource[]
  indexing: boolean
  stopped: boolean
  errorCode?: string
  unavailableReason?: string
}

/**
 * Turn one IPC result into the row's outcome. Order matters: an unavailable
 * refusal is checked before the error code because the main process answers
 * `{available:false}` with no error at all.
 */
export function classifyAskResult(raw: unknown): ClassifiedAsk {
  const result = asRecord(raw) as AskResultLike | null
  if (!result) {
    return { status: 'failed', answer: '', sources: [], indexing: false, stopped: false }
  }
  const answer = typeof result.answer === 'string' ? result.answer.trim() : ''
  const sources = normalizeAskSources(result.sources)
  const indexing = result.indexing === true

  if (result.ok === true) {
    if (answer) {
      return { status: 'answered', answer, sources, indexing, stopped: false }
    }
    // An "ok" result with no text is not an answer. With sources it is a
    // broken turn; without them it is either a provisional miss or a real one.
    if (sources.length > 0) {
      return { status: 'empty', answer: '', sources, indexing, stopped: false }
    }
    return {
      status: indexing ? 'indexing' : 'noMatch',
      answer: '',
      sources: [],
      indexing,
      stopped: false,
    }
  }

  const reason = typeof result.reason === 'string' ? result.reason : ''
  if (result.available === false) {
    return {
      status: 'unavailable',
      answer: '',
      sources: [],
      indexing: false,
      stopped: false,
      ...(reason ? { unavailableReason: reason } : {}),
    }
  }

  const code = typeof result.error === 'string' ? result.error : ''
  switch (code) {
    case 'busy':
      return { status: 'busy', answer: '', sources: [], indexing: false, stopped: false, errorCode: code }
    case 'timeout':
      return { status: 'timeout', answer: '', sources: [], indexing: false, stopped: false, errorCode: code }
    case 'empty_response':
      return { status: 'empty', answer: '', sources: [], indexing: false, stopped: false, errorCode: code }
    case 'invalid_question':
      return { status: 'invalidQuestion', answer: '', sources: [], indexing: false, stopped: false, errorCode: code }
    case 'aborted':
      // Aborted is not failed: whatever arrived is a partial answer, and the
      // row must mark it stopped rather than pretend it completed.
      return { status: 'stopped', answer: '', sources: [], indexing: false, stopped: true, errorCode: code }
    case 'failed':
      return { status: 'failed', answer: '', sources: [], indexing: false, stopped: false }
    default:
      return {
        status: 'failed',
        answer: '',
        sources: [],
        indexing: false,
        stopped: false,
        ...(code ? { errorCode: code } : {}),
      }
  }
}

/**
 * Fold a settled outcome into the notice being displayed.
 *
 * Only a stop keeps the streamed draft. A timeout or a failure must not leave
 * the partial text looking like the answer: the status line says no complete
 * answer arrived, and the body matches that claim.
 */
export function applyAskOutcome(current: HistoryAskNotice, classified: ClassifiedAsk): HistoryAskNotice {
  const keepPartial = classified.status === 'stopped'
  const answer = classified.answer || (keepPartial ? current.answer : '')
  const citable = classified.status === 'answered'
    || classified.status === 'noMatch'
    || classified.status === 'indexing'
  return {
    ...current,
    answer,
    sources: citable ? classified.sources : [],
    status: classified.status,
    indexing: classified.indexing,
    stopped: classified.stopped,
    ...(classified.errorCode ? { errorCode: classified.errorCode } : {}),
    ...(classified.unavailableReason ? { unavailableReason: classified.unavailableReason } : {}),
  }
}

/** A complete answer, in the only sense the row is allowed to claim. */
export function isCompleteHistoryAnswer(notice: Pick<HistoryAskNotice, 'status' | 'answer' | 'stopped'>): boolean {
  return notice.status === 'answered' && !notice.stopped && notice.answer.trim().length > 0
}

export type HistoryAskTone = 'running' | 'success' | 'warning' | 'error' | 'muted'

export interface HistoryAskStatusLine {
  key: string
  params?: Record<string, string | number>
  tone: HistoryAskTone
}

/**
 * The i18n key for the status line. Refused (`busy` / `unavailable`), failed,
 * and no-match are deliberately three different sentences: the user must be
 * able to tell "the question never ran" from "it ran and found nothing".
 */
export function historyAskStatusLine(
  notice: Pick<HistoryAskNotice, 'status' | 'answer' | 'sources' | 'errorCode' | 'unavailableReason'>,
): HistoryAskStatusLine {
  switch (notice.status) {
    case 'answered':
      if (notice.sources.length === 1) return { key: 'historyAsk.chat.status.answeredOne', tone: 'success' }
      if (notice.sources.length > 1) {
        return {
          key: 'historyAsk.chat.status.answeredMany',
          params: { count: notice.sources.length },
          tone: 'success',
        }
      }
      return { key: 'historyAsk.chat.status.answeredNoSources', tone: 'success' }
    case 'noMatch':
      return { key: 'historyAsk.chat.status.noMatch', tone: 'warning' }
    case 'indexing':
      return { key: 'historyAsk.chat.status.indexing', tone: 'warning' }
    case 'busy':
      return { key: 'historyAsk.chat.status.busy', tone: 'warning' }
    case 'unavailable':
      return notice.unavailableReason
        ? {
            key: 'historyAsk.chat.status.unavailableWithReason',
            params: { reason: notice.unavailableReason },
            tone: 'warning',
          }
        : { key: 'historyAsk.chat.status.unavailable', tone: 'warning' }
    case 'timeout':
      return { key: 'historyAsk.chat.status.timeout', tone: 'error' }
    case 'empty':
      return { key: 'historyAsk.chat.status.empty', tone: 'error' }
    case 'invalidQuestion':
      return { key: 'historyAsk.chat.status.invalidQuestion', tone: 'error' }
    case 'failed':
      return notice.errorCode && notice.errorCode !== 'failed'
        ? {
            key: 'historyAsk.chat.status.failedWithCode',
            params: { code: notice.errorCode },
            tone: 'error',
          }
        : { key: 'historyAsk.chat.status.failed', tone: 'error' }
    case 'stopped':
      return notice.answer.trim()
        ? { key: 'historyAsk.chat.status.stoppedPartial', tone: 'warning' }
        : { key: 'historyAsk.chat.status.stoppedEmpty', tone: 'warning' }
    case 'running':
    default:
      return { key: 'historyAsk.chat.status.running', tone: 'running' }
  }
}
