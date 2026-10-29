/**
 * The daily spend cap on a department, and the rail that enforces it.
 *
 * A department cap sits between "this one job's limit" and "everything's
 * limit". Users filed jobs under departments and asked for a hold on the
 * department's unattended spend as a whole; the amount is the same kind of
 * number as the other two rails and every rule is the same one, so this module
 * calls `summarizeDeptSpend` (which itself folds `summarizeSpendWindowFor`)
 * rather than re-deriving a window. Only reported money counts, a window with
 * runs but no cost report cannot be evaluated and so the run is allowed with a
 * loud warning, and a manual run is the user spending on purpose and is never
 * held.
 *
 * Two facts shape the storage half:
 *
 *   - The org tree never reaches the main process. A cap is stored as the node
 *     ids the renderer last synced (`memberIds`), and the rail matches a job's
 *     `departmentId` against that list exactly. Main must not infer that one id
 *     contains another.
 *   - A cap that cannot be read is not a cap. Every malformed entry is dropped
 *     on restore, an unreadable store means no caps, and a cap with no usable
 *     membership is not stored at all: an active-looking budget that covers
 *     nothing is worse than an absent one, because the user would believe
 *     unattended spend was held.
 *
 * The report also answers "when would waiting help?". A run's cost leaves the
 * rolling window 24 h after it started, so when the cap is over the report can
 * name the first instant the spend is expected to fall below it. That number is
 * offered only when the attempt list proves it (every attempt costed, no member
 * history truncated); otherwise the report says why it cannot be given rather
 * than guessing. A forecast is not a promise: a held occurrence is gone, and
 * only the cap frees.
 *
 * Pure and Electron-free: the store owns the file, the scheduler owns the live
 * list, and `.scratch/wave58a-dept-budget-harness` can pin `now` and exercise
 * each rule without either.
 */

import { normalizeDepartmentId } from './job-department'
import {
  SPEND_WINDOW_MS,
  collectDeptCostedAttempts,
  summarizeDeptSpend,
  type DeptCostedAttempt,
} from './spend-guard'
import type {
  AutomationDeptBudget,
  AutomationDeptBudgetReport,
  AutomationDeptSpend,
  AutomationJob,
  AutomationRunSource,
} from './types'

/**
 * The largest department cap worth accepting.
 *
 * Higher than the per-job ceiling on purpose: a cap covers every job filed
 * under a subtree, so it is a budget for a group of jobs rather than one. It is
 * still bounded, because a four-figure typo (an extra zero) would silently
 * disable the hold the user asked for.
 */
export const MAX_DEPT_BUDGET_USD = 10_000

/** Budgets kept. One per org node; far more than a personal tree tends to have. */
export const DEPT_BUDGET_MAX_ENTRIES = 200

/**
 * Node ids one cap may cover.
 *
 * Also the bound on how many ids a single job lookup walks, so the rail's cost
 * per run has a ceiling that does not depend on how large the user's tree grew.
 */
export const DEPT_BUDGET_MAX_MEMBER_IDS = 500

/**
 * A storable cap amount, or `undefined` for anything unusable.
 *
 * `undefined` is the only "no cap" representation, exactly like the other
 * rails: storing `0` would mean "already spent", which would hold every
 * unattended run forever.
 */
export function normalizeDeptBudgetUsd(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0 || value > MAX_DEPT_BUDGET_USD) return undefined
  // Same float policy as the per-job rail: keep fractional cents, trim below a
  // millionth so repeated saves do not drift the number the user typed.
  return Math.round(value * 1e6) / 1e6
}

/**
 * The member ids a cap covers, trimmed and deduplicated, or null when the value
 * is not a list at all.
 *
 * A list longer than the bound is truncated rather than refused: membership is
 * a coverage claim, and dropping the tail can only mean a cap covers fewer
 * nodes than the renderer intended — it can never make a run be held that
 * otherwise would not be. The opposite choice (refusing the whole list) would
 * leave the cap covering nothing, which reads as active while holding nothing.
 */
