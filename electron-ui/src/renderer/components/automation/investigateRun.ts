// "Ask AIPA about this failed run", shared by every surface that lists one.
//
// The status-bar popover and the cross-job run list both show failed records,
// and the path from a failed row to a drafted question is long enough (read the
// live job, find the exact record, build the prompt, start an empty
// conversation, park the text in the composer) that two copies would drift: one
// would eventually forget to close Settings, or keep answering about the newest
// failure instead of the row that was clicked.
//
// Nothing here answers anything or sends anything. It prepares a question the
// user still has to read and press Enter on — the same rule the popover has
// always followed.

import { useChatStore, useUiStore } from '../../store'
import type { AutomationJobData } from '../../../preload'
import { buildInvestigatePrompt } from './investigatePrompt'
import type { Translate } from './scheduleText'

export interface InvestigateRunRequest {
  /** The live job the row belongs to. Its name is the row's name. */
  jobId: string
  jobName: string
  /** Epoch ms of the exact failed record being shown; matched against the job's history. */
  startedAt: number
  t: Translate
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
  /** Called after the question is in the composer — the surface closes itself here. */
  onPrepared?: () => void
}

export type InvestigateRunResult = 'prepared' | 'unavailable'

/**
 * Read the live job list once, find the run, and hand the composer a question.
 *
 * The list is read at click time rather than taken from the surface's own
 * props: the prompt needs the whole job (trigger, streak, spend rail, history)
 * and the row only knows a job id, a name and a start time. A failed read, a
 * deleted job, or a record evicted from the history in between all answer
 * `unavailable` — the caller says so and leaves the conversation alone.
 */
export async function prepareRunInvestigation(
  request: InvestigateRunRequest,
): Promise<InvestigateRunResult> {
  const { jobId, jobName, startedAt, t, addToast, onPrepared } = request
  const api = window.electronAPI
  if (!api?.automationList) {
    addToast('error', t('automation.investigate.unavailable', { name: jobName }))
    return 'unavailable'
  }
  try {
    const result = await api.automationList()
    const jobs: AutomationJobData[] = Array.isArray(result?.jobs) ? result.jobs : []
    const job = jobs.find(candidate => candidate.id === jobId)
    if (!job) {
      addToast('warning', t('automation.investigate.unavailable', { name: jobName }))
      return 'unavailable'
    }
    const record = (job.history ?? []).find(r => r.startedAt === startedAt) ?? null
    const text = buildInvestigatePrompt({ job, record })
    // The same new-conversation call the app menu's New Session and the command
    // palette's New conversation make. The question then waits in the
    // composer; this never sends it.
    useChatStore.getState().clearMessages()
    useUiStore.getState().setActiveNavItem('chat')
    useUiStore.getState().prefillComposer(text)
    onPrepared?.()
    addToast('success', t('automation.investigate.prepared', { name: job.name }))
    return 'prepared'
  } catch (err) {
    console.error('[AIPA] Could not prepare a question about a failed run', err)
    addToast('error', t('automation.investigate.unavailable', { name: jobName }))
    return 'unavailable'
  }
}
