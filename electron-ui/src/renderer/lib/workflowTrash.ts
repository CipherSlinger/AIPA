/**
 * The workflow half of "Recently deleted".
 *
 * Workflows are renderer prefs, so their holding area is an optional pref array
 * (`AppPrefs.trashedWorkflows`) rather than a file the main process owns.
 * Skills are folders and are trashed by main (src/main/trash/skill-trash.ts);
 * this module mirrors that module's retention window so both kinds leave after
 * the same number of days instead of drifting apart.
 */
import type { TrashedWorkflow, Workflow } from '../types/app.types'

/**
 * Same window as SKILL_TRASH_RETENTION_DAYS in the main-process module: one
 * promise to the user ("restorable for 30 days") covering both kinds. A purge
 * cutoff must always be computed from this constant, never from a second
 * literal that could disagree with the copy on screen.
 */
export const TRASH_RETENTION_DAYS = 30
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

/**
 * How long a delete toast stays up when it carries Undo. The trash entry
 * outlives the toast by 30 days either way, so this is not about data loss: it
 * is the time a user gets to notice the delete, read it and reach the button.
 * The default 4s undercuts that once the toast is not the first thing they look
 * at. Same window as the memory "Undo" toast, so undo feels like one feature.
 */
export const UNDO_TOAST_MS = 8000

/**
 * The holding area's cap. It exists so a user who deletes far more than they
 * restore cannot grow prefs without bound; the oldest entry is dropped and the
 * delete toast says so.
 */
export const MAX_TRASHED_WORKFLOWS = 20

export type WorkflowTrashFailureCode = 'not_found' | 'workflow_limit'

/** What the panel needs to say why a restore was refused. */
export type WorkflowTrashResult =
  | { ok: true }
  | { ok: false; code: WorkflowTrashFailureCode }

function isEntry(value: unknown): value is TrashedWorkflow {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  const workflow = entry.workflow
  if (!workflow || typeof workflow !== 'object') return false
  const wf = workflow as Record<string, unknown>
  // Restoring a row that is not a usable workflow would put a card in the grid
  // that cannot be opened or run; validate enough of the shape to be sure the
  // record is the one we put there.
  return typeof wf.id === 'string' && wf.id.length > 0 &&
    typeof wf.name === 'string' &&
    Array.isArray(wf.steps) &&
    typeof entry.deletedAt === 'number' &&
    Number.isFinite(entry.deletedAt)
}

/**
 * Valid rows, newest first. One malformed pref row (a hand edit, a partial
 * write) is dropped on its own; the rest stay restorable.
 */
export function normalizeTrashedWorkflows(value: unknown): TrashedWorkflow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isEntry)
    .sort((a, b) => b.deletedAt - a.deletedAt)
}

/** When this entry leaves for good (epoch ms). */
export function workflowPurgeAt(entry: TrashedWorkflow): number {
  return entry.deletedAt + TRASH_RETENTION_MS
}

/**
 * Drop entries whose retention window has passed. Called at app launch, not
 * only when the panel opens, so the holding area stays bounded for a user who
 * never visits the Employees page again.
 */
export function purgeTrashedWorkflows(
  value: unknown,
  now: number = Date.now(),
): { entries: TrashedWorkflow[]; removed: number } {
  const entries = normalizeTrashedWorkflows(value)
  // Same boundary rule as the main-process skill trash: exactly at the window
  // is not yet "older than" it.
  const kept = entries.filter(entry => workflowPurgeAt(entry) >= now)
  return { entries: kept, removed: entries.length - kept.length }
}

/**
 * Put a deleted workflow in the holding area, newest first, keeping the cap.
 * `dropped` is the entry pushed out by the cap (or null), so the caller can
 * tell the user something left for good rather than silently losing it.
 */
export function addTrashedWorkflow(
  value: unknown,
  workflow: Workflow,
  now: number = Date.now(),
): { entries: TrashedWorkflow[]; dropped: TrashedWorkflow | null } {
  const entries = normalizeTrashedWorkflows(value)
  const next = [{ workflow, deletedAt: now }, ...entries]
  if (next.length <= MAX_TRASHED_WORKFLOWS) return { entries: next, dropped: null }
  return {
    entries: next.slice(0, MAX_TRASHED_WORKFLOWS),
    dropped: next[next.length - 1],
  }
}