export function normalizeMemberIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const ids: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (ids.length >= DEPT_BUDGET_MAX_MEMBER_IDS) break
    const id = normalizeDepartmentId(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/** Epoch ms, or 0 for a missing or malformed one. 0 reads as "not known". */
function timestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}

/**
 * Restore one stored cap, or drop it.
 *
 * The drop rules are the fail-open ones: no department id, no positive amount
 * within the ceiling, or no list of members all mean this entry cannot hold
 * anything, so it reads as absent. A corrupt entry never makes the whole store
 * unreadable and never refuses a run.
 */
export function normalizeDeptBudget(raw: unknown): AutomationDeptBudget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const departmentId = normalizeDepartmentId(record.departmentId)
  if (!departmentId) return null
  const usd = normalizeDeptBudgetUsd(record.usd)
  if (usd === undefined) return null
  const memberIds = normalizeMemberIds(record.memberIds)
  // Not an array at all, or nothing usable survived the trim: a cap that covers
  // no node can never hold a run, so keeping it would only display an "active"
  // budget that does nothing.
  if (memberIds === null || memberIds.length === 0) return null
  const updatedAt = timestamp(record.updatedAt)
  return {
    departmentId,
    memberIds,
    usd,
    updatedAt,
    // A cap written before `syncedAt` existed was synced when it was last
    // edited, which is the least inventive answer.
    syncedAt: timestamp(record.syncedAt) || updatedAt,
  }
}

/**
 * Restore the stored cap list.
 *
 * Not an array means no caps; entries are validated one by one and the list is
 * bounded. A duplicate department id keeps the first stored entry, so a
 * hand-edited file cannot make "the first matching cap" depend on array order
 * in a way the rest of the code would have to special-case.
 */
export function normalizeDeptBudgets(value: unknown): AutomationDeptBudget[] {
  if (!Array.isArray(value)) return []
  const budgets: AutomationDeptBudget[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (budgets.length >= DEPT_BUDGET_MAX_ENTRIES) break
    const budget = normalizeDeptBudget(raw)
    if (!budget || seen.has(budget.departmentId)) continue
    seen.add(budget.departmentId)
    budgets.push(budget)
  }
  return budgets
}

/** Membership compared as a set: the tree's order is not meaningful here. */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const known = new Set(a)
  return b.every(id => known.has(id))
}

export type DeptBudgetSetResult =
  | { ok: true; budgets: AutomationDeptBudget[]; changed: boolean }
  | { ok: false; error: string }

/**
 * Set or clear one department's cap.
 *
 * `usd: null` (or absent) clears it. A positive number sets it; anything else —
 * 0, a negative, NaN, a string, above the ceiling — is refused rather than
 * coerced, because a typo must not quietly remove or weaken the hold.
 *
 * `memberIds` must name at least one node. A cap covering no node could never
 * hold anything and would still look active on every surface, which is the one
 * misleading state the user cannot detect; the renderer sends its subtree, so
 * an empty one is a real "nothing is filed here" and there is nothing to cap.
 *
 * A save that repeats the stored amount and membership is a no-op: the store is
 * not rewritten, the timestamps do not move, and no `automation:changed` is
 * broadcast, so a settings page saving without editing does not refresh every
 * automation surface.
 */
