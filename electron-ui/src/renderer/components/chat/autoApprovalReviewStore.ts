/**
 * Annotations for the automatic approval reviewer (`item/autoApprovalReview/*`).
 *
 * Why a store beside the transcript instead of fields on the tool card:
 *  - The verdict arrives while the owning tool card is already mounted. Writing
 *    it into the chat store would rewrite the message array, re-rendering the
 *    whole list for one small line.
 *  - The store is keyed by the *existing* item id. It renders nothing on its
 *    own: only a tool card whose id matches reads an entry, so a review for an
 *    item with no card can never create a phantom row.
 *
 * Lifetime:
 *  - `started` → `inProgress`. The card shows a quiet "review in progress" line.
 *  - `completed` → the engine's terminal status + rationale, replacing the
 *    in-progress line.
 *  - `completeItem` / `clearInProgress` drop an in-progress line when its item
 *    or turn ends, so a review that never completes cannot spin forever.
 *
 * Pure and injectable-free so the wave harness can exercise it without React.
 */

export const AUTO_APPROVAL_REVIEW_STATUSES = [
  'inProgress',
  'approved',
  'denied',
  'timedOut',
  'aborted',
] as const

export type AutoApprovalReviewStatus = typeof AUTO_APPROVAL_REVIEW_STATUSES[number]

const STATUS_SET: ReadonlySet<string> = new Set(AUTO_APPROVAL_REVIEW_STATUSES)
const TERMINAL_SET: ReadonlySet<string> = new Set(['approved', 'denied', 'timedOut', 'aborted'])

export interface AutoApprovalReviewEntry {
  reviewId: string
  targetItemId: string
  status: AutoApprovalReviewStatus
  /** The engine's own reason, verbatim; null when it sent none. */
  rationale: string | null
}

export interface AutoApprovalReviewStore {
  /**
   * Ingest one `cli:autoApprovalReview` payload. Returns false for malformed
   * payloads and for a completed event that still says `inProgress` (no
   * verdict). Callers must first confirm the target item has a visible card.
   */
  ingest: (payload: unknown) => boolean
  /** A fresh card took this item id; discard any previous review's line. */
  beginItem: (itemId: string) => void
  /** The item finished: an in-progress line can no longer be true. */
  completeItem: (itemId: string) => void
  /** The turn ended: drop every in-progress line, keep completed verdicts. */
  clearInProgress: () => void
  clear: () => void
  subscribe: (listener: () => void) => () => void
  /** Monotonic version for `useSyncExternalStore`; entries read after it. */
  getVersion: () => number
  getEntry: (itemId: string) => AutoApprovalReviewEntry | undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseReview(payload: unknown): AutoApprovalReviewEntry | null {
  const record = asRecord(payload)
  if (!record) return null
  const targetItemId = nonEmptyString(record.targetItemId)
  if (!targetItemId) return null
  // `phase` is added by the bridge. A completion without a verdict is not
  // evidence of anything, so it must not replace an in-progress line with a
  // misleading final word.
  const phase = record.phase === 'completed' ? 'completed' : record.phase === 'started' ? 'started' : null
  if (!phase) return null
  const status = nonEmptyString(record.status)
  if (!status || !STATUS_SET.has(status)) return null
  if (phase === 'completed' && !TERMINAL_SET.has(status)) return null
  return {
    reviewId: nonEmptyString(record.reviewId) ?? '',
    targetItemId,
    status: status as AutoApprovalReviewStatus,
    rationale: nonEmptyString(record.rationale),
  }
}

export function createAutoApprovalReviewStore(): AutoApprovalReviewStore {
  const entries = new Map<string, AutoApprovalReviewEntry>()
  const listeners = new Set<() => void>()
  let version = 0

  const bump = () => {
    version += 1
    for (const listener of listeners) listener()
  }

  return {
    ingest: (payload) => {
      const review = parseReview(payload)
      if (!review) return false
      const previous = entries.get(review.targetItemId)
      // An identical completed review is a duplicate push, not a new event.
      if (previous
        && previous.reviewId === review.reviewId
        && previous.status === review.status
        && previous.rationale === review.rationale) {
        return false
      }
      entries.set(review.targetItemId, review)
      bump()
      return true
    },

    beginItem: (itemId) => {
      if (!itemId || !entries.delete(itemId)) return
      bump()
    },

    completeItem: (itemId) => {
      const entry = itemId ? entries.get(itemId) : undefined
      if (!entry || entry.status !== 'inProgress') return
      entries.delete(itemId)
      bump()
    },

    clearInProgress: () => {
      let removed = false
      for (const [itemId, entry] of entries) {
        if (entry.status !== 'inProgress') continue
        entries.delete(itemId)
        removed = true
      }
      if (removed) bump()
    },

    clear: () => {
      if (entries.size === 0) return
      entries.clear()
      bump()
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    getVersion: () => version,
    getEntry: (itemId) => (itemId ? entries.get(itemId) : undefined),
  }
}

const VERDICT_KEYS: Record<Exclude<AutoApprovalReviewStatus, 'inProgress'>, string> = {
  approved: 'codex.autoApprovalReview.approved',
  denied: 'codex.autoApprovalReview.denied',
  timedOut: 'codex.autoApprovalReview.timedOut',
  aborted: 'codex.autoApprovalReview.aborted',
}

/**
 * Pure sentence builder so the harness can assert the exact wording. The
 * rationale is inserted verbatim after the engine's status word; nothing is
 * added that claims the command is safe.
 */
export function describeAutoApprovalReview(
  review: AutoApprovalReviewEntry | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (!review) return null
  if (review.status === 'inProgress') return t('codex.autoApprovalReview.inProgress')
  const verdict = t(VERDICT_KEYS[review.status])
  if (review.rationale) {
    return t('codex.autoApprovalReview.withReason', { verdict, reason: review.rationale })
  }
  return t('codex.autoApprovalReview.line', { verdict })
}

/** One store for the live renderer; the harness builds its own instances. */
export const autoApprovalReviewStore = createAutoApprovalReviewStore()
