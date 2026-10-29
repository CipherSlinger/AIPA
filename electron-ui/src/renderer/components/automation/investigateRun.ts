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
import type { AutomationJobData, AutomationRunActivityRowData } from '../../../preload'
import { buildInvestigatePrompt } from './investigatePrompt'
import { buildRunActivityPrompt } from './runActivityPrompt'
import type { RunActivityFilter, RunActivityWindow } from './runActivity'
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

export interface PrepareRunActivityInvestigationRequest {
  /** The rows on screen after the window and every filter, newest first. */
  rows: readonly AutomationRunActivityRowData[]
  window: RunActivityWindow
  filter: RunActivityFilter
  loaded: number
  total: number
  cap: number
  t: Translate
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
  now?: number
}

/**
 * "Ask AIPA about these runs": build the page-level post-mortem and park it in
 * a fresh conversation's composer.
 *
 * This is the same destination as `prepareRunInvestigation` — the only
 * difference is the question and the set it describes. It reads no live job
 * list and sends nothing: the user still has to read the draft and press Enter.
 * It returns the draft so a caller (or a harness) can inspect exactly what was
 * placed there.
 */
export function prepareRunActivityInvestigation(
  request: PrepareRunActivityInvestigationRequest,
): string {
  const { rows, t, addToast } = request
  // A filter can change between rendering the button and clicking it. An empty
  // set has no post-mortem to ask for, so say that instead of prefilling a
  // question about nothing.
  if (rows.length === 0) {
    addToast('info', t('automation.runActivity.ask.nothing'))
    return ''
  }
  const text = buildRunActivityPrompt(request)
  useChatStore.getState().clearMessages()
  useUiStore.getState().setActiveNavItem('chat')
  useUiStore.getState().prefillComposer(text)
  addToast('success', rows.length === 1
    ? t('automation.runActivity.ask.preparedOne')
    : t('automation.runActivity.ask.prepared', { count: rows.length }))
  return text
}
