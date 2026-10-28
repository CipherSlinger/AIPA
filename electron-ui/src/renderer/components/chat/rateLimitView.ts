/**
 * Pure view model for Codex's account rate limits.
 *
 * Every field below is taken from the installed Codex 0.145 schema, not from
 * memory (`node node_modules/@openai/codex/bin/codex.js app-server
 * generate-json-schema --out .scratch/codex-schema`):
 *
 *   - `account/rateLimits/updated` → params.rateLimits: RateLimitSnapshot
 *     (`v2/AccountRateLimitsUpdatedNotification.json`)
 *   - `account/rateLimits/read` → rateLimits: RateLimitSnapshot
 *     (`v2/GetAccountRateLimitsResponse.json`)
 *   - RateLimitWindow { usedPercent (0-100), windowDurationMins, resetsAt }
 *     — binary doc strings: "Percentage (0-100) of the window that has been
 *     consumed", "Rolling window duration, in minutes", "Unix timestamp
 *     (seconds since epoch) when the window resets."
 *
 * The notification is explicitly a *sparse* rolling update: "Clients should
 * merge available values into the most recent `account/rateLimits/read`
 * response ... Nullable account metadata may be unavailable in a rolling update
 * and does not clear a previously observed value." `mergeRateLimitSnapshots`
 * is that rule, kept here so the hook cannot forget it.
 *
 * Nothing in this file explains *why* a limit applies: only the numbers and
 * the server's own `rateLimitReachedType` are surfaced.
 */

/** The one conservative line between "normal" and "near the limit". */
export const RATE_LIMIT_WARNING_PERCENT = 80

/** One `RateLimitWindow`, after validation. `usedPercent` is required on the wire. */
export interface RateLimitWindowData {
  usedPercent: number
  windowDurationMins: number | null
  /** Unix seconds, per the protocol's own doc string. */
  resetsAt: number | null
}

/** The subset of `RateLimitSnapshot` this view needs; every field is nullable on the wire. */
export interface RateLimitSnapshotData {
  limitId: string | null
  limitName: string | null
  planType: string | null
  primary: RateLimitWindowData | null
  secondary: RateLimitWindowData | null
  rateLimitReachedType: string | null
  spendControlReached: boolean | null
}

export type RateLimitLevel = 'normal' | 'warning' | 'reached'

export interface RateLimitWindowView {
  /** Which wire slot the window arrived in; the schema has no friendlier name. */
  window: 'primary' | 'secondary'
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
  /** Whole minutes from `now` until `resetsAt`; null when unknown or already past. */
  resetInMinutes: number | null
  level: RateLimitLevel
}

