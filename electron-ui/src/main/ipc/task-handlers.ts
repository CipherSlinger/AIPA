/**
 * IPC surface for tasks (increment 1: the task foundation; increment 2:
 * conversation links and explicit department routing).
 *
 * Every handler that names a task goes through the store's own lookup, so no
 * handler can act on an id that is not in `tasks.json`. Every path arrives from
 * the renderer as an opaque string and is validated by the store against the
 * existing allowed-roots gate before it is read.
 *
 * Mutations broadcast `tasks:changed` only after they succeed. A failed call
 * returns `{ ok: false, code, error }`: the renderer has to show the reason
 * beside the control that caused it, and a rejected invoke would only surface
 * as an opaque string.
 */
import { shell } from 'electron'
import * as fs from 'fs'
import { safeHandle } from './register/safe-handle'
import { createLogger } from '../utils/logger'
import {
  addMaterials,
  addTextMaterial,
  archiveTask,
  createTask,
  deleteTask,
  getTask,
  importLegacyFolder,
  inspectLegacyFolder,
  linkTaskSession,
  listTasks,
  moveTask,
  removeMaterial,
  restoreTask,
  routeTask,
  updateTask,
} from '../tasks/task-store'
import { saveAutomationRunAsTask } from '../tasks/automation-intake'

const log = createLogger('ipc:tasks')

type Send = (channel: string, ...args: unknown[]) => void

export function registerTaskHandlers(send: Send): void {
  const changed = () => {
    try { send('tasks:changed') } catch (err) { log.warn('tasks:changed broadcast failed:', String(err)) }
  }

  safeHandle('tasks:list', () => {
    try {
      return listTasks()
    } catch (err) {
      log.error('tasks:list failed:', String(err))
      return []
    }
  })

  safeHandle('tasks:get', (_event, id: unknown) => {
    try {
      return getTask(id)
    } catch (err) {
      log.error('tasks:get failed:', String(err))
      return null
    }
  })

  safeHandle('tasks:create', (_event, input: unknown) => {
    const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const result = createTask({ title: payload.title, status: payload.status })
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:update', (_event, id: unknown, patch: unknown) => {
    const payload = patch && typeof patch === 'object' ? patch as Record<string, unknown> : {}
    const result = updateTask(id, {
      title: payload.title,
      status: payload.status,
      // Only a string may reach the store; the store trims, collapses and
      // caps it. Anything else is simply not a note.
      note: typeof payload.note === 'string' ? payload.note : undefined,
    })
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:archive', (_event, id: unknown) => {
    const result = archiveTask(id)
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:restore', (_event, id: unknown) => {
    const result = restoreTask(id)
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:delete', (_event, id: unknown, options: unknown) => {
    const payload = options && typeof options === 'object' ? options as Record<string, unknown> : {}
    const result = deleteTask(id, { deleteFiles: payload.deleteFiles })
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:addMaterials', (_event, id: unknown, input: unknown) => {
    const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const result = addMaterials(id, payload.paths, payload.source)
    if (result.ok) changed()
    return result
  })

  // A text material, e.g. a note the caller composed. The store enforces the
  // size cap, sanitized filename and the same ownership check as addMaterials.
  safeHandle('tasks:addTextMaterial', (_event, id: unknown, input: unknown) => {
    const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const result = addTextMaterial(id, {
      name: payload.name,
      text: payload.text,
      source: payload.source,
    })
    if (result.ok) changed()
    return result
  })

  // Turn a remembered automation run into a task whose material is the run's
  // own output. Idempotent by the task history (see `automation-intake.ts`).
  safeHandle('tasks:saveAutomationRun', async (_event, input: unknown) => {
    const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const result = await saveAutomationRunAsTask({
      jobId: payload.jobId,
      startedAt: payload.startedAt,
      departmentId: payload.departmentId,
    })
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:removeMaterial', (_event, id: unknown, materialId: unknown) => {
    const result = removeMaterial(id, materialId)
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:move', (_event, id: unknown, targetRoot: unknown) => {
    const result = moveTask(id, targetRoot)
    if (result.ok) changed()
    return result
  })

  // Increment 2: a completed turn in a task tab becomes one row on the task.
  // The input is validated by the store; the handler only unwraps it.
  safeHandle('tasks:linkSession', (_event, id: unknown, input: unknown) => {
    const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const result = linkTaskSession(id, {
      sessionId: payload.sessionId,
      purpose: payload.purpose,
      personaId: payload.personaId,
    })
    if (result.ok) changed()
    return result
  })

  // Migration: a legacy department folder can become a task. The inspection is
  // read-only and lets the department/archive note disable its button with the
  // actual reason; the import copies (never moves) into a new task's materials.
  safeHandle('tasks:inspectLegacyFolder', (_event, directory: unknown) => {
    try {
      return inspectLegacyFolder(directory)
    } catch (err) {
      log.error('tasks:inspectLegacyFolder failed:', String(err))
      return { status: 'unreadable', files: 0, bytes: 0, skipped: 0, truncated: 0 }
    }
  })

  safeHandle('tasks:importLegacyFolder', (_event, input: unknown) => {
    const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const result = importLegacyFolder({
      directory: payload.directory,
      departmentId: payload.departmentId,
    })
    if (result.ok) changed()
    return result
  })

  // Explicit department routing. `null` clears the filing; the task folder and
  // status are deliberately not touched.
  safeHandle('tasks:route', (_event, id: unknown, departmentId: unknown) => {
    const result = routeTask(id, departmentId === undefined ? null : departmentId)
    if (result.ok) changed()
    return result
  })

  safeHandle('tasks:reveal', async (_event, id: unknown) => {
    const task = getTask(id)
    if (!task) return { ok: false, code: 'not_found', error: 'Unknown task' }
    if (task.missing || !fs.existsSync(task.directory)) {
      return { ok: false, code: 'folder_missing', error: "The task's folder is missing" }
    }
    try {
      const error = await shell.openPath(task.directory)
      return error ? { ok: false, code: 'open_failed', error } : { ok: true }
    } catch (err) {
      log.warn('tasks:reveal failed:', String(err))
      return { ok: false, code: 'open_failed', error: String(err) }
    }
  })
}
