/**
 * The per-job spend rail for scheduled runs.
 *
 * An unattended job spends money while nobody watches. Earlier waves made that
 * spend visible after the fact; this module is the part that can say "not
 * today". Two facts shape every rule here:
 *
 *   - Only reported money counts. Codex reports tokens but no dollars, and some
 *     Claude routes omit `total_cost_usd`; comparing a limit against an estimate
 *     would invent the very number the rail is meant to police.
 *   - A window with no cost report therefore cannot be evaluated. It is not
 *     "$0 spent": such a run is allowed and the row says the limit could not be
 *     checked, because a limit that silently looks satisfied is the one failure
 *     mode worse than an unprotected job.
 *
 * The window is rolling, not calendar-based: every scheduled run asks how much
 * this job reported in the 24 hours up to now, so a job running at 23:00 does not
 * get a fresh allowance at midnight.
 *
 * Pure and Electron-free so `.scratch/wave17-spend-guard-harness` can pin `now`
 * and exercise the boundaries without a scheduler or a window.
 *
 * The second half of this module is the *global* daily cap: one number across
 * every job, because three jobs with a $5 limit each can still spend $15 a day.
 * It sums the same per-job windows rather than keeping a ledger of its own, so
 * deleting a job also removes its spend from the total — which is what "the
 * automations this app still knows about" means.
 */

import { AUTOMATION_HISTORY_CAP } from './run-history'
import type { RunUsage } from './run-usage'
import type {
  AutomationDeptSpend,
  AutomationGlobalSpendWindow,
  AutomationJob,
  AutomationRunRecord,
  AutomationRunRecordStatus,
  AutomationRunSource,
  AutomationSpendWindow,
} from './types'

/** A run counts as inside the window when `windowStart < startedAt <= now`. */
export const SPEND_WINDOW_MS = 24 * 60 * 60_000

/**
 * The largest limit worth accepting.
 *
 * A four-figure daily budget is already far beyond a personal automation, while
 * a number above this is much more likely a typo (an extra zero) than an
 * intention — and a typo would silently disable the rail the user asked for.
 */
export const MAX_DAILY_COST_LIMIT_USD = 1_000

/**
 * Validate a spend limit, returning absence for anything unusable.
 *
 * `undefined` is the only "no limit" representation: storing `0` would turn
 * "never set" and "set to nothing" into "every run is over budget", and would
 * also be indistinguishable from an engine's real `$0` report.
 */
export function normalizeDailyCostLimit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0 || value > MAX_DAILY_COST_LIMIT_USD) return undefined
  // Costs keep fractional precision; trimming below a millionth of a dollar
  // keeps repeated store rewrites from drifting the float the user typed.
  return Math.round(value * 1e6) / 1e6
}

function addCost(
  reportedCostUsd: number | undefined,
  costUsd: number | undefined,
): number | undefined {
  if (costUsd === undefined) return reportedCostUsd
  return (reportedCostUsd ?? 0) + costUsd
}

/**
 * What a window holds for one job.
 *
 * The window is supplied rather than derived from `now`: the rail's rolling 24
 * hours and a department's calendar window (local midnight to now) are the same
 * sum over different starts, and sharing this body is what keeps "inside the
 * window", "is an attempt" and "the capped history makes this a lower bound"
 * from drifting into a second, subtly different implementation.
 *
 * Only real attempts (success or error) count. A skip never executed, so it
 * carries no spend and must not make the window look "covered" or spent.
 */
