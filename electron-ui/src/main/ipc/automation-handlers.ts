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
  listAutomationJobs,
  previewAutomationSchedule,
  runAutomationNow,
  setAutomationEnabled,
  setAutomationGlobalBudget,
  setAutomationPausedAll,
  updateAutomationJob,
} from '../automation/scheduler'
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