export function applyDeptBudgetSet(
  budgets: readonly AutomationDeptBudget[],
  raw: unknown,
  now: number,
): DeptBudgetSetResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'department_invalid' }
  }
  const input = raw as Record<string, unknown>
  const departmentId = normalizeDepartmentId(input.departmentId)
  if (!departmentId) return { ok: false, error: 'department_invalid' }

  const index = budgets.findIndex(budget => budget.departmentId === departmentId)

  if (input.usd === null || input.usd === undefined) {
    if (index < 0) return { ok: true, budgets: [...budgets], changed: false }
    return {
      ok: true,
      budgets: budgets.filter(budget => budget.departmentId !== departmentId),
      changed: true,
    }
  }

  const usd = normalizeDeptBudgetUsd(input.usd)
  if (usd === undefined) return { ok: false, error: 'invalid_limit' }

  const memberIds = normalizeMemberIds(input.memberIds)
  if (memberIds === null || memberIds.length === 0) {
    return { ok: false, error: 'no_members' }
  }

  const existing = index >= 0 ? budgets[index] : undefined
  if (existing && existing.usd === usd && sameMembers(existing.memberIds, memberIds)) {
    return { ok: true, budgets: [...budgets], changed: false }
  }
  if (!existing && budgets.length >= DEPT_BUDGET_MAX_ENTRIES) {
    return { ok: false, error: 'too_many_budgets' }
  }

  const next: AutomationDeptBudget = {
    departmentId,
    memberIds,
    usd,
    updatedAt: now,
    syncedAt: now,
  }
  const list = [...budgets]
  if (index >= 0) list[index] = next
  else list.push(next)
  return { ok: true, budgets: list, changed: true }
}

/**
 * Refresh the membership of caps that already exist.
 *
 * This is the renderer's org tree talking: nodes move, new ones appear, and a
 * cap set on a department should start covering what is filed under it now
 * without the user re-entering the amount. Nothing here can *create* a cap —
 * an entry naming an unknown department is ignored — so a renderer bug cannot
 * silently put a hold on a department the user never capped.
 *
 * `updatedAt` is untouched: the amount did not change, and a surface showing
 * "last edited" must keep saying when the user last edited it.
 *
 * An entry whose membership is unusable, or trims down to nothing, is ignored
 * rather than applied: replacing a working cap's coverage with an empty list
 * would leave it displayed but holding nothing. The last usable membership
 * stays until a usable one arrives, which is the fail-open direction — the cap
 * can only cover less, never block a run it did not cover before.
 */
export function applyDeptBudgetSync(
  budgets: readonly AutomationDeptBudget[],
  rawEntries: unknown,
  now: number,
): { ok: boolean; budgets: AutomationDeptBudget[]; changed: boolean; error?: string } {
  if (!Array.isArray(rawEntries)) {
    return { ok: false, budgets: [...budgets], changed: false, error: 'entries_invalid' }
  }

  // First usable entry per department wins, mirroring the store's "first stored
  // cap wins" rule so a duplicated entry cannot make the answer order-dependent.
  const membership = new Map<string, string[]>()
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as Record<string, unknown>
    const departmentId = normalizeDepartmentId(entry.departmentId)
    if (!departmentId || membership.has(departmentId)) continue
    const memberIds = normalizeMemberIds(entry.memberIds)
    if (!memberIds || memberIds.length === 0) continue
    membership.set(departmentId, memberIds)
  }

  let changed = false
  const next = budgets.map(budget => {
    const memberIds = membership.get(budget.departmentId)
    if (!memberIds || sameMembers(budget.memberIds, memberIds)) return budget
    changed = true
    return { ...budget, memberIds, syncedAt: now }
  })
  return { ok: true, budgets: changed ? next : [...budgets], changed }
}

/**
 * When a cap that is *already over* will stop being over, or `undefined` when
 * the attempt list cannot prove it.
 *
 * The window is rolling: a run's cost leaves it exactly
 * `SPEND_WINDOW_MS` after it started. Assuming nothing else runs in the
 * meantime, spend falls only at those instants, so the answer is one of the
 * attempts' start times plus the window. Walking the costed attempts oldest
 * first and subtracting one at a time finds the first removal after which the
 * remaining spend no longer trips the rail.
 *
 * "No longer trips the rail" is the rail's own predicate, not a rounded idea of
 * it: `checkDeptBudgetLimit` holds while `spend + 1e-9 >= cap`, so spend that is
 * mathematically exactly at the cap is still held (float dust included) and the
 * oldest run must still leave before anything frees. Using `<= cap` here would
 * print a time at which the scheduler would still refuse the run.
 *
 * A non-positive cap cannot be stored (`normalizeDeptBudgetUsd` refuses it), so
 * this branch only guards a hand-built budget: nothing can ever fall *below* a
 * cap at or under zero, and the only instant that ends the hold is an empty
 * window — the latest in-window attempt plus the window. No division, no loop
 * that depends on the cap's magnitude. No attempts with a reported cost means
 * there was nothing to free; `now` is the honest answer and the window already
 * spends nothing.
 *
 * Pure: it takes the attempts, the cap and the clock, nothing else.
 */