export function summarizeSpendWindowFor(
  job: AutomationJob,
  now: number,
  windowStart: number,
): AutomationSpendWindow {
  const inWindow = (startedAt: number): boolean => startedAt > windowStart && startedAt <= now

  // The history is capped. A full list whose oldest record still falls inside
  // the window proves older runs in this window were evicted, so the sum is a
  // lower bound rather than a total.
  const partial =
    job.history.length >= AUTOMATION_HISTORY_CAP &&
    job.history.length > 0 &&
    job.history[0].startedAt > windowStart

  let reportedCostUsd: number | undefined
  let attemptedRuns = 0
  let unreportedRuns = 0

  const fold = (
    startedAt: number,
    status: AutomationRunRecordStatus,
    costUsd: number | undefined,
  ): void => {
    if (!inWindow(startedAt)) return
    // A skip is not an attempt: the guard fired before any work (or any spend).
    if (status === 'skipped') return
    attemptedRuns += 1
    if (costUsd === undefined) unreportedRuns += 1
    else reportedCostUsd = addCost(reportedCostUsd, costUsd)
  }

  for (const record of job.history) {
    fold(record.startedAt, record.status, record.usage?.costUsd)
  }

  // The history postdates the history feature, so a job persisted before it (or
  // a run whose record has not been appended yet) still carries its latest
  // facts on the job. Fold that run in only when its start is absent from the
  // history, which keeps it from being counted twice.
  if (
    job.lastRunAt !== null &&
    (job.lastStatus === 'success' || job.lastStatus === 'error') &&
    !job.history.some(record => record.startedAt === job.lastRunAt)
  ) {
    fold(job.lastRunAt, job.lastStatus, job.lastUsage?.costUsd)
  }

  return {
    windowStart,
    ...(reportedCostUsd !== undefined ? { reportedCostUsd } : {}),
    attemptedRuns,
    unreportedRuns,
    // With a partial window and no report, the missing runs may have spent
    // money the sum never saw, so the limit is equally unevaluable.
    unmeasured: reportedCostUsd === undefined && (attemptedRuns > 0 || partial),
    partial,
  }
}

/**
 * What the rolling 24-hour window holds for one job.
 *
 * Kept as a named entry point because every existing caller means exactly this
 * window; it is now a thin call into `summarizeSpendWindowFor`, so the result is
 * unchanged and the calendar and rolling windows cannot diverge.
 */
export function summarizeSpendWindow(job: AutomationJob, now: number): AutomationSpendWindow {
  return summarizeSpendWindowFor(job, now, now - SPEND_WINDOW_MS)
}

/**
 * Why a run may or may not start.
 *
 * `not_applicable` means there is nothing to enforce: the job has no limit, or
 * the user asked for this run by hand.
 */
export type SpendGuardDecision =
  | { kind: 'not_applicable' }
  | { kind: 'allowed'; summary: AutomationSpendWindow; unmeasured: boolean }
  | { kind: 'blocked'; summary: AutomationSpendWindow }

/**
 * Decide whether a scheduled run may start.
 *
 * `manual` is the Run now button / command palette: the user asked for this
 * run explicitly, so it is never blocked. Everything else about a manual run is
 * unchanged — it is still subject to the concurrency rail.
 *
 * At or above the limit blocks. The tiny epsilon only absorbs float dust from
 * summing fractional costs, so a sum that is mathematically exactly at the
 * limit is still treated as at the limit.
 *
 * `watch` is treated exactly like `scheduled`: a file landing in a watched
 * folder is unattended spend just as much as a clock tick is, and it is the
 * user's own limit either way. Only `manual` bypasses the rail.
 */
export function checkSpendLimit(
  job: AutomationJob,
  now: number,
  source: AutomationRunSource,
): SpendGuardDecision {
  if (source === 'manual') return { kind: 'not_applicable' }
  const limit = normalizeDailyCostLimit(job.dailyCostLimitUsd)
  if (limit === undefined) return { kind: 'not_applicable' }

  const summary = summarizeSpendWindow(job, now)
  if (summary.reportedCostUsd !== undefined && summary.reportedCostUsd + 1e-9 >= limit) {
    return { kind: 'blocked', summary }
  }
  return { kind: 'allowed', summary, unmeasured: summary.unmeasured }
}

