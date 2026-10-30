// The last answer from each background department write, kept for the two
// surfaces that have to say so.
//
// The writes themselves are scheduled by App.tsx, far from the controls that
// show a cap or a handbook. This module is the meeting point: the sync modules
// publish what main said, and `DeptSyncNotice` reads it with
// `useSyncExternalStore`. The snapshot object is replaced only on a publish, so
// React sees a stable value between writes.
//
// No React and no IPC here; `syncOutcome.ts` owns the meaning of the values.

import type { SyncOutcome, SyncSubject } from './syncOutcome'

export interface DeptSyncSnapshot {
  readonly cap: SyncOutcome | null
  readonly handbook: SyncOutcome | null
}

const EMPTY: DeptSyncSnapshot = Object.freeze({ cap: null, handbook: null })

let snapshot: DeptSyncSnapshot = EMPTY
const listeners = new Set<() => void>()

/** Record what one write answered. A surface updates on the next render. */
export function publishDeptSyncOutcome(subject: SyncSubject, outcome: SyncOutcome): void {
  // The same outcome object twice (notably the frozen `saved` singleton) is not
  // new information, and notifying on it would only cost a render.
  if (snapshot[subject] === outcome) return
  snapshot = Object.freeze({ ...snapshot, [subject]: outcome })
  for (const listener of listeners) listener()
}

export function getDeptSyncSnapshot(): DeptSyncSnapshot {
  return snapshot
}

export function getDeptSyncOutcome(subject: SyncSubject): SyncOutcome | null {
  return snapshot[subject]
}

export function subscribeDeptSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Test-only: start from "nothing has been said yet". */
export function resetDeptSyncStatusForTests(): void {
  snapshot = EMPTY
  for (const listener of listeners) listener()
}
