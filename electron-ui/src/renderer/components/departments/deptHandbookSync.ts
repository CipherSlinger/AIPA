// Keep main's handbook snapshot aligned with the renderer's org tree.
//
// The main process assembles scheduled runs and cannot read this tree, so a
// job filed under a department would otherwise run without that desk's
// standing rules while the same department's conversations carry them on every
// turn. The renderer writes the snapshot on every change — a handbook edit, a
// rename, a delete — and once at startup, so main's copy is never older than
// the app's last look at the tree.
//
// Mounted app-wide rather than inside the department page, for the same reason
// the department-cap sync is: a handbook edited in one place must reach a job
// that runs while no department page is open.
//
// The write used to be quiet in both directions: a missing preload and a
// rejected call were swallowed, and any resolution — including `{ ok: false }` —
// was recorded as accepted. A handbook edit could therefore close its modal,
// keep the header dot, and still leave main running schedules on yesterday's
// text. Now each attempt answers with `saved` / `unsupported` / `failed` (see
// `syncOutcome.ts`); the answer is published for the department page and
// returned to a caller that wants to await it. Only `{ ok: true }` counts as
// saved, so a refusal is retried on the next change. Nothing here throws into
// React.

import type { Department } from '../../store'
import { handbookSyncEntries, handbookSyncKey, type DeptHandbookSyncEntry } from './deptHandbook.data'
import { publishDeptSyncOutcome } from './deptSyncStatus'
import {
  SAVED_OUTCOME,
  failedOutcome,
  outcomeFromReply,
  unsupportedOutcome,
  type SyncOutcome,
} from './syncOutcome'
import type { UiLocale } from './deptUtils'

/** One tree edit is cheap; a burst of edits (typing in the handbook) costs one write. */
export const HANDBOOK_SYNC_DEBOUNCE_MS = 400

type Waiter = (outcome: SyncOutcome) => void

let timer: ReturnType<typeof setTimeout> | null = null
let pendingEntries: DeptHandbookSyncEntry[] | null = null
let pendingKey: string | null = null
/** The last payload main accepted. Identical payloads are not resent. */
let lastSentKey: string | null = null
/** One call at a time; a tree that changes mid-flight waits its turn. */
let inFlight = false
let delayMs = HANDBOOK_SYNC_DEBOUNCE_MS
/** Schedules still waiting for an answer; the next settled flush answers them. */
let waiters: Waiter[] = []

function settle(outcome: SyncOutcome): void {
  publishDeptSyncOutcome('handbook', outcome)
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
  // let the settle handler schedule it, rather than stacking two writes.
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
    if (!api?.automationHandbookSnapshotSync) {
      // Preload is missing or too old. Say so; a later tree change tries again.
      inFlight = false
      settle(unsupportedOutcome('automationHandbookSnapshotSync'))
      return
    }
    call = Promise.resolve(api.automationHandbookSnapshotSync(entries))
  } catch (err) {
    inFlight = false
    settle(failedOutcome(err))
    return
  }

  call
    .then(reply => {
      const outcome = outcomeFromReply(reply)
      // Only an accepted payload is remembered; a refused one is retried by
      // the next change rather than considered done.
      if (outcome.status === 'saved') lastSentKey = key
      settle(outcome)
    })
    .catch(err => settle(failedOutcome(err)))
    .finally(() => {
      inFlight = false
      if (pendingKey !== null) scheduleFlush()
    })
}

/**
 * Queue a snapshot write for this tree and return the answer it will receive.
 *
 * Safe to call on every departments render: an unchanged payload is dropped
 * before the timer, and a payload main already acknowledged is dropped again at
 * send time. The promise never rejects; it resolves with `saved`, `unsupported`
 * or `failed`.
 */
export function scheduleDeptHandbookSync(
  departments: readonly Department[],
  locale: UiLocale,
  delay = HANDBOOK_SYNC_DEBOUNCE_MS,
): Promise<SyncOutcome> {
  delayMs = delay
  let entries: DeptHandbookSyncEntry[]
  try {
    entries = handbookSyncEntries(departments, locale)
  } catch (err) {
    const outcome = failedOutcome(err)
    publishDeptSyncOutcome('handbook', outcome)
    return Promise.resolve(outcome)
  }
  const key = handbookSyncKey(entries)

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
 * Drop a queued write. An IPC call already out cannot be recalled, so its answer
 * still settles the waiters; a dropped payload is answered by the next flush.
 */
export function cancelDeptHandbookSync(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingEntries = null
  pendingKey = null
}

/** Test-only: also forget what main accepted, so a harness can replay. */
export function resetDeptHandbookSyncForTests(): void {
  cancelDeptHandbookSync()
  lastSentKey = null
  inFlight = false
  delayMs = HANDBOOK_SYNC_DEBOUNCE_MS
  waiters = []
}
