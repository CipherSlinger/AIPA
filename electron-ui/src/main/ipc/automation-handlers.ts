/**
 * IPC surface for Automations (Settings → Automations).
 *
 * Mutations resolve with `{ ok, error }` instead of throwing: the settings page
 * has to show validation failures next to the field that caused them, and a
 * rejected invoke would only surface as an opaque string.
 */
import { ipcMain } from 'electron'
import {
  cloneAutomationJob,
  createAutomationJob,
  listAutomationDeptBudgetReports,
  listAutomationJobs,
  listAutomationRunActivity,
  previewAutomationSchedule,
  restoreAutomationJob,
  runAutomationNow,
  setAutomationDeptBudget,
  setAutomationEnabled,
  setAutomationGlobalBudget,
  setAutomationPausedAll,
  syncAutomationDeptBudgets,
  trashAutomationJob,
  updateAutomationJob,
} from '../automation/scheduler'
import { syncDeptHandbookSnapshot } from '../automation/dept-handbook-store'
import { runApprovalQueue } from '../automation/run-approvals'
import { normalizeDeptSpendRequest, summarizeDeptSpend } from '../automation/spend-guard'
import type { AutomationInput, AutomationTrigger } from '../automation/types'
import { listTrashedJobs, purgeTrashedJobs, removeTrashedJob } from '../trash/job-trash'
import { safeHandle } from './register/safe-handle'

