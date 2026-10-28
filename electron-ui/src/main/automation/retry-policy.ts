/**
 * The opt-in retry policy for failed unattended runs.
 *
 * A schedule that runs once a night hands a transient failure (a dropped
 * connection, an engine briefly unavailable) a full day of silence. A retry
 * gives that occurrence a second and third chance without turning a genuinely
 * broken job into a loop.
 *
 * These numbers are deliberately conservative: every retry runs the whole job
 * again, so it spends money and repeats side effects, and nobody is watching.
 * Two attempts ride out a short outage; ten and thirty minutes grow long enough
 * to outlast a provider blip but still finish well before the next nightly
 * occurrence. A job whose own schedule repeats faster than the first delay gets
 * no retry at all (`nextRetryAfterFailure` refuses one the regular occurrence
 * would overtake) — its schedule is already the retry.
 *
 * Pure and Electron-free so `.scratch/wave20-retry-harness` can pin `now` and
 * exercise the policy without a scheduler or a window.
 */
import type { AutomationPendingRetry } from './types'

export const AUTOMATION_RETRY_POLICY = {
  /** Retries per failing occurrence, not per job. */
  maxRetries: 2,
  /** Wait before retry 1, then retry 2. Index = attempts already made. */
  delaysMs: [10 * 60_000, 30 * 60_000] as const,
} as const

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Restore a persisted pending retry, or drop it.
 *
 * This is part of the job store's whitelist defence: a hand-edited or
 * half-written file must lose a field rather than gain a retry the policy never
 * allowed. A retry due at or after the next regular occurrence could never run
 * (the first tick expires it), so it is discarded here instead of being carried
 * around until then.
 */
export function normalizePendingRetry(value: unknown): AutomationPendingRetry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const dueAt = finiteNumber(raw.dueAt)
  const expiresAt = finiteNumber(raw.expiresAt)
  const attempt = finiteNumber(raw.attempt)
  if (dueAt === null || expiresAt === null || attempt === null) return undefined
  if (dueAt <= 0 || expiresAt <= 0) return undefined
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > AUTOMATION_RETRY_POLICY.maxRetries) {
    return undefined
  }
  if (dueAt >= expiresAt) return undefined
  return { dueAt, attempt, expiresAt }
}

/**
 * True once the regular occurrence that followed the failed one has arrived.
 *
 * This is the stale-retry rule: a pending retry belongs to one occurrence and
 * may not fire days later after a long shutdown. The next scheduled run is a
 * fresh chance, and running both would be a burst.
 */
export function isPendingRetryExpired(pending: AutomationPendingRetry, now: number): boolean {
  return now >= pending.expiresAt
}

/**
 * The retry to schedule after a failed attempt, if the policy still allows one.
 *
 * `attempt` is the number of the attempt that just failed: 0 for an ordinary
 * scheduled run, 1..maxRetries for a retry. Manual runs never schedule a retry,
 * and a job that has not opted in never gets one either.
 */
export function nextRetryAfterFailure(opts: {
  retryOnFailure: boolean
  manual: boolean
  attempt: number
  now: number
  nextRunAt: number | null
}): AutomationPendingRetry | undefined {
  if (!opts.retryOnFailure || opts.manual) return undefined
  const nextAttempt = opts.attempt + 1
  if (nextAttempt > AUTOMATION_RETRY_POLICY.maxRetries) return undefined
  const delayMs = AUTOMATION_RETRY_POLICY.delaysMs[opts.attempt]
  if (delayMs === undefined) return undefined
  const nextRunAt = opts.nextRunAt
  if (nextRunAt === null) return undefined
  const dueAt = opts.now + delayMs
  // The regular schedule fires first: the retry would be stale before it is
  // ever due, so do not persist a wait that cannot end in a run.
  if (dueAt >= nextRunAt) return undefined
  return { dueAt, attempt: nextAttempt, expiresAt: nextRunAt }
}
