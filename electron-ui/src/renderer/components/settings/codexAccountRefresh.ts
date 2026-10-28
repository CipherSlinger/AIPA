// Pure decisions behind the Codex account card's live refresh.
//
// The card shows plan limits, credits and account usage read from two
// read-only probes. Those numbers describe the signed-in account, not a
// thread, so they go stale whenever Codex reports a change on any live
// bridge. This module holds the rules that turn an incoming `cli:*` event
// into "probe now" / "ignore" and the rules that merge a probe round into
// what is on screen, with no React and no clock of its own — the caller
// passes `now`, which keeps the behaviour testable and the tick separate
// from the fetch (a ticking clock must never cause a refetch).
//
// Imported types are `import type` so this file stays runnable in the plain
// Node harness (`esbuild` erases them).

import type {
  CodexAccountUsageData,
  CodexRateLimitsData,
} from '../../../preload/index'

/** The two probes' last-known answers. Either half may be missing. */
export interface CodexAccountNumbers {
  limits: CodexRateLimitsData | null
  usage: CodexAccountUsageData | null
}

/** One probe round; `null` means that half failed (or returned nothing). */
export interface CodexAccountProbeResult {
  limits: CodexRateLimitsData | null
  usage: CodexAccountUsageData | null
}

/**
 * Background automation runs use `internal-*` bridges on the same account.
 * Their events are real, but they are not the conversation the user is
 * looking at — the same rule `useRateLimits` applies to its chip, and the
 * same rule main uses when it skips internal bridges for probes.
 */
export const INTERNAL_BRIDGE_PREFIX = 'internal-'

/**
 * Both channels are account-wide invalidations. `account/updated` names the
 * change; main then re-reads the limits and emits `cli:rateLimitsUpdated`
 * for the composer chip. One account change therefore arrives as a small
 * burst, and probing once per event would race two probes whose answers can
 * land out of order.
 */
export const ACCOUNT_REFRESH_CHANNELS: readonly string[] = [
  'cli:accountUpdated',
  'cli:rateLimitsUpdated',
]

/**
 * Leading-edge coalescing window. The burst described above lands within a
 * few hundred milliseconds, so anything inside this window is folded into
 * the probe that is already running. This is not a poll: a quiet account
 * produces no probes at all.
 */
export const ACCOUNT_REFRESH_COALESCE_MS = 2_000

export type AccountRefreshDecision =
  | { action: 'fetch' }
  | { action: 'ignore'; reason: 'channel' | 'internal-bridge' | 'coalesced' }

export interface AccountRefreshInput {
  channel: string
  /** The bridge that emitted the event; absent on some engine pushes. */
  sessionId?: string | null
  now: number
  /** When the last event-driven probe started, or null if none has. */
  lastFetchAt: number | null
  coalesceMs?: number
}

/**
 * Decide whether an incoming `cli:*` event should start a probe.
 *
 * - unrelated channels (the shared `cli:*` subscription carries text deltas)
 *   are ignored before anything else is read;
 * - `internal-*` bridges are ignored;
 * - a second event inside the coalescing window is ignored, because the
 *   probe it would have started is already reading the same account.
 *
 * There is deliberately no "visible conversation" test here: plan limits and
 * usage are account-wide, and a conversation that is not on screen can still
 * be the one that changed the account (a background turn that hit a new
 * plan). `useRateLimits` makes the same choice and only filters internal
 * bridges.
 */
export function decideAccountRefresh(input: AccountRefreshInput): AccountRefreshDecision {
  const { channel, sessionId, now, lastFetchAt } = input

  if (!ACCOUNT_REFRESH_CHANNELS.includes(channel)) {
    return { action: 'ignore', reason: 'channel' }
  }
  if (typeof sessionId === 'string' && sessionId.startsWith(INTERNAL_BRIDGE_PREFIX)) {
    return { action: 'ignore', reason: 'internal-bridge' }
  }

  const coalesceMs = input.coalesceMs ?? ACCOUNT_REFRESH_COALESCE_MS
  // A backwards wall clock (the user adjusted the system time, or the event
  // was stamped by a bridge with skew) cannot be used to reason about the
  // window; treat it as a fresh event instead of suppressing updates until
  // the clock catches up.
  if (lastFetchAt !== null && now >= lastFetchAt && now - lastFetchAt < coalesceMs) {
    return { action: 'ignore', reason: 'coalesced' }
  }
  return { action: 'fetch' }
}

/**
 * Merge one probe round into the numbers on screen.
 *
 * A failed half keeps the previous value: a transient probe failure must not
 * blank data that is still the best information the user has. When both
 * halves failed the previous object is returned unchanged, so React does not
 * re-render for a round that changed nothing.
 */
export function mergeAccountNumbers(
  previous: CodexAccountNumbers,
  fetched: CodexAccountProbeResult,
): CodexAccountNumbers {
  if (fetched.limits === null && fetched.usage === null) return previous
  return {
    limits: fetched.limits ?? previous.limits,
    usage: fetched.usage ?? previous.usage,
  }
}

/** True when a probe round produced no usable numbers at all. */
export function accountFetchFailed(fetched: CodexAccountProbeResult): boolean {
  return fetched.limits === null && fetched.usage === null
}

/**
 * Relative-time wording for "checked 2m ago".
 *
 * Reuses the app's existing relative-time keys so the card speaks the same
 * language as the rest of Settings; no new units are invented. `null` means
 * no probe has succeeded yet — the card says so instead of printing a
 * timestamp it does not have.
 */
export type CheckedAgo =
  | { key: 'message.justNow' }
  | { key: 'message.minsAgo' | 'message.hoursAgo' | 'message.daysAgo'; count: number }

export const CHECKED_MINUTE_MS = 60_000

/**
 * Bucket the elapsed time since the last successful probe. The caller passes
 * the clock, so the same function serves the live tick and the harness.
 */
export function describeCheckedAt(lastConfirmedAt: number | null, now: number): CheckedAgo | null {
  if (lastConfirmedAt === null || !Number.isFinite(lastConfirmedAt)) return null
  const elapsed = now - lastConfirmedAt
  // Future stamps (clock adjusted backwards) read as "just now" rather than
  // as a negative age.
  if (!Number.isFinite(elapsed) || elapsed < CHECKED_MINUTE_MS) {
    return { key: 'message.justNow' }
  }
  const minutes = Math.floor(elapsed / CHECKED_MINUTE_MS)
  if (minutes < 60) return { key: 'message.minsAgo', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'message.hoursAgo', count: hours }
  return { key: 'message.daysAgo', count: Math.floor(hours / 24) }
}

/** The subset of the i18n API this formatter needs (kept structural for tests). */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Compose the header label. A card that has never confirmed its numbers
 * says "not checked yet"; it never borrows the "checked …" wording, because
 * that would imply a probe succeeded.
 */
export function formatCheckedLabel(
  t: Translate,
  lastConfirmedAt: number | null,
  now: number,
): string {
  if (lastConfirmedAt === null) return t('codex.account.checkedNever')
  const ago = describeCheckedAt(lastConfirmedAt, now)
  // describeCheckedAt only returns null for the null timestamp handled above.
  const relative = ago === null
    ? t('message.justNow')
    : 'count' in ago
      ? t(ago.key, { count: ago.count })
      : t(ago.key)
  return t('codex.account.checkedAgo', { time: relative })
}