// ── The global daily cap ─────────────────────────────
//
// Three jobs with a $5 limit each can still spend $15 a day. The per-job rail
// answers "which job is over its own budget"; users asked for one number that
// covers the day, so this half of the module sums every job's window instead of
// one job's. The rules are deliberately the same ones, not a parallel policy:
// only reported money counts, a window that reported nothing is unevaluable
// (and therefore allowed, loudly flagged), and a manual run is the user
// spending on purpose and is never blocked.

/**
 * What the shared rolling window holds across every job.
 *
 * Each job is summarised by `summarizeSpendWindow` rather than by folding the
 * histories again here: that function owns the definition of "inside the
 * window", "is an attempt", and "the capped history makes this a lower bound",
 * and a second implementation would eventually disagree with the first. Only
 * the totals are summed.
 *
 * Deleted jobs do not appear: their history left the store with them. A ledger
 * that remembered them would be a second source of truth for money, and the
 * user was asking for a cap on what the app still knows about, not an audit.
 */
export function summarizeGlobalSpendWindow(
  jobs: readonly AutomationJob[],
  now: number,
  globalDailyCostLimitUsd?: unknown,
): AutomationGlobalSpendWindow {
  const limitUsd = normalizeDailyCostLimit(globalDailyCostLimitUsd)
  let measuredUsd: number | undefined
  let unreportedRuns = 0
  let attemptedRuns = 0
  let partial = false

  for (const job of jobs) {
    const summary = summarizeSpendWindow(job, now)
    if (summary.reportedCostUsd !== undefined) {
      measuredUsd = (measuredUsd ?? 0) + summary.reportedCostUsd
    }
    unreportedRuns += summary.unreportedRuns
    attemptedRuns += summary.attemptedRuns
    // One job whose history no longer reaches the window start is enough to
    // make the shared total a lower bound: the evicted runs could belong to any
    // job, and the cap covers all of them.
    if (summary.partial) partial = true
  }

  return {
    ...(limitUsd !== undefined ? { limitUsd } : {}),
    ...(measuredUsd !== undefined ? { measuredUsd } : {}),
    unreportedRuns,
    // With a partial window and no report, the missing runs may have spent
    // money the sum never saw, so the cap is equally unevaluable.
    unmeasured: measuredUsd === undefined && (attemptedRuns > 0 || partial),
    partial,
  }
}

/**
 * Why a scheduled run may or may not start, considering every job's spend.
 *
 * Same decision shape as the per-job rail on purpose; `not_applicable` means
 * there is no cap, or the user asked for this run by hand.
 */
export type GlobalSpendGuardDecision =
  | { kind: 'not_applicable' }
  | { kind: 'allowed'; summary: AutomationGlobalSpendWindow; unmeasured: boolean }
  | { kind: 'blocked'; summary: AutomationGlobalSpendWindow }

/**
 * Decide whether a scheduled run may start under the shared daily cap.
 *
 * `jobs` is the scheduler's live list, including the job about to run: its own
 * earlier runs today are part of what the cap is counting. The scheduler calls
 * this only after the per-job rail has allowed the run — when both rails would
 * refuse, the more specific per-job reason wins and only one skip is written.
 *
 * At or above the limit blocks, with the same epsilon as the per-job rail so a
 * sum that is mathematically exactly at the cap is treated as at the cap. A
 * window whose runs reported no money is allowed (`unmeasured` tells the caller
 * to say the cap could not be checked); a window whose *measured* sum is
 * already over the cap is blocked even if other runs went unreported, because
 * the known spend alone has exhausted the budget.
 */
export function checkGlobalSpendLimit(
  jobs: readonly AutomationJob[],
  globalDailyCostLimitUsd: unknown,
  now: number,
  source: AutomationRunSource,
): GlobalSpendGuardDecision {
  // Same rule as the per-job rail: `watch` counts as unattended spend.
  if (source === 'manual') return { kind: 'not_applicable' }
  const limit = normalizeDailyCostLimit(globalDailyCostLimitUsd)
  if (limit === undefined) return { kind: 'not_applicable' }

  const summary = summarizeGlobalSpendWindow(jobs, now, limit)
  if (summary.measuredUsd !== undefined && summary.measuredUsd + 1e-9 >= limit) {
    return { kind: 'blocked', summary }
  }
  return { kind: 'allowed', summary, unmeasured: summary.unmeasured }
}

