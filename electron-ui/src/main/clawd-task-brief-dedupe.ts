/**
 * The arithmetic behind a task-brief Done's short dedupe window, kept apart
 * from the window, the store and Electron so it can be exercised under plain
 * Node. `clawd-task-brief.ts` owns the map and the call site.
 */

/**
 * How long one task's Done stays "already answered".
 *
 * Long enough to swallow a double click and the repaint that answers it, and
 * no longer: a deliberate second finish — the next occurrence of a repeating
 * task — is a new intent and must never be mistaken for the trailing half of
 * the first press.
 */
export const DONE_DEDUPE_MS = 900

/** Whether a Done arriving at `now` is the trailing half of one at `previous`. */
export function isDuplicateFinish(
  previous: number | undefined,
  now: number,
  windowMs: number = DONE_DEDUPE_MS,
): boolean {
  if (previous === undefined) return false
  return now - previous < windowMs
}

/**
 * Drop marks that can no longer suppress anything. The card holds a handful of
 * rows, so walking the map is cheaper than any bookkeeping; this is what stops
 * a long-lived main process from collecting one entry per task ever finished.
 */
export function pruneFinishMarks(
  marks: Map<string, number>,
  now: number,
  windowMs: number = DONE_DEDUPE_MS,
): void {
  for (const [taskId, at] of marks) {
    if (now - at >= windowMs) marks.delete(taskId)
  }
}