function computeDeptFreesAt(
  attempts: readonly DeptCostedAttempt[],
  capUsd: number,
  now: number,
): number | undefined {
  if (!(capUsd > 0)) {
    if (attempts.length === 0) return now
    let latest = attempts[0].startedAt
    for (const attempt of attempts) {
      if (attempt.startedAt > latest) latest = attempt.startedAt
    }
    return latest + SPEND_WINDOW_MS
  }

  const blocks = (total: number): boolean => total + 1e-9 >= capUsd

  let total = 0
  for (const attempt of attempts) total += attempt.costUsd
  if (!blocks(total)) return undefined

  // Chronological order is the only order in which "the next removal" means
  // "the next instant the window loses a run". Ties are harmless: two attempts
  // with the same start leave the window at the same instant, so whichever is
  // removed first yields the same answer.
  const ordered = [...attempts].sort((a, b) => a.startedAt - b.startedAt)
  let remaining = total
  for (const attempt of ordered) {
    remaining -= attempt.costUsd
    if (!blocks(remaining)) return attempt.startedAt + SPEND_WINDOW_MS
  }
  // Every costed attempt has left and the sum still reads as over (only a cap
  // at or below the rail's own epsilon can get here). Better to claim no time
  // than one the scheduler would not honour.
  return undefined
}

/**
 * One stored cap with its live figures.
 *
 * The spend half comes from `summarizeDeptSpend`, so this report and the
 * department brief's figure can never disagree about a window. The held counts
 * are folded here because they are a different question: not "what did the
 * department spend" but "what did this cap stop", which only the run records
 * with `skipReason: 'dept-budget'` can answer.
 *
 * `freesAt` answers the question the hold makes the user ask — "when is it
 * worth trying again?" — and only when the answer is a fact, not a guess:
 *
 *   - only when the reported spend is over the cap, because otherwise the
 *     question does not arise;
 *   - never when any in-window attempt reported no cost, because the total is
 *     then a lower bound and the walk would be subtracting from a number that
 *     is not the spend;
 *   - never when a member job's capped history cannot reach the window start,
 *     because evicted attempts may include the very cost that keeps the hold
 *     alive.
 *
 * Even when it is given, the time is a forecast: a held occurrence is gone, and
 * only the cap frees at that instant — nothing runs because of it.
 *
 * "Latest run" means the last record in the job's history. The store appends in
 * time order and caps from the newest end, so the last element is the most
 * recent run; reading the maximum `startedAt` instead would quietly disagree
 * with every other reader of the same list.
 */