// ── Department spend ──────────────────────────────────
//
// A department's brief and job strip show what the automations filed under it
// cost. The org tree lives in the renderer, so the renderer resolves a subtree
// to node ids and asks main for the arithmetic only; main owns the spend rules,
// so this half calls `summarizeSpendWindowFor` rather than restating a single
// one of them. A second copy in the renderer would eventually disagree with the
// rails about what "attempted" or "unreported" means.
//
// Main never expands the subtree. The tree is the renderer's, node ids are
// opaque here, and inventing a parent/child convention would report spend the
// caller did not ask for or miss spend it did resolve. The set is taken
// literally.

/** Most org node ids one department-spend request may name. */
export const DEPT_SPEND_MAX_IDS = 200

/** Longest window a department-spend request may ask for: 31 days. */
export const DEPT_SPEND_MAX_WINDOW_MS = 31 * 24 * 60 * 60_000

const DEPT_RECORD_STATUSES: readonly AutomationRunRecordStatus[] = ['success', 'error', 'skipped']

/**
 * A cost report from a possibly malformed record, or absence.
 *
 * Only the cost matters to this sum, and only a finite, non-negative number is
 * a report. A string or NaN must neither throw nor turn the total into garbage;
 * treating it as unreported keeps the figure a lower bound instead of a lie.
 */
function deptUsage(value: unknown): RunUsage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const costUsd = (value as Record<string, unknown>).costUsd
  if (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd < 0) return undefined
  return { inputTokens: 0, outputTokens: 0, costUsd }
}

/**
 * One history entry, or null when it cannot be classified.
 *
 * The store normalizes persisted records, so this only defends the pure call
 * against a hand-built or corrupt array: a record with no finite start or an
 * unknown status cannot be called an attempt or a skip, so it is left out
 * rather than guessed at. That can only undercount, which the caller already
 * knows to read as a lower bound.
 */
function deptRecord(value: unknown): AutomationRunRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const startedAt = record.startedAt
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  const status = record.status
  if (typeof status !== 'string' || !DEPT_RECORD_STATUSES.includes(status as AutomationRunRecordStatus)) {
    return null
  }
  return {
    ...(record as unknown as AutomationRunRecord),
    startedAt,
    status: status as AutomationRunRecordStatus,
    // Explicit, so a malformed usage object from the spread cannot survive.
    usage: deptUsage(record.usage),
  }
}

/**
 * One job with its history and latest-run fields made safe to summarise.
 *
 * `summarizeSpendWindowFor` assumes the store's invariants; a job handed
 * straight to the pure function may be missing `history` entirely or carry
 * records that are not objects. Defaulting to an empty history and dropping
 * unclassifiable records is the least inventive repair.
 */
function deptJob(value: unknown): AutomationJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const job = value as AutomationJob
  const history = Array.isArray(job.history)
    ? (job.history as unknown[])
      .map(deptRecord)
      .filter((record): record is AutomationRunRecord => record !== null)
    : []
  return {
    ...job,
    history,
    lastRunAt: typeof job.lastRunAt === 'number' && Number.isFinite(job.lastRunAt)
      ? job.lastRunAt
      : null,
    lastUsage: deptUsage(job.lastUsage),
  }
}

/**
 * Validate the wire request for a department spend read.
 *
 * The renderer resolves the subtree, so the ids are taken as given, trimmed and
 * deduplicated. An empty list is refused because "no ids" is not the same
 * question as "these ids" and would silently become a whole-store answer in
 * some callers. A list longer than `DEPT_SPEND_MAX_IDS` is refused rather than
 * truncated: dropping ids would undercount the department's spend, and an
 * undercount is worse than a visible refusal.
 *
 * The window must be finite and no deeper than 31 days. The upper bound keeps a
 * renderer bug from turning every read into a full-history scan; the lower
 * bound exists for the same reason. `windowStart === now` is valid — it is an
 * empty window, which is a real answer.
 */
