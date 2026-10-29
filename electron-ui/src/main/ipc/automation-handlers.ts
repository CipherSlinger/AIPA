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
  deleteAutomationJob,
  listAutomationDeptBudgetReports,
  listAutomationJobs,
  previewAutomationSchedule,
  runAutomationNow,
  setAutomationDeptBudget,
  setAutomationEnabled,
  setAutomationGlobalBudget,
  setAutomationPausedAll,
  syncAutomationDeptBudgets,
  updateAutomationJob,
} from '../automation/scheduler'
import { normalizeDeptSpendRequest, summarizeDeptSpend } from '../automation/spend-guard'
import type { AutomationInput, AutomationTrigger } from '../automation/types'

/**
 * Register without colliding with a handler left behind by a previous
 * registration. Local to this module for the same reason as the one in
 * `ipc/index.ts`: registration happens once per process, but a hot reload or a
 * second call must not crash the app.
 */
function safeHandle(channel: string, handler: (...args: any[]) => any): void {
  try { ipcMain.removeHandler(channel) } catch { /* no previous handler */ }
  ipcMain.handle(channel, handler)
}

export function registerAutomationHandlers(): void {
  ipcMain.handle('automation:list', () => {
    try {
      return listAutomationJobs()
    } catch (err) {
      console.error('[automation:list]', err)
      return { jobs: [], limits: null }
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

  ipcMain.handle('automation:delete', (_event, id: string) => deleteAutomationJob(String(id)))

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
