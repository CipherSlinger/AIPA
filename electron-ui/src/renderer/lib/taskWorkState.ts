// Keeping a task's status honest about the work it owns.
//
// `noteTaskTurnStarted` (taskDispatch.ts) lifts a queued task into
// `in_progress` when the engine accepts a turn. This is the other half: when
// that turn dies with an error, the task is no longer "in progress" — someone
// has to decide what to do next, which is exactly what `needs_you` means.
//
// Deliberately narrow:
//   - only the *active* tab's task — a background conversation's failure already
//     reaches the user through the pet's failure bubble, and moving a task the
//     user is not looking at would change the board behind their back;
//   - only a genuine error, never a user stop or an unreported outcome;
//   - never out of `done`/`archived` (closed work stays closed) and never out of
//     `needs_you` (already waiting).
// Bookkeeping is best effort: a failed write is logged, never surfaced over the
// error the user is already reading.
import { useChatStore, useTaskStore } from '../store'
import type { TaskStatusData } from '../../preload'

/** Statuses a failed turn may move to `needs_you`. */
const MOVABLE_STATUSES: ReadonlySet<TaskStatusData> = new Set([
  'inbox', 'ready', 'assigned', 'in_progress',
])

/**
 * Mark the task behind the active tab as waiting on the user, after a failed
 * turn. Returns true when the status was changed (or requested).
 *
 * `reason` is the engine's most specific human-readable line, when one was
 * reported. It is recorded on the status event so the pet's brief can say why
 * the task is waiting without the user opening AIPA; the store trims and caps
 * it, and an absent reason simply leaves the row as it was before.
 */
export function markActiveTaskNeedsYou(reason?: string): boolean {
  try {
    const chat = useChatStore.getState()
    const taskId = chat.tabs.find(tab => tab.id === chat.activeTabId)?.task?.taskId
    if (!taskId) return false
    const task = useTaskStore.getState().tasks.find(item => item.id === taskId)
    if (!task || !MOVABLE_STATUSES.has(task.status)) return false
    const note = typeof reason === 'string' ? reason : undefined
    void useTaskStore.getState().updateTask(taskId, { status: 'needs_you', note }).then(result => {
      if (!result.ok) console.warn('[AIPA] Could not mark the task as waiting on you:', result.error)
    })
    return true
  } catch (err) {
    console.warn('[AIPA] Could not update the task after a failed turn:', err)
    return false
  }
}