export function registerAutomationHandlers(): void {
  ipcMain.handle('automation:list', () => {
    try {
      return listAutomationJobs()
    } catch (err) {
      console.error('[automation:list]', err)
      return { jobs: [], limits: null }
    }
  })

  // One read of every job's remembered runs, newest first, capped. Same result
  // discipline as `automation:trash:list`: a failed read rejects so the page can
  // say the store could not be read, instead of resolving an empty list that
  // would read as "nothing has ever run".
  safeHandle('automation:runActivity', () => {
    try {
      return listAutomationRunActivity()
    } catch (err) {
      console.error('[automation:runActivity]', err)
      throw err
    }
  })

  // Reported spend for the jobs filed under the org ids the renderer resolved.
  // Read-only: no persistence and no change broadcast, because nothing here can
  // change the store. A request that is not usable (no ids, an out-of-range
  // window) answers null rather than an empty summary: "nothing is filed under
  // these nodes" is an answer, "this request made no sense" is not.
  ipcMain.handle('automation:deptSpend', (_event, raw: unknown) => {
    try {
      const request = normalizeDeptSpendRequest(raw)
      if (!request) return null
      const listed = listAutomationJobs()
      const jobs = Array.isArray(listed.jobs) ? listed.jobs : []
      return summarizeDeptSpend(jobs, request.departmentIds, request.windowStart, Date.now())
    } catch (err) {
      console.error('[automation:deptSpend]', err)
      return null
    }
  })

  // Every stored department cap with its live figures. An empty array is a real
  // answer — no cap is set anywhere. A failed read must not be dressed up as
  // that answer, so the error is logged here and rethrown: the caller's promise
  // rejects and the surface can say the caps could not be read, which is a
  // different fact from "there are none".
  safeHandle('automation:deptBudgets', () => {
    try {
      return listAutomationDeptBudgetReports()
    } catch (err) {
      console.error('[automation:deptBudgets]', err)
      throw err
    }
  })

  // Set or clear one department's cap. Validation lives in the scheduler (and
  // `dept-budget.ts` beneath it); this handler only guards the payload shape so
  // a renderer bug cannot reach the store as a coerced value.
  safeHandle('automation:deptBudgetSet', (_event, input: unknown) => {
    try {
      return setAutomationDeptBudget(input)
    } catch (err) {
      console.error('[automation:deptBudgetSet]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })

  // Membership refresh from the org tree. It cannot create a cap, and a budget
  // the entries do not mention keeps its last membership.
  safeHandle('automation:deptBudgetSync', (_event, entries: unknown) => {
    try {
      return syncAutomationDeptBudgets(entries)
    } catch (err) {
      console.error('[automation:deptBudgetSync]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })

  // The org tree's handbook snapshot. The renderer is the only writer; main
  // validates the payload (bounded text, usable ids) and stamps `updatedAt`
  // with its own clock. Nothing here is broadcast: a snapshot changes no job
  // row, and the next unattended run reads the file directly.
  safeHandle('automation:handbookSnapshotSync', (_event, entries: unknown) => {
    try {
      return syncDeptHandbookSnapshot(entries)
    } catch (err) {
      console.error('[automation:handbookSnapshotSync]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })

  // Answer one held permission request of an unattended run.
  //
  // The answer names job and request, never the job alone: approving one
  // request must never become "allow this job", and there is nothing to persist
  // — the permission model is one request at a time. A request whose run ended,
  // whose timeout fired, or that another click already answered is `not_waiting`
  // rather than a silent success, so the panel can say the row is gone.
  safeHandle('automation:approvalRespond', (_event, raw: unknown) => {
    try {
      const payload = raw as { jobId?: unknown; requestId?: unknown; approved?: unknown } | null
      if (typeof payload?.jobId !== 'string' || !payload.jobId ||
        typeof payload.requestId !== 'string' || !payload.requestId ||
        typeof payload.approved !== 'boolean') {
        return { ok: false, error: 'invalid_request' }
      }
      const answered = runApprovalQueue.answer(payload.jobId, payload.requestId, payload.approved)
      return answered ? { ok: true } : { ok: false, error: 'not_waiting' }
    } catch (err) {
      console.error('[automation:approvalRespond]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })

  ipcMain.handle('automation:create', (_event, input: AutomationInput) => createAutomationJob(input))

  // A duplicate is one scheduler call with an id and an optional name. The id
  // is type-checked here, before the scheduler is touched: a non-string would
  // otherwise simply miss and read as `not_found`, hiding a renderer bug.
  safeHandle('automation:clone', (_event, payload?: { id?: unknown; name?: unknown }) => {
    try {
      if (typeof payload?.id !== 'string') return { ok: false, error: 'not_found' }
      if (payload.name !== undefined && typeof payload.name !== 'string') {
        return { ok: false, error: 'name_invalid' }
      }
      return cloneAutomationJob(payload.id, payload.name)
    } catch (err) {
      console.error('[automation:clone]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })

  // Read-only preview of an unsaved schedule. It must answer rather than throw:
  // the dialog shows the reason beside the schedule, and a preview outage is not
  // a reason the user cannot save a valid schedule (main validates again there).
  safeHandle('automation:preview', (_event, trigger: unknown) => {
    try {
      // A non-object payload is a renderer bug, not a schedule: say so instead
      // of letting a string reach the scheduler and read as a missing trigger.
      if (trigger === null || typeof trigger !== 'object' || Array.isArray(trigger)) {
        return { ok: false, error: 'trigger_invalid' }
      }
      return previewAutomationSchedule(trigger as AutomationTrigger)
    } catch (err) {
      console.error('[automation:preview]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })

  ipcMain.handle('automation:update', (_event, id: string, input: AutomationInput) =>
    updateAutomationJob(String(id), input))

  // The user's delete: to the holding area, not to nothing. A plugin's job is
  // erased instead — see `deleteAutomationJobForPlugin` for why.
  safeHandle('automation:delete', (_event, id: unknown) => {
    try {
      if (typeof id !== 'string' || !id) {
        return { ok: false, code: 'not_found', error: 'No job was given' }
      }
      return trashAutomationJob(id)
    } catch (err) {
      console.error('[automation:delete]', err)
      return { ok: false, code: 'write_failed', error: 'unexpected_error' }
    }
  })

  // ── Recently deleted jobs ──
  // Same result-object discipline as the rest of this surface: the section
  // shows the named reason beside the row, and a refused restore must never be
  // reported as a success.
  safeHandle('automation:trash:list', () => {
    try {
      return listTrashedJobs()
    } catch (err) {
      console.error('[automation:trash:list]', err)
      // An empty list would claim "nothing was deleted"; a rejected invoke lets
      // the section say it could not read the holding area.
      throw err
    }
  })

  safeHandle('automation:trash:restore', (_event, id: unknown) => {
    try {
      if (typeof id !== 'string' || !id) {
        return { ok: false, code: 'not_found', error: 'No item was given' }
      }
      return restoreAutomationJob(id)
    } catch (err) {
      console.error('[automation:trash:restore]', err)
      return { ok: false, code: 'write_failed', error: 'unexpected_error' }
    }
  })

  safeHandle('automation:trash:purge', () => {
    try {
      return purgeTrashedJobs()
    } catch (err) {
      console.error('[automation:trash:purge]', err)
      return { ok: true, removed: 0 }
    }
  })

  safeHandle('automation:trash:remove', (_event, id: unknown) => {
    try {
      if (typeof id !== 'string' || !id) {
        return { ok: false, code: 'not_found', error: 'No item was given' }
      }
      return removeTrashedJob(id)
    } catch (err) {
      console.error('[automation:trash:remove]', err)
      return { ok: false, code: 'write_failed', error: 'unexpected_error' }
    }
  })

  ipcMain.handle('automation:setEnabled', (_event, id: string, enabled: boolean) =>
    setAutomationEnabled(String(id), !!enabled))

  ipcMain.handle('automation:runNow', (_event, id: string) => runAutomationNow(String(id)))

  // One switch for every job's scheduled runs. It does not replace the
  // per-job setEnabled channel: individual switches keep working while paused.
  ipcMain.handle('automation:setPausedAll', (_event, paused: boolean) =>
    setAutomationPausedAll(paused === true))

  // One daily cap for every job together, beside the global pause because it is
  // the same kind of state: a rail over the whole store, not a field on a job.
  // `null` clears it. Anything that is not a number is rejected rather than
  // coerced, so a renderer bug cannot silently remove the budget.
  ipcMain.handle('automation:setGlobalBudget', (_event, limitUsd: number | null) => {
    try {
      if (limitUsd !== null && typeof limitUsd !== 'number') {
        return { ok: false, error: 'cost_limit_invalid' }
      }
      return setAutomationGlobalBudget(limitUsd)
    } catch (err) {
      console.error('[automation:setGlobalBudget]', err)
      return { ok: false, error: 'unexpected_error' }
    }
  })
}
