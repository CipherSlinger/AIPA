// Renderer cache for tasks. The main process owns the record (userData/tasks.json);
// this store only mirrors what `tasks:*` returns and never persists anything.
//
// `TaskRecordData` (not the older `TaskQueueItem`) is the type here: the
// workflow engine's "task queue" is a list of chat prompts, while a task here is
// a directory with its own materials. The names deliberately do not overlap.
import { create } from 'zustand'
import type {
  LegacyFolderImportData,
  LegacyFolderInspectionData,
  TaskMaterialImportData,
  TaskMutationData,
  TaskRecordData,
  TaskRepeatData,
  TaskSaveAutomationRunData,
  TaskSaveAutomationRunResultData,
  TaskSessionLinkData,
  TaskStatusData,
} from '../../preload'

interface TaskState {
  tasks: TaskRecordData[]
  loading: boolean
  readFailed: boolean
  selectedTaskId: string | null
  load: () => Promise<void>
  selectTask: (id: string | null) => void
  createTask: (title: string, dueOn?: string | null) => Promise<TaskMutationData>
  updateTask: (
    id: string,
    patch: {
      title?: string
      status?: TaskStatusData
      note?: string
      dueOn?: string | null
      repeat?: TaskRepeatData | null
      /** Every N days/weeks/months; `null` restates N = 1. */
      repeatEvery?: number | null
    },
  ) => Promise<TaskMutationData>
  archiveTask: (id: string) => Promise<TaskMutationData>
  restoreTask: (id: string) => Promise<TaskMutationData>
  deleteTask: (id: string, deleteFiles: boolean) => Promise<{ ok: boolean; error?: string; task?: TaskRecordData }>
  addMaterials: (id: string, paths: string[], source: 'picker' | 'drop' | 'paste') => Promise<TaskMaterialImportData>
  removeMaterial: (id: string, materialId: string) => Promise<TaskMutationData>
  revealTask: (id: string) => Promise<{ ok: boolean; error?: string }>
  /** Record a completed conversation on the task. Main dedupes by session id. */
  linkSession: (id: string, input: TaskSessionLinkData) => Promise<TaskMutationData>
  /** File the task under a department (or clear it); attribution only. */
  routeTask: (id: string, departmentId: string | null) => Promise<TaskMutationData>
  /** Save an automation run's output as a task; a second save reopens it. */
  saveAutomationRun: (input: TaskSaveAutomationRunData) => Promise<TaskSaveAutomationRunResultData>
  /** Read-only preflight for importing a legacy department folder. */
  inspectLegacyFolder: (directory: string) => Promise<LegacyFolderInspectionData>
  /** Copy a legacy folder into a new task; a live task for the source is reused. */
  importLegacyFolder: (directory: string, departmentId: string) => Promise<LegacyFolderImportData>
}

let loadSeq = 0

function replaceTask(tasks: TaskRecordData[], task: TaskRecordData): TaskRecordData[] {
  const index = tasks.findIndex(item => item.id === task.id)
  if (index === -1) return [task, ...tasks]
  const next = tasks.slice()
  next[index] = task
  return next
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  readFailed: false,
  selectedTaskId: null,

  load: async () => {
    const request = ++loadSeq
    set({ loading: true })
    try {
      const api = window.electronAPI
      if (!api?.tasksList) throw new Error('tasks API unavailable')
      const tasks = await api.tasksList()
      if (request !== loadSeq) return
      if (!Array.isArray(tasks)) throw new Error('unreadable task list')
      const selected = get().selectedTaskId
      set({
        tasks,
        loading: false,
        readFailed: false,
        // A task deleted in another window leaves no detail to show.
        selectedTaskId: selected && tasks.some(task => task.id === selected) ? selected : null,
      })
    } catch (err) {
      console.error('[AIPA] Could not read tasks', err)
      if (request === loadSeq) set({ loading: false, readFailed: true, tasks: [] })
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  createTask: async (title, dueOn) => {
    try {
      const result = await window.electronAPI.tasksCreate({ title, dueOn })
      if (result.ok && result.task) {
        set(state => ({
          tasks: replaceTask(state.tasks, result.task!),
          selectedTaskId: result.task!.id,
        }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  updateTask: async (id, patch) => {
    try {
      const result = await window.electronAPI.tasksUpdate(id, patch)
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  archiveTask: async (id) => {
    try {
      const result = await window.electronAPI.tasksArchive(id)
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  restoreTask: async (id) => {
    try {
      const result = await window.electronAPI.tasksRestore(id)
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  deleteTask: async (id, deleteFiles) => {
    try {
      const result = await window.electronAPI.tasksDelete(id, { deleteFiles })
      if (result.ok) {
        if (result.mode === 'deleted') {
          set(state => ({
            tasks: state.tasks.filter(task => task.id !== id),
            selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
          }))
        } else if (result.task) {
          set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
        }
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  addMaterials: async (id, paths, source) => {
    try {
      const result = await window.electronAPI.tasksAddMaterials(id, { paths, source })
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  removeMaterial: async (id, materialId) => {
    try {
      const result = await window.electronAPI.tasksRemoveMaterial(id, materialId)
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  revealTask: async (id) => {
    try {
      return await window.electronAPI.tasksReveal(id)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  linkSession: async (id, input) => {
    try {
      const result = await window.electronAPI.tasksLinkSession(id, input)
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  routeTask: async (id, departmentId) => {
    try {
      const result = await window.electronAPI.tasksRoute(id, departmentId)
      if (result.ok && result.task) {
        set(state => ({ tasks: replaceTask(state.tasks, result.task!) }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  saveAutomationRun: async (input) => {
    try {
      const result = await window.electronAPI.tasksSaveAutomationRun(input)
      if (result.ok && result.task) {
        set(state => ({
          tasks: replaceTask(state.tasks, result.task!),
          selectedTaskId: result.task!.id,
        }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  inspectLegacyFolder: async (directory) => {
    try {
      return await window.electronAPI.tasksInspectLegacyFolder(directory)
    } catch {
      // A failed call means the folder could not be read, which is exactly the
      // disabled reason the note should show — not a silent enabled button.
      return { status: 'unreadable', files: 0, bytes: 0, skipped: 0, truncated: 0 }
    }
  },

  importLegacyFolder: async (directory, departmentId) => {
    try {
      const result = await window.electronAPI.tasksImportLegacyFolder({ directory, departmentId })
      if (result.ok && result.task) {
        set(state => ({
          tasks: replaceTask(state.tasks, result.task!),
          selectedTaskId: result.task!.id,
        }))
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}))
