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
// that runs while no department page is open. Like that sync it is deliberately
// quiet — a failed write is not user-facing, the tree is still here, and the
// next change retries. It must never throw into React.

import type { Department } from '../../store'
import { handbookSyncEntries, handbookSyncKey, type DeptHandbookSyncEntry } from './deptHandbook.data'
import type { UiLocale } from './deptUtils'

/** One tree edit is cheap; a burst of edits (typing in the handbook) costs one write. */
export const HANDBOOK_SYNC_DEBOUNCE_MS = 400

let timer: ReturnType<typeof setTimeout> | null = null
let pendingEntries: DeptHandbookSyncEntry[] | null = null
let pendingKey: string | null = null
/** The last payload main acknowledged. Identical payloads are not resent. */
let lastSentKey: string | null = null
/** One call at a time; a tree that changes mid-flight waits its turn. */
let inFlight = false
let delayMs = HANDBOOK_SYNC_DEBOUNCE_MS

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
  if (key === lastSentKey) return

  inFlight = true
  let call: Promise<unknown>
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.automationHandbookSnapshotSync) {
      // Preload is missing or too old. Stay silent; a later tree change retries.
      inFlight = false
      return
    }
    call = Promise.resolve(api.automationHandbookSnapshotSync(entries))
  } catch {
    inFlight = false
    return
  }

  call
    .then(() => {
      // Only an accepted payload is remembered; a refused one is retried by
      // the next change rather than considered done.
      lastSentKey = key
    })
    .catch(() => {
      // Silent by design: the tree is the source of truth, and the next change
      // sends the then-current payload again.
    })
    .finally(() => {
      inFlight = false
      if (pendingKey !== null) scheduleFlush()
    })
}

/**
 * Queue a snapshot write for this tree. Safe to call on every departments
 * render: an unchanged payload is dropped before the timer, and a payload main
 * already acknowledged is dropped again at send time.
 */
export function scheduleDeptHandbookSync(
  departments: readonly Department[],
  locale: UiLocale,
  delay = HANDBOOK_SYNC_DEBOUNCE_MS,
): void {
  delayMs = delay
  let entries: DeptHandbookSyncEntry[]
  try {
    entries = handbookSyncEntries(departments, locale)
  } catch {
    return
  }
  const key = handbookSyncKey(entries)

  if (pendingKey === null && key === lastSentKey) return

  pendingEntries = entries
  pendingKey = key
  scheduleFlush()
}

/** Drop a queued write. An IPC call already out cannot be recalled. */
export function cancelDeptHandbookSync(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingEntries = null
  pendingKey = null
}

/** Test-only: also forget what main acknowledged, so a harness can replay. */
export function resetDeptHandbookSyncForTests(): void {
  cancelDeptHandbookSync()
  lastSentKey = null
  inFlight = false
  delayMs = HANDBOOK_SYNC_DEBOUNCE_MS
}
