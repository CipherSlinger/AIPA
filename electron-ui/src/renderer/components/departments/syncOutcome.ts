// What happened to one background write to the department store.
//
// Two modules push state to main without the user pressing anything: the
// department-cap membership sync and the handbook snapshot sync. Both used to
// return `void`, so a caller could not tell a delivered payload from one that
// never left the renderer — and a cap or handbook could look stored while main
// still held yesterday's copy.
//
// Every write now answers with exactly one of three outcomes:
//
//   saved        main replied `{ ok: true }`. This is the only outcome that
//                may ever be described as saved.
//   unsupported  this build has no channel for the write (preload missing or
//                older than the feature). The payload never left the renderer.
//   failed       the channel exists but main refused or the call broke. The
//                error text is carried as-is when there is one; nothing is
//                invented when there is not.
//
// What the user is told:
//   saved        nothing — a write that landed needs no announcement.
//   unsupported  the edited value is still here, but the department did not
//                receive it, and the reason is that this build cannot send it.
//   failed       the same sentence, with main's own reason appended.
//
// This module is pure: no React, no IPC, no timers. The classification is a
// function of the reply, so the harness can prove that a refusal is never read
// as a success.

export type SyncOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'unsupported'; readonly channel: string }
  | { readonly status: 'failed'; readonly error: string }

/** The only value that may be reported as saved. */
export const SAVED_OUTCOME: SyncOutcome = Object.freeze({ status: 'saved' })

/** The write has no channel in this build. */
export function unsupportedOutcome(channel: string): SyncOutcome {
  return { status: 'unsupported', channel }
}

/** Pull readable text out of whatever a throw or a reply carried. */
export function errorText(err: unknown): string {
  if (typeof err === 'string') return err.trim()
  if (err instanceof Error) return err.message.trim()
  if (err && typeof err === 'object') {
    const record = err as { message?: unknown; error?: unknown }
    if (typeof record.message === 'string') return record.message.trim()
    if (typeof record.error === 'string') return record.error.trim()
  }
  return ''
}

/** A call broke before, during, or instead of answering. */
export function failedOutcome(err: unknown): SyncOutcome {
  return { status: 'failed', error: errorText(err) }
}

/**
 * Main's answer, classified conservatively.
 *
 * Only a literal `ok: true` is a save. A missing reply, a string, an object
 * without `ok`, or `ok: false` are all failures — the cost of guessing wrong in
 * the other direction is a user believing a cap or handbook reached the
 * department when it did not.
 */
export function outcomeFromReply(reply: unknown): SyncOutcome {
  if (reply && typeof reply === 'object' && (reply as { ok?: unknown }).ok === true) {
    return SAVED_OUTCOME
  }
  const record = reply && typeof reply === 'object'
    ? (reply as { error?: unknown })
    : null
  return {
    status: 'failed',
    error: typeof record?.error === 'string' ? record.error.trim() : '',
  }
}

/** True only for a save. Callers must not test "not failed" instead. */
export function isSaved(outcome: SyncOutcome): boolean {
  return outcome.status === 'saved'
}

export type SyncSubject = 'cap' | 'handbook'

/**
 * The notice is one sentence for both paths: the same key, the same two
 * placeholders. Only the subject noun changes, so a cap and a handbook cannot
 * end up describing the same failure differently.
 */
export interface SyncNotice {
  /** `{{subject}}` and `{{reason}}`. */
  readonly key: 'dept.sync.notSaved'
  readonly subjectKey: string
  readonly reasonKey: string
  /** Present only when main gave text; interpolated into `reason.failed`. */
  readonly error?: string
}

export const SYNC_NOTICE_KEY = 'dept.sync.notSaved' as const

export const SYNC_SUBJECT_KEYS: Record<SyncSubject, string> = {
  cap: 'dept.sync.subject.cap',
  handbook: 'dept.sync.subject.handbook',
}

export const SYNC_REASON_KEYS = {
  unsupported: 'dept.sync.reason.unsupported',
  failed: 'dept.sync.reason.failed',
  unknown: 'dept.sync.reason.unknown',
} as const

/**
 * The descriptor a surface renders, or null when there is nothing to say.
 * `saved` is deliberately silent.
 */
export function syncNotice(outcome: SyncOutcome, subject: SyncSubject): SyncNotice | null {
  if (outcome.status === 'saved') return null

  const subjectKey = SYNC_SUBJECT_KEYS[subject]
  if (outcome.status === 'unsupported') {
    return { key: SYNC_NOTICE_KEY, subjectKey, reasonKey: SYNC_REASON_KEYS.unsupported }
  }

  const error = outcome.error.trim()
  return error
    ? { key: SYNC_NOTICE_KEY, subjectKey, reasonKey: SYNC_REASON_KEYS.failed, error }
    : { key: SYNC_NOTICE_KEY, subjectKey, reasonKey: SYNC_REASON_KEYS.unknown }
}