export interface RateLimitView {
  windows: RateLimitWindowView[]
  planType: string | null
  limitName: string | null
  /** The server's own enum, verbatim. Never translated into a guessed cause. */
  rateLimitReachedType: string | null
  spendControlReached: boolean | null
  /** A window is at 100%, spend control is reached, or a reached reason came without numbers. */
  atLimit: boolean
  /** At/near the limit: atLimit, >= RATE_LIMIT_WARNING_PERCENT, or spend control reached. */
  warning: boolean
  /** Highest usedPercent across the windows; null when the payload had none. */
  worstUsedPercent: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseWindow(raw: unknown): RateLimitWindowData | null {
  const window = asRecord(raw)
  if (!window) return null
  const usedPercent = finiteNumberOrNull(window.usedPercent)
  // A negative percentage is malformed rather than a real measurement; a value
  // above 100 is kept verbatim because the number is the server's statement.
  if (usedPercent === null || usedPercent < 0) return null
  const duration = finiteNumberOrNull(window.windowDurationMins)
  const resetsAt = finiteNumberOrNull(window.resetsAt)
  return {
    usedPercent,
    windowDurationMins: duration !== null && duration > 0 ? duration : null,
    resetsAt: resetsAt !== null && resetsAt > 0 ? resetsAt : null,
  }
}

/**
 * Validate one `RateLimitSnapshot`. Returns null when it carries nothing the
 * banner can honestly show, so the component renders nothing instead of an
 * empty shell.
 */
export function parseRateLimitSnapshot(raw: unknown): RateLimitSnapshotData | null {
  const snapshot = asRecord(raw)
  if (!snapshot) return null

  const primary = parseWindow(snapshot.primary)
  const secondary = parseWindow(snapshot.secondary)
  const rateLimitReachedType = nonEmptyStringOrNull(snapshot.rateLimitReachedType)
  const spendControlReached = typeof snapshot.spendControlReached === 'boolean'
    ? snapshot.spendControlReached
    : null

  if (!primary && !secondary && rateLimitReachedType === null && spendControlReached === null) {
    return null
  }

  return {
    limitId: nonEmptyStringOrNull(snapshot.limitId),
    limitName: nonEmptyStringOrNull(snapshot.limitName),
    planType: nonEmptyStringOrNull(snapshot.planType),
    primary,
    secondary,
    rateLimitReachedType,
    spendControlReached,
  }
}

/**
 * Pull the snapshot out of either protocol payload. The main process forwards
 * the notification as `{ rateLimits }` and the read response the same way; a
 * bare snapshot is also accepted so a future caller cannot quietly render
 * nothing just because it forwarded `params.rateLimits` directly.
 */
export function extractRateLimitSnapshot(payload: unknown): RateLimitSnapshotData | null {
  const record = asRecord(payload)
  if (!record) return null
  if (asRecord(record.rateLimits)) return parseRateLimitSnapshot(record.rateLimits)
  return parseRateLimitSnapshot(record)
}

/**
 * Merge a window from a sparse update into the previously observed window.
 * `usedPercent` is required whenever a window is present, so it always
 * replaces; the nullable fields only replace when the update actually carried
 * a value, matching the schema's "does not clear a previously observed value".
 */
function mergeWindow(
  previous: RateLimitWindowData | null,
  next: RateLimitWindowData | null,
): RateLimitWindowData | null {
  if (!next) return previous
  if (!previous) return next
  return {
    usedPercent: next.usedPercent,
    windowDurationMins: next.windowDurationMins ?? previous.windowDurationMins,
    resetsAt: next.resetsAt ?? previous.resetsAt,
  }
}

/** Apply the sparse-update rule to a whole snapshot. Never mutates either input. */
export function mergeRateLimitSnapshots(
  previous: RateLimitSnapshotData | null,
  next: RateLimitSnapshotData,
): RateLimitSnapshotData {
  if (!previous) return next
  return {
    limitId: next.limitId ?? previous.limitId,
    limitName: next.limitName ?? previous.limitName,
    planType: next.planType ?? previous.planType,
    primary: mergeWindow(previous.primary, next.primary),
    secondary: mergeWindow(previous.secondary, next.secondary),
    // The schema calls these nullable metadata too: `null` means "unavailable",
    // not "recovered", so an absent reached reason cannot clear a known one.
    rateLimitReachedType: next.rateLimitReachedType ?? previous.rateLimitReachedType,
    spendControlReached: next.spendControlReached ?? previous.spendControlReached,
  }
}

function levelFor(usedPercent: number): RateLimitLevel {
  if (usedPercent >= 100) return 'reached'
  if (usedPercent >= RATE_LIMIT_WARNING_PERCENT) return 'warning'
  return 'normal'
}

/**
 * Build the display view, or null when there is nothing to show. `now` is
 * injectable so the reset countdown is testable and never depends on wall time
 * inside a pure function.
 */
export function buildRateLimitView(
  snapshot: RateLimitSnapshotData | null,
  now: number = Date.now(),
): RateLimitView | null {
  if (!snapshot) return null

  const windows: RateLimitWindowView[] = []
  for (const slot of ['primary', 'secondary'] as const) {
    const window = snapshot[slot]
    if (!window) continue
    windows.push({
      window: slot,
      usedPercent: window.usedPercent,
      windowDurationMins: window.windowDurationMins,
      resetsAt: window.resetsAt,
      resetInMinutes: window.resetsAt !== null && window.resetsAt * 1000 > now
        ? Math.ceil((window.resetsAt * 1000 - now) / 60_000)
        : null,
      level: levelFor(window.usedPercent),
    })
  }

  // The windows are the fresher statement. A `rateLimitReachedType` survives a
  // sparse merge by design (null means "unavailable", not "cleared"), so a
  // reached reason known an hour ago would otherwise keep a chip red after the
  // window it described has reset. It only decides the verdict when no window
  // numbers came with it; otherwise the percentages speak for themselves.
  const atLimit = snapshot.spendControlReached === true
    || windows.some(window => window.level === 'reached')
    || (windows.length === 0 && snapshot.rateLimitReachedType !== null)
  const warning = atLimit || windows.some(window => window.level === 'warning')

  // A reached reason alone is still worth a line even without window numbers.
  if (windows.length === 0 && !atLimit) return null

  let worstUsedPercent: number | null = null
  for (const window of windows) {
    if (worstUsedPercent === null || window.usedPercent > worstUsedPercent) {
      worstUsedPercent = window.usedPercent
    }
  }

  return {
    windows,
    planType: snapshot.planType,
    limitName: snapshot.limitName,
    rateLimitReachedType: snapshot.rateLimitReachedType,
    spendControlReached: snapshot.spendControlReached,
    atLimit,
    warning,
    worstUsedPercent,
  }
}

export interface RateLimitDurationHint {
  unit: 'minutes' | 'hours' | 'days'
  value: number
}

/**
 * Wording for a rolling window's length. Only the server's own minutes are
 * converted; a 90-minute window stays "90 min" rather than being rounded into
 * a claim it did not make.
 */
export function formatWindowHint(windowDurationMins: number | null): RateLimitDurationHint | null {
  if (windowDurationMins === null || !Number.isFinite(windowDurationMins) || windowDurationMins <= 0) {
    return null
  }
  const minutes = Math.round(windowDurationMins)
  if (minutes % 1440 === 0) return { unit: 'days', value: minutes / 1440 }
  if (minutes % 60 === 0) return { unit: 'hours', value: minutes / 60 }
  return { unit: 'minutes', value: minutes }
}

/**
 * Wording for "resets in …". A reset time in the past yields null: the chip
 * then says the time is unknown instead of claiming a countdown that has
 * already run out.
 */
export function formatResetHint(resetInMinutes: number | null): RateLimitDurationHint | null {
  if (resetInMinutes === null || !Number.isFinite(resetInMinutes) || resetInMinutes <= 0) {
    return null
  }
  const minutes = Math.ceil(resetInMinutes)
  if (minutes < 60) return { unit: 'minutes', value: minutes }
  if (minutes < 1440) return { unit: 'hours', value: Math.ceil(minutes / 60) }
  return { unit: 'days', value: Math.ceil(minutes / 1440) }
}
