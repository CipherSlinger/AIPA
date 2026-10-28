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
}
