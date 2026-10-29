// Keep main's stored department caps aligned with the renderer's org tree.
//
// Why this runs app-wide instead of inside the Brief: a cap stores the node ids
// it covers, and only the renderer has the tree. If the sync were mounted with
// the department page, a node added to a department while no one was looking
// would sit outside an existing cap until that page happened to be opened. The
// cap would then under-cover without ever saying so. App.tsx therefore mounts
// this once, at startup and on every tree change.
//
// The module is deliberately quiet: a failed sync is not a user-facing error,
// because the tree is still here and the next change retries. It must never
// throw into React, so every IPC call is caught and every rejection is swallowed
// after the promise settles.

import type { Department } from '../../store'
import { subtreeEntries, type DeptBudgetSyncEntry } from './deptBudget.data'

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

let timer: ReturnType<typeof setTimeout> | null = null
let pendingEntries: DeptBudgetSyncEntry[] | null = null
let pendingKey: string | null = null
/** The last payload main acknowledged. Identical payloads are not resent. */
let lastSentKey: string | null = null
/** One call at a time; a tree that changes mid-flight waits its turn. */
let inFlight = false
let delayMs = BUDGET_SYNC_DEBOUNCE_MS

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
  if (key === lastSentKey) return

  inFlight = true
  let call: Promise<unknown>
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.automationDeptBudgetSync) {
      // Preload is missing or too old. Stay silent; a later tree change retries.
      inFlight = false
      return
    }
    call = Promise.resolve(api.automationDeptBudgetSync(entries))
  } catch {
    inFlight = false
    return
  }

  call
    .then(() => {
      lastSentKey = key
    })
    .catch(() => {
      // Silent by design: no cap is broken by a failed membership refresh, and
      // the next tree change sends the then-current payload again.
    })
    .finally(() => {
      inFlight = false
      // A newer tree arrived while this call was out; give it the same debounce.
      if (pendingKey !== null) scheduleFlush()
    })
}

/**
 * Queue a membership sync for this tree. Safe to call on every departments
 * render: an unchanged payload is dropped before the timer, and a payload main
 * already acknowledged is dropped again at send time.
 */
export function scheduleDeptBudgetSync(
  departments: readonly Department[],
  delay = BUDGET_SYNC_DEBOUNCE_MS,
): void {
  delayMs = delay
  let entries: DeptBudgetSyncEntry[]
  try {
    entries = buildBudgetSyncPayload(departments)
  } catch {
    return
  }
  const key = budgetSyncKey(entries)

  // Nothing pending and nothing new: do not wake the debounce at all.
  if (pendingKey === null && key === lastSentKey) return

  pendingEntries = entries
  pendingKey = key
  scheduleFlush()
}

/** Drop a queued sync. An IPC call already out cannot be recalled. */
export function cancelDeptBudgetSync(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingEntries = null
  pendingKey = null
}

/** Test-only: also forget what main acknowledged, so a harness can replay. */
export function resetDeptBudgetSyncForTests(): void {
  cancelDeptBudgetSync()
  lastSentKey = null
  inFlight = false
  delayMs = BUDGET_SYNC_DEBOUNCE_MS
}
