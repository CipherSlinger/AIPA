// Keep main's stored department caps aligned with the renderer's org tree.
//
// Why this runs app-wide instead of inside the Brief: a cap stores the node ids
// it covers, and only the renderer has the tree. If the sync were mounted with
// the department page, a node added to a department while no one was looking
// would sit outside an existing cap until that page happened to be opened. The
// cap would then under-cover without ever saying so. App.tsx therefore mounts
// this once, at startup and on every tree change.
//
// Every attempt now answers. It used to return `void` and swallow both a missing
// preload and a rejected call, so a membership refresh could vanish while the
// Brief still showed the cap as if its coverage were current. The answer is one
// of `saved` / `unsupported` / `failed` (see `syncOutcome.ts`); it is published
// for the surface next to the cap and returned to a caller that wants to await
// it. Only `{ ok: true }` from main counts as saved — a refusal is retried by
// the next tree change instead of being remembered as delivered.
//
// The debounce and single-flight shape is unchanged, and nothing here throws
// into React.

import type { Department } from '../../store'
import { subtreeEntries, type DeptBudgetSyncEntry } from './deptBudget.data'
import { publishDeptSyncOutcome } from './deptSyncStatus'
import {
  SAVED_OUTCOME,
  failedOutcome,
  outcomeFromReply,
  unsupportedOutcome,
  type SyncOutcome,
} from './syncOutcome'

/** One tree edit is cheap; a burst of edits should cost one sync. */
export const BUDGET_SYNC_DEBOUNCE_MS = 400

/** The payload for one tree, in a stable order (`subtreeEntries` owns the order). */
export function buildBudgetSyncPayload(
  departments: readonly Department[],
): DeptBudgetSyncEntry[] {
  return subtreeEntries(departments)
}

/**
 * Identity of a payload. JSON is enough because entries and member ids are
 * strings in a deterministic order; the key is only compared, never parsed.
 */
export function budgetSyncKey(entries: readonly DeptBudgetSyncEntry[]): string {
  return JSON.stringify(entries)
}

type Waiter = (outcome: SyncOutcome) => void

let timer: ReturnType<typeof setTimeout> | null = null
let pendingEntries: DeptBudgetSyncEntry[] | null = null
let pendingKey: string | null = null
/** The last payload main accepted. Identical payloads are not resent. */
let lastSentKey: string | null = null
/** One call at a time; a tree that changes mid-flight waits its turn. */
let inFlight = false
let delayMs = BUDGET_SYNC_DEBOUNCE_MS
/**
 * Schedules that are still waiting for an answer. They all describe "the tree
 * as last queued", so the next settled flush answers them: a newer payload that
 * superseded theirs is at least as new, and a deduplicated one was already
 * accepted by main.
 */
let waiters: Waiter[] = []

function settle(outcome: SyncOutcome): void {
  publishDeptSyncOutcome('cap', outcome)
  const waiting = waiters
  waiters = []
  for (const resolve of waiting) resolve(outcome)
}

function scheduleFlush(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flush()
  }, Math.max(0, delayMs))
}

function flush(): void {
  // An in-flight call is the overlap guard: keep the newer payload pending and
  // let the settle handler below schedule it, rather than stacking two syncs.
  if (inFlight) return
  if (!pendingEntries || pendingKey === null) return

  const entries = pendingEntries
  const key = pendingKey
  pendingEntries = null
  pendingKey = null

  if (key === lastSentKey) {
    settle(SAVED_OUTCOME)
    return
  }

  inFlight = true
  let call: Promise<unknown>
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.automationDeptBudgetSync) {
      // Preload is missing or too old. Say so; a later tree change tries again.
      inFlight = false
      settle(unsupportedOutcome('automationDeptBudgetSync'))
      return
    }
    call = Promise.resolve(api.automationDeptBudgetSync(entries))
  } catch (err) {
    inFlight = false
    settle(failedOutcome(err))
    return
  }

  call
    .then(reply => {
      const outcome = outcomeFromReply(reply)
      // Only an accepted payload is remembered. A refused one is retried by
      // the next change instead of being counted as delivered.
      if (outcome.status === 'saved') lastSentKey = key
      settle(outcome)
    })
    .catch(err => settle(failedOutcome(err)))
    .finally(() => {
      inFlight = false
      // A newer tree arrived while this call was out; give it the same debounce.
      if (pendingKey !== null) scheduleFlush()
    })
}

/**
 * Queue a membership sync for this tree and return the answer it will receive.
 *
 * Safe to call on every departments render: an unchanged payload is dropped
 * before the timer, and a payload main already acknowledged is dropped again at
 * send time. The promise never rejects; it resolves with `saved`, `unsupported`
 * or `failed`.
 */
export function scheduleDeptBudgetSync(
  departments: readonly Department[],
  delay = BUDGET_SYNC_DEBOUNCE_MS,
): Promise<SyncOutcome> {
  delayMs = delay
  let entries: DeptBudgetSyncEntry[]
  try {
    entries = buildBudgetSyncPayload(departments)
  } catch (err) {
    // A tree this build cannot even serialize was not sent, and saying nothing
    // would leave the same silent gap this module now exists to close.
    const outcome = failedOutcome(err)
    publishDeptSyncOutcome('cap', outcome)
    return Promise.resolve(outcome)
  }
  const key = budgetSyncKey(entries)

  // Nothing pending and nothing new: main already has this exact payload, so
  // any earlier schedule still waiting (for a tree no newer than this one) can
  // be answered now.
  if (pendingKey === null && key === lastSentKey) {
    settle(SAVED_OUTCOME)
    return Promise.resolve(SAVED_OUTCOME)
  }

  pendingEntries = entries
  pendingKey = key
  scheduleFlush()
  return new Promise<SyncOutcome>(resolve => { waiters.push(resolve) })
}

/**
 * Drop a queued sync. An IPC call already out cannot be recalled, so its answer
 * still settles the waiters; a dropped payload is answered by the next flush.
 */
export function cancelDeptBudgetSync(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingEntries = null
  pendingKey = null
}

/** Test-only: also forget what main accepted, so a harness can replay. */
export function resetDeptBudgetSyncForTests(): void {
  cancelDeptBudgetSync()
  lastSentKey = null
  inFlight = false
  delayMs = BUDGET_SYNC_DEBOUNCE_MS
  waiters = []
}