export function buildDeptBudgetReport(
  budget: AutomationDeptBudget,
  jobs: readonly AutomationJob[],
  now: number,
): AutomationDeptBudgetReport {
  const windowStart = now - SPEND_WINDOW_MS
  const summary = summarizeDeptSpend(jobs, budget.memberIds, windowStart, now)
  const wanted = new Set(budget.memberIds)

  let heldRuns = 0
  let heldJobs = 0
  const list: readonly unknown[] = Array.isArray(jobs) ? jobs : []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const job = raw as AutomationJob
    // Exact id only, the same rule `summarizeDeptSpend` applies: main does not
    // know the tree and must not infer that one id contains another.
    if (typeof job.departmentId !== 'string' || !wanted.has(job.departmentId)) continue
    const history: unknown[] = Array.isArray(job.history) ? job.history : []
    const latest = history.length > 0 ? history[history.length - 1] : null
    let latestHeld = false
    for (const entry of history) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const record = entry as Record<string, unknown>
      if (record.status !== 'skipped' || record.skipReason !== 'dept-budget') continue
      const startedAt = record.startedAt
      // The same inclusive-start, inclusive-end window as the spend rails.
      if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) continue
      if (!(startedAt > windowStart && startedAt <= now)) continue
      heldRuns += 1
      if (entry === latest) latestHeld = true
    }
    if (latestHeld) heldJobs += 1
  }

  // Same predicate as the rail, for the same reason it exists: at or above the
  // cap the hold bites. A window nobody could measure is not "over" — it has no
  // total to compare — and `unmeasured` already says so on the surface.
  const overCap = summary.reportedCostUsd !== undefined
    && summary.reportedCostUsd + 1e-9 >= budget.usd

  let freesAt: number | undefined
  let freesUnknown: 'unmeasured' | 'partial' | undefined
  if (overCap) {
    // A missing cost makes the total a floor: subtracting known costs from it
    // would predict a freeing time for a window that may hold unknown spend of
    // its own. `unreportedRuns` is the right test — `unmeasured` is only true
    // when *no* run reported a cost, which also leaves nothing to compare.
    if (summary.unreportedRuns > 0) {
      freesUnknown = 'unmeasured'
    } else if (summary.partial) {
      // Evicted attempts could be the ones keeping the hold alive, so the walk
      // has no complete list to leave from.
      freesUnknown = 'partial'
    } else {
      freesAt = computeDeptFreesAt(
        collectDeptCostedAttempts(jobs, budget.memberIds, windowStart, now),
        budget.usd,
        now,
      )
    }
  }

  return {
    departmentId: budget.departmentId,
    memberIds: [...budget.memberIds],
    usd: budget.usd,
    updatedAt: budget.updatedAt,
    syncedAt: budget.syncedAt,
    ...(summary.reportedCostUsd !== undefined ? { spentUsd: summary.reportedCostUsd } : {}),
    unreportedRuns: summary.unreportedRuns,
    unmeasured: summary.unmeasured,
    partial: summary.partial,
    heldJobs,
    heldRuns,
    ...(freesAt !== undefined ? { freesAt } : {}),
    ...(freesUnknown !== undefined ? { freesUnknown } : {}),
  }
}

/**
 * Why an unattended run may or may not start under a department cap.
 *
 * Same decision shape as the other two rails on purpose. `not_applicable` means
 * there is no cap covering this job's department, the job is filed nowhere, or
 * the user asked for this run by hand.
 */
export type DeptBudgetGuardDecision =
  | { kind: 'not_applicable' }
  | {
    kind: 'allowed'
    budget: AutomationDeptBudget
    summary: AutomationDeptSpend
    /** Runs happened with no cost report, so the cap could not be checked. */
    unmeasured: boolean
    /** The capped history may not reach the window start, so this is a floor. */
    partial: boolean
  }
  | { kind: 'blocked'; budget: AutomationDeptBudget; summary: AutomationDeptSpend }

/**
 * Decide whether a scheduled or watch-triggered run may start.
 *
 * The first stored cap whose membership contains the job's department is the
 * one that applies. "First" is the store's order and nothing else: a job is
 * filed under one department, and that department is a node in a tree, so more
 * than one cap covering it would mean the renderer synced overlapping
 * memberships — a case with no defined precedence. Taking the first keeps the
 * answer deterministic instead of inventing a tie-break between two holds the
 * user set.
 *
 * At or above the cap blocks, with the same float epsilon as the per-job rail.
 * A window whose runs reported no money is allowed and flagged `unmeasured`: a
 * cap that silently looks satisfied is the failure mode worse than an
 * unprotected run. A `partial` window is likewise a lower bound and must not
 * read as "spent nothing", which is why the unmeasured rule is delegated to
 * `summarizeDeptSpend` rather than restated here.
 */