export function normalizeDeptSpendRequest(
  raw: unknown,
): { departmentIds: string[]; windowStart: number } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const request = raw as Record<string, unknown>

  if (!Array.isArray(request.departmentIds)) return null
  const departmentIds: string[] = []
  const seen = new Set<string>()
  for (const value of request.departmentIds) {
    // A non-string entry is a renderer bug, not an id; drop it rather than
    // letting a coerced `[object Object]` become a department.
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    departmentIds.push(id)
  }
  if (departmentIds.length === 0 || departmentIds.length > DEPT_SPEND_MAX_IDS) return null

  const windowStart = request.windowStart
  if (typeof windowStart !== 'number' || !Number.isFinite(windowStart)) return null
  // `Date.now()` is read here because the request shape is fixed to two fields;
  // the caller summarising the window passes its own `now`, so a few ms of drift
  // only widens the end of the window, never accepts a future start.
  const now = Date.now()
  if (windowStart > now || windowStart < now - DEPT_SPEND_MAX_WINDOW_MS) return null

  return { departmentIds, windowStart }
}

/**
 * Reported spend for the jobs filed under exactly these department ids.
 *
 * `jobsCounted` counts matching jobs even when they have no run in the window:
 * "three jobs filed here, nothing ran" is a different answer from "nothing is
 * filed here", and only the caller's tree can decide which is surprising.
 *
 * Per-job figures come from `summarizeSpendWindowFor`, so a skip is not an
 * attempt, a run that reported no money makes the total a lower bound, and a
 * capped history that cannot reach `windowStart` marks the whole answer
 * `partial`. Only the totals are folded here.
 *
 * `reportedCostUsd` is absent, never 0, when no counted run reported money: a
 * real `$0` report from an engine and "nobody knows" are different facts. The
 * same doctrine as the rails decides `unmeasured` — with attempts or a partial
 * window and no reported cost, the figure cannot be read as "spent nothing".
 */
export function summarizeDeptSpend(
  jobs: readonly AutomationJob[],
  departmentIds: readonly string[],
  windowStart: number,
  now: number,
): AutomationDeptSpend {
  const wanted = new Set(departmentIds)
  let jobsCounted = 0
  let attemptedRuns = 0
  let unreportedRuns = 0
  let reportedCostUsd: number | undefined
  let partial = false

  // A non-array is treated as no jobs: this is a read, and an empty answer is
  // honest about a store the caller could not supply.
  const list: readonly unknown[] = Array.isArray(jobs) ? jobs : []
  for (const raw of list) {
    const job = deptJob(raw)
    if (!job) continue
    const departmentId = job.departmentId
    // Exact id only: main does not know the tree and must not infer that one
    // id contains another. A blank (including whitespace-only) or non-string
    // filing is not an id and never matches anything.
    if (
      typeof departmentId !== 'string' ||
      departmentId.trim().length === 0 ||
      !wanted.has(departmentId)
    ) {
      continue
    }
    jobsCounted += 1
    const summary = summarizeSpendWindowFor(job, now, windowStart)
    if (summary.reportedCostUsd !== undefined) {
      reportedCostUsd = (reportedCostUsd ?? 0) + summary.reportedCostUsd
    }
    attemptedRuns += summary.attemptedRuns
    unreportedRuns += summary.unreportedRuns
    // One job whose history cannot reach the window start is enough to make
    // the department total a lower bound, whichever job the evicted runs were.
    if (summary.partial) partial = true
  }

  return {
    windowStart,
    windowEnd: now,
    jobsCounted,
    attemptedRuns,
    ...(reportedCostUsd !== undefined ? { reportedCostUsd } : {}),
    unreportedRuns,
    unmeasured: reportedCostUsd === undefined && (attemptedRuns > 0 || partial),
    partial,
  }
}
