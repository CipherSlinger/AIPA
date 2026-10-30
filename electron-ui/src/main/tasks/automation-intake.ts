/**
 * "Save this run's output as a task" — the bridge from an automation record to
 * real work that owns a folder and materials.
 *
 * Output is read from the transcript the run already left (`sessionId`), never
 * by re-running anything. The run record itself is a handful of scalars by
 * design (`run-history.ts`), so the transcript is the only durable copy of what
 * the engine said.
 *
 * Idempotency choice: the saved task's own history is the ledger. A run is
 * identified by `automation:<jobId>:<startedAt>`; before creating anything we
 * look for a task carrying that event and reopen it, so saving twice opens the
 * same task. The automation store is therefore untouched and no new schema is
 * needed. Deleting the task also deletes the ledger entry, so a later save
 * starts a fresh task — the same way deleting any note forgets it.
 *
 * Routing is applied only after the material is safely recorded, and only to a
 * department the caller says still exists (the org tree lives in the renderer).
 * A failed route is reported but never rolls the task back: keeping the work
 * unassigned is the honest outcome, and the user can pick a department later.
 */
import type { TaskView } from './task-store'
import {
  addTextMaterial,
  automationRunDetail,
  createTask,
  deleteTask,
  findTasksByAutomationRun,
  routeTask,
  taskView,
} from './task-store'
import { readAutomationJobs } from '../automation/job-store'
import type { AutomationJob, AutomationRunRecord } from '../automation/types'
import { readSessionProse as readClaudeSessionProse } from '../sessions/session-reader'
import { readSessionProse as readCodexSessionProse } from '../codex/codex-session-reader'
import { createLogger } from '../utils/logger'

const log = createLogger('tasks:run-intake')

/**
 * A run's prose can be long; a material is meant to be read and used, not to
 * make `tasks.json` or a folder unbounded. The cut is marked in the file.
 */
export const MAX_RUN_OUTPUT_CHARS = 200_000

export interface SaveAutomationRunInput {
  jobId?: unknown
  startedAt?: unknown
  /**
   * The department to file the new task under, as resolved against the live
   * org tree by the renderer: a string when it still exists, null when the job
   * had none or its node is gone. Undefined means "use the job's own id" for
   * programmatic callers.
   */
  departmentId?: unknown
}

export type SaveAutomationRunResult =
  | {
      ok: true
      task: TaskView
      /** True when an earlier save was found; no new task or material was made. */
      reused: boolean
      routed: boolean
      /** The task was saved but could not be filed; it is unassigned. */
      routeError?: string
    }
  | { ok: false; code: string; error: string }

function failure(code: string, error: string): SaveAutomationRunResult {
  return { ok: false, code, error }
}

function findJobRecord(job: AutomationJob, startedAt: number): AutomationRunRecord | null {
  return job.history.find(record => record.startedAt === startedAt) ?? null
}

/** The run's assistant prose, or null when the transcript is gone or silent. */
async function readRunOutput(sessionId: string): Promise<string | null> {
  let records = await readClaudeSessionProse(sessionId)
  if (!records.some(record => record.role === 'assistant' && record.text.trim())) {
    records = await readCodexSessionProse(sessionId)
  }
  const blocks = records
    .filter(record => record.role === 'assistant' && record.origin === 'prose')
    .map(record => record.text.trim())
    .filter(Boolean)
  if (blocks.length === 0) return null

  const text = blocks.join('\n\n')
  return text.length > MAX_RUN_OUTPUT_CHARS
    ? `${text.slice(0, MAX_RUN_OUTPUT_CHARS)}\n\n[Output truncated at ${MAX_RUN_OUTPUT_CHARS} characters.]`
    : text
}

function runTitle(job: AutomationJob, record: AutomationRunRecord): string {
  const name = (job.name || '').trim()
  if (name) return name.slice(0, 200)
  // A hand-edited job can have no name; the time is then the honest identity.
  return `Automation run ${new Date(record.startedAt).toISOString().slice(0, 16).replace('T', ' ')}`.slice(0, 200)
}

function runMaterialName(record: AutomationRunRecord): string {
  const stamp = new Date(record.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 16)
  return `run-${stamp}.md`
}

function resolveDepartment(input: SaveAutomationRunInput, job: AutomationJob): string | null {
  if (input.departmentId === undefined) return job.departmentId ?? null
  if (input.departmentId === null) return null
  return typeof input.departmentId === 'string' && input.departmentId.trim()
    ? input.departmentId.trim()
    : null
}

export async function saveAutomationRunAsTask(
  input: SaveAutomationRunInput,
): Promise<SaveAutomationRunResult> {
  const jobId = typeof input.jobId === 'string' ? input.jobId.trim() : ''
  const startedAt = typeof input.startedAt === 'number' && Number.isFinite(input.startedAt)
    ? input.startedAt
    : null
  if (!jobId) return failure('invalid_job', 'An automation job is required')
  if (startedAt === null || startedAt < 0) return failure('invalid_run', 'A run is required')

  const job = readAutomationJobs().find(candidate => candidate.id === jobId)
  if (!job) return failure('job_not_found', 'That automation no longer exists')
  const record = findJobRecord(job, startedAt)
  if (!record) return failure('run_not_found', 'That run is no longer remembered')
  if (record.status === 'skipped') {
    return failure('run_skipped', 'A skipped run has no output to save')
  }

  // Already saved? Reuse the task that recorded this run rather than making a
  // second copy of the same output.
  const existing = findTasksByAutomationRun(jobId, startedAt)[0]
  if (existing) {
    return { ok: true, task: taskView(existing), reused: true, routed: !!existing.departmentId }
  }

  if (!record.sessionId) return failure('no_output', 'This run left no conversation to read output from')
  let output: string | null
  try {
    output = await readRunOutput(record.sessionId)
  } catch (err) {
    log.warn(`Could not read the transcript of run ${jobId}@${startedAt}:`, err)
    return failure('read_failed', 'The run transcript could not be read')
  }
  if (!output) return failure('no_output', 'The run left no assistant text to save')

  const created = createTask({ title: runTitle(job, record) })
  if (!created.ok) return created

  const added = addTextMaterial(created.task.id, {
    name: runMaterialName(record),
    text: output,
    source: 'automation',
    // Recorded in the same write as the material, so idempotency cannot see a
    // saved run without the file that makes it saved.
    automationRun: { jobId, startedAt },
  })
  if (!added.ok) {
    // An empty task would assert "the output is in this folder" when it is not.
    // Roll it into the app's trash, then report the real failure.
    try { deleteTask(created.task.id, { deleteFiles: true }) } catch { /* best effort */ }
    return failure(added.code, added.error)
  }

  const departmentId = resolveDepartment(input, job)
  let task = added.task
  let routed = false
  let routeError: string | undefined
  if (departmentId) {
    const route = routeTask(task.id, departmentId)
    if (route.ok && route.task) {
      routed = true
      task = route.task
    } else if (!route.ok) {
      routeError = route.error
    }
  }

  log.info(`Saved run ${automationRunDetail(jobId, startedAt)} as task ${task.id}`)
  return {
    ok: true,
    task,
    reused: false,
    routed,
    ...(routeError ? { routeError } : {}),
  }
}