export function checkDeptBudgetLimit(
  budgets: readonly AutomationDeptBudget[],
  jobs: readonly AutomationJob[],
  job: AutomationJob,
  now: number,
  source: AutomationRunSource,
): DeptBudgetGuardDecision {
  // `watch` counts as unattended spend exactly like `scheduled`; only `manual`
  // is the user spending on purpose and therefore exempt.
  if (source === 'manual') return { kind: 'not_applicable' }

  const departmentId = normalizeDepartmentId(job.departmentId)
  if (!departmentId) return { kind: 'not_applicable' }

  const budget = budgets.find(entry =>
    Array.isArray(entry.memberIds) && entry.memberIds.includes(departmentId))
  if (!budget) return { kind: 'not_applicable' }

  const summary = summarizeDeptSpend(jobs, budget.memberIds, now - SPEND_WINDOW_MS, now)
  if (summary.reportedCostUsd !== undefined && summary.reportedCostUsd + 1e-9 >= budget.usd) {
    return { kind: 'blocked', budget, summary }
  }
  return {
    kind: 'allowed',
    budget,
    summary,
    unmeasured: summary.unmeasured,
    partial: summary.partial,
  }
}

// ── Announcing a hold ─────────────────────────────────

/**
 * How often one department's hold may be announced, whatever the run cadence.
 *
 * Every refused run is still recorded; this only governs the notice. A cap that
 * keeps holding the same department would otherwise produce a notice per run —
 * a job every five minutes would become 288 identical bubbles a day, which is
 * a second kind of silence. One announcement per day says the rail is working
 * without burying everything else.
 */
export const DEPT_HOLD_NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * How long a department's last announcement is remembered before the entry can
 * be dropped. Longer than the interval so an active department keeps its
 * timestamp across the day, short enough that caps deleted months ago do not
 * leave entries behind forever.
 */
export const DEPT_HOLD_NOTICE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * May this department's hold be announced now?
 *
 * True when nothing was announced yet, or when a full interval has passed.
 * A non-finite `now` always answers false: without a clock there is no way to
 * tell an hour from a day, and staying quiet is safer than announcing on every
 * call. A non-finite or missing timestamp reads as "never announced", which is
 * the fail-open direction for a notice that is meant to be seen once.
 */
export function shouldAnnounceDeptHold(
  lastNotifiedAt: number | undefined,
  now: number,
): boolean {
  if (!Number.isFinite(now)) return false
  if (typeof lastNotifiedAt !== 'number' || !Number.isFinite(lastNotifiedAt)) return true
  return now - lastNotifiedAt >= DEPT_HOLD_NOTICE_INTERVAL_MS
}

/**
 * Drop announcement timestamps that can no longer matter.
 *
 * The map is keyed by department id and only grows when a cap holds work, but
 * departments are deleted and their caps removed; without a bound, a long-lived
 * process would keep one number per department it ever held. Entries whose
 * timestamp is malformed are dropped too — they would read as "never
 * announced" anyway.
 *
 * Returns a new map rather than mutating, so a caller cannot observe a
 * half-pruned state and the rule is testable without a scheduler.
 */
export function pruneDeptHoldNotices(
  lastNotifiedAt: ReadonlyMap<string, number>,
  now: number,
): Map<string, number> {
  const next = new Map<string, number>()
  // An unusable clock cannot date anything; keep what is there rather than
  // throwing away the throttle state because one call got a bad number.
  if (!Number.isFinite(now)) return new Map(lastNotifiedAt)
  for (const [departmentId, at] of lastNotifiedAt) {
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    if (now - at > DEPT_HOLD_NOTICE_RETENTION_MS) continue
    next.set(departmentId, at)
  }
  return next
}
