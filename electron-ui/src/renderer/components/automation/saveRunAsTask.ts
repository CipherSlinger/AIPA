// "Save this run's output as a task", shared by Settings → Automations and the
// cross-job run page.
//
// The run record is the input; the main process reads the transcript the run
// already left, writes it into a new task's materials and records provenance.
// Nothing is re-run. Saving the same row twice reopens the same task (main
// keys idempotency on the task history).
//
// The org tree is renderer-owned, so this is also where "does the job's
// department still exist?" is answered. A stale id is not sent: the task is
// saved unassigned and the user is told why, which is the honest outcome.

import type { AutomationJobData, AutomationRunRecordData } from '../../../preload'
import { useDepartmentStore, useTaskStore, useUiStore } from '../../store'
import type { Translate } from './scheduleText'

export interface SaveRunAsTaskRequest {
  /** The live job, or null when it has been deleted. */
  job: AutomationJobData | null
  jobId: string
  jobName: string
  record: AutomationRunRecordData
  t: Translate
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
}

export type SaveRunAsTaskOutcome = 'saved' | 'reused' | 'failed'

export async function saveRunAsTask(request: SaveRunAsTaskRequest): Promise<SaveRunAsTaskOutcome> {
  const { job, jobId, jobName, record, t, addToast } = request
  if (!job) {
    addToast('warning', t('automation.saveAsTask.jobGone', { name: jobName }))
    return 'failed'
  }
  // A failure can leave a partial answer too. Only "no transcript" means there
  // is nothing to copy; the main side says so if the transcript has no prose.
  if (!record.sessionId) {
    addToast('warning', t('automation.saveAsTask.noConversation'))
    return 'failed'
  }

  let departmentId: string | null = null
  if (job.departmentId) {
    const exists = useDepartmentStore.getState().departments.some(dept => dept.id === job.departmentId)
    if (exists) departmentId = job.departmentId
    else addToast('warning', t('automation.saveAsTask.departmentGone'))
  }

  const result = await useTaskStore.getState().saveAutomationRun({
    jobId,
    startedAt: record.startedAt,
    departmentId,
  })
  if (!result.ok || !result.task) {
    addToast('error', t('automation.saveAsTask.failed', {
      error: result.error || t('automation.saveAsTask.unknownError'),
    }))
    return 'failed'
  }

  if (result.routeError) {
    // The task and its output are real; only the filing failed. Say so instead
    // of implying the work is assigned when it is not.
    addToast('warning', t('automation.saveAsTask.routeFailed', { error: result.routeError }))
  }

  // Opening the task is the point: the run leaves the log and becomes work.
  useUiStore.getState().setActiveNavItem('tasks')
  useTaskStore.getState().selectTask(result.task.id)
  addToast('success', result.reused
    ? t('automation.saveAsTask.reused', { title: result.task.title })
    : t('automation.saveAsTask.saved', { title: result.task.title }))
  return result.reused ? 'reused' : 'saved'
}
