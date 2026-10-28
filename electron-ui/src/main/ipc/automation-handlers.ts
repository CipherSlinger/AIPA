/**
 * IPC surface for Automations (Settings → Automations).
 *
 * Mutations resolve with `{ ok, error }` instead of throwing: the settings page
 * has to show validation failures next to the field that caused them, and a
 * rejected invoke would only surface as an opaque string.
 */
import { ipcMain } from 'electron'
import {
  createAutomationJob,
  deleteAutomationJob,
  listAutomationJobs,
  runAutomationNow,
  setAutomationEnabled,
  setAutomationGlobalBudget,
  setAutomationPausedAll,
  updateAutomationJob,
} from '../automation/scheduler'
import type { AutomationInput } from '../automation/types'

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
