/**
 * Main-owned durable state for tasks (increment 1: the task foundation).
 *
 * A task is the unit of work that owns a directory: its materials are copies
 * inside that directory, not references to wherever the user happened to keep
 * them. The renderer caches this record but never owns it. Like automation
 * jobs, the file lives under userData and is written atomically (tmp + rename)
 * so a renderer preference save can never overwrite a task edit.
 *
 * There is deliberately no dependency on departments, sessions, dispatch or
 * `prefs.workingDir` here: this increment adds a place to create, see and
 * manage tasks, and nothing else may change because of it. The `departmentId`
 * and `sessions` fields are reserved for increment 2 and are never written by
 * the current UI.
 *
 * Failure discipline: a missing store file, a corrupt store file and a missing
 * task directory are all normal states. Reading never throws. A malformed row
 * is dropped on its own; a task whose folder has disappeared is kept and
 * surfaced with `missing: true`, because the record is still the only
 * description of work the user did.
 */
import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getPref } from '../config/config-manager'
import { createLogger } from '../utils/logger'
import { getAllowedFsRoots, isPathInside, safePath } from '../utils/validate'

const log = createLogger('task-store')

export const TASK_STORE_VERSION = 1
export const TASK_SCHEMA_VERSION = 1

export const TASK_STATUSES = [
  'inbox',
  'ready',
  'assigned',
  'in_progress',
  'needs_you',
  'done',
  'archived',
] as const

export type TaskStatus = typeof TASK_STATUSES[number]

export type TaskMaterialSource =
  | 'picker'
  | 'drop'
  | 'paste'
  | 'import'
  | 'automation'
  | 'plugin'
  | 'unknown'

export interface TaskMaterial {
  id: string
  /** Original display name; may differ from the stored file name on collision. */
  name: string
  /** Task-relative path, always `materials/<file name>` with forward slashes. */
  relPath: string
  size: number
  mimeType?: string
  addedAt: number
  source: TaskMaterialSource
  /** Absolute path the copy came from. Kept for provenance, never used to read. */
  originPath?: string
}

/** Reserved for increment 2; kept in the schema so records survive the upgrade. */
export interface TaskSessionRef {
  sessionId: string
  startedAt: number
  purpose: 'dispatch' | 'followup'
  personaId?: string
}

export type TaskEventKind =
  | 'created'
  | 'material_added'
  | 'material_removed'
  | 'renamed'
  | 'status_changed'
  | 'moved'
  | 'folder_missing'
  | 'restored'

export interface TaskEvent {
  at: number
  kind: TaskEventKind
  detail?: string
}

export interface TaskRecord {
  schemaVersion: number
  id: string
  title: string
  /** Folder-safe prefix fixed at creation. Renaming the task never changes it. */
  slug: string
  /** Absolute task directory. The only absolute path stored on the record. */
  directory: string
  status: TaskStatus
  /** Reserved for increment 2 (department routing). */
  departmentId: string | null
  /** Reserved for increment 2. */
  routedBy: 'user' | 'suggestion' | 'auto' | null
  materials: TaskMaterial[]
  /** Reserved for increment 2. */
  sessions: TaskSessionRef[]
  history: TaskEvent[]
  createdAt: number
  updatedAt: number
}

/** A record plus the filesystem fact the renderer needs to draw honestly. */
export interface TaskView extends TaskRecord {
  missing: boolean
}

export interface TaskStore {
  tasks: TaskRecord[]
}

export type TaskFailure = { ok: false; code: string; error: string }
export type TaskMutation = { ok: true; task: TaskView } | TaskFailure
export type TaskDeleteResult =
  | { ok: true; task?: TaskView; mode: 'archived' | 'deleted'; trashedTo?: string }
  | TaskFailure
export type TaskMaterialImportResult =
  | {
      ok: true
      task: TaskView
      added: TaskMaterial[]
      errors: Array<{ path: string; error: string }>
    }
  | (TaskFailure & { errors?: Array<{ path: string; error: string }> })

const EVENT_KINDS = new Set<TaskEventKind>([
  'created', 'material_added', 'material_removed', 'renamed',
  'status_changed', 'moved', 'folder_missing', 'restored',
])

const MATERIAL_SOURCES = new Set<TaskMaterialSource>([
  'picker', 'drop', 'paste', 'import', 'automation', 'plugin', 'unknown',
])

const TASK_ID_RE = /^[A-Za-z0-9_-]+$/

export function tasksRoot(): string {
  return path.join(os.homedir(), 'AIPA', 'Tasks')
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'tasks.json')
}

function isStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeMaterial(raw: unknown): TaskMaterial | null {
  if (!raw || typeof raw !== 'object') return null
  const material = raw as Record<string, unknown>
  const id = nonEmptyString(material.id)
  const name = nonEmptyString(material.name)
  const relPath = nonEmptyString(material.relPath)
  const size = finiteNumber(material.size)
  const addedAt = finiteNumber(material.addedAt)
  if (!id || !name || !relPath || size === null || size < 0 || addedAt === null) return null

  // Only a file directly inside `materials/` is a material. This is what keeps
  // a hand-edited store from naming `../../id_rsa` as something removeMaterial
  // may delete.
  const posix = relPath.replace(/\\/g, '/')
  if (!posix.startsWith('materials/') || posix.includes('\0')) return null
  const rest = posix.slice('materials/'.length)
  if (!rest || rest.includes('/') || rest === '.' || rest === '..') return null
  if (name !== rest) return null

  const source = typeof material.source === 'string' && MATERIAL_SOURCES.has(material.source as TaskMaterialSource)
    ? material.source as TaskMaterialSource
    : 'unknown'

  return {
    id,
    name,
    relPath: `materials/${rest}`,
    size,
    ...(typeof material.mimeType === 'string' && material.mimeType ? { mimeType: material.mimeType } : {}),
    addedAt,
    source,
    ...(typeof material.originPath === 'string' && material.originPath ? { originPath: material.originPath } : {}),
  }
}

function normalizeHistory(raw: unknown): TaskEvent[] {
  if (!Array.isArray(raw)) return []
  const events: TaskEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const event = item as Record<string, unknown>
    const at = finiteNumber(event.at)
    const kind = event.kind
    if (at === null || typeof kind !== 'string' || !EVENT_KINDS.has(kind as TaskEventKind)) continue
    events.push({
      at,
      kind: kind as TaskEventKind,
      ...(typeof event.detail === 'string' && event.detail ? { detail: event.detail } : {}),
    })
  }
  return events
}

function normalizeSessions(raw: unknown): TaskSessionRef[] {
  if (!Array.isArray(raw)) return []
  const sessions: TaskSessionRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const session = item as Record<string, unknown>
    const sessionId = nonEmptyString(session.sessionId)
    const startedAt = finiteNumber(session.startedAt)
    const purpose = session.purpose === 'dispatch' || session.purpose === 'followup' ? session.purpose : null
    if (!sessionId || startedAt === null || !purpose) continue
    sessions.push({
      sessionId,
      startedAt,
      purpose,
      ...(nonEmptyString(session.personaId) ? { personaId: nonEmptyString(session.personaId)! } : {}),
    })
  }
  return sessions
}

/**
 * The single validator for a persisted task. Exported so a future importer or
 * trash reader uses exactly the same whitelist as the live store.
 */
export function normalizeTask(raw: unknown): TaskRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const task = raw as Record<string, unknown>
  const id = nonEmptyString(task.id)
  const title = nonEmptyString(task.title)
  const directory = nonEmptyString(task.directory)
  if (!id || !TASK_ID_RE.test(id)) return null
  if (!title || title.length > 200) return null
  if (!directory || !path.isAbsolute(directory)) return null

  const slug = nonEmptyString(task.slug)
  if (!slug) return null

  const createdAt = finiteNumber(task.createdAt) ?? Date.now()
  const updatedAt = finiteNumber(task.updatedAt) ?? createdAt

  return {
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    title,
    slug,
    directory: path.normalize(directory),
    status: isStatus(task.status) ? task.status : 'inbox',
    departmentId: nonEmptyString(task.departmentId),
    routedBy: task.routedBy === 'user' || task.routedBy === 'suggestion' || task.routedBy === 'auto'
      ? task.routedBy
      : null,
    materials: Array.isArray(task.materials)
      ? task.materials.map(normalizeMaterial).filter((m): m is TaskMaterial => m !== null)
      : [],
    sessions: normalizeSessions(task.sessions),
    history: normalizeHistory(task.history),
    createdAt,
    updatedAt,
  }
}

/**
 * Read the store. A missing file is an empty store; a corrupt file is logged
 * and treated as empty (kept on disk for inspection, rewritten by the next
 * save). Never throws — a task page must open even when its backing file was
 * damaged by a disk or a hand edit.
 */
export function readTaskStore(file: string = getStorePath()): TaskStore {
  if (!fs.existsSync(file)) return { tasks: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const list = Array.isArray(parsed.tasks) ? parsed.tasks : []
    const seen = new Set<string>()
    const tasks: TaskRecord[] = []
    for (const row of list) {
      const task = normalizeTask(row)
      if (!task || seen.has(task.id)) continue
      seen.add(task.id)
      tasks.push(task)
    }
    if (tasks.length !== list.length) {
      log.warn(`tasks.json: dropped ${list.length - tasks.length} malformed or duplicate row(s)`)
    }
    return { tasks }
  } catch (err) {
    log.warn('Could not read tasks.json:', err)
    // Keep the damaged file before the next mutation replaces it: a task list
    // that quietly resets is worse than one that resets loudly, and the copy is
    // the only way to recover titles and folder paths by hand.
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(file, `${file}.corrupt-${stamp}`)
    } catch { /* best effort */ }
    return { tasks: [] }
  }
}

/**
 * A directory belongs to the record only if its own mirror says so. `moveTask`
 * lets a task live outside `tasksRoot()`, so containment is not a usable test;
 * an id match is. Checked before anything renames or deletes, so a hand-edited
 * or corrupted `tasks.json` cannot aim the store at an unrelated folder.
 */
function isOwnedDirectory(record: TaskRecord): boolean {
  try {
    const raw = fs.readFileSync(path.join(record.directory, 'task.json'), 'utf-8')
    const mirror = JSON.parse(raw) as Record<string, unknown>
    return mirror?.id === record.id
  } catch {
    return false
  }
}

/** Atomic write; false on failure so a create can clean up its half-made folder. */
export function writeTaskStore(store: TaskStore, file: string = getStorePath()): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({
      version: TASK_STORE_VERSION,
      tasks: store.tasks,
    }, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return true
  } catch (err) {
    log.warn('Could not write tasks.json:', err)
    return false
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

/** The portable per-task mirror. Best-effort after create; the store stays authority. */
function writeTaskMirror(task: TaskRecord): void {
  try {
    writeJsonAtomic(path.join(task.directory, 'task.json'), task)
  } catch (err) {
    log.warn(`Could not write task.json mirror for ${task.id}:`, err)
  }
}

function folderMissing(directory: string): boolean {
  try {
    return !fs.statSync(directory).isDirectory()
  } catch {
    return true
  }
}

export function taskView(record: TaskRecord): TaskView {
  return { ...record, missing: folderMissing(record.directory) }
}

function storeWith(records: TaskRecord[]): TaskStore {
  return { tasks: records }
}

function replaceTask(store: TaskStore, next: TaskRecord): void {
  const index = store.tasks.findIndex(task => task.id === next.id)
  if (index === -1) store.tasks.push(next)
  else store.tasks[index] = next
}

function appendEvent(record: TaskRecord, kind: TaskEventKind, detail?: string): TaskRecord {
  return {
    ...record,
    updatedAt: Date.now(),
    history: [...record.history, { at: Date.now(), kind, ...(detail ? { detail } : {}) }],
  }
}

function failure(code: string, error: string): TaskFailure {
  return { ok: false, code, error }
}

function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'task'
}

/** `<slug>-<idtail>`; the name is fixed at creation and survives renames. */
function uniqueDirectory(root: string, slug: string, id: string): { directory: string; idtail: string } {
  const clean = id.replace(/[^A-Za-z0-9]/g, '')
  let idtail = clean.slice(-8) || '00000000'
  let attempt = 0
  for (;;) {
    const candidate = path.join(root, `${slug}-${idtail}`)
    if (!fs.existsSync(candidate)) return { directory: candidate, idtail }
    attempt += 1
    idtail = `${clean.slice(-6)}${attempt}`
  }
}

export function listTasks(): TaskView[] {
  return readTaskStore().tasks
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(taskView)
}

export function getTask(id: unknown): TaskView | null {
  if (typeof id !== 'string' || !id) return null
  const record = readTaskStore().tasks.find(task => task.id === id)
  return record ? taskView(record) : null
}

export function createTask(input: { title?: unknown; status?: unknown }): TaskMutation {
  const title = nonEmptyString(input?.title)
  if (!title) return failure('invalid_title', 'A task needs a title')
  if (title.length > 200) return failure('invalid_title', 'The title must be 200 characters or fewer')

  const status = isStatus(input?.status) ? input.status : 'inbox'
  if (status === 'archived') return failure('invalid_status', 'A new task cannot start archived')

  const root = tasksRoot()
  const now = Date.now()
  const id = `task-${randomUUID()}`
  const slug = slugify(title)
  const { directory } = uniqueDirectory(root, slug, id)

  try {
    fs.mkdirSync(path.join(directory, 'materials'), { recursive: true })
    fs.mkdirSync(path.join(directory, 'output'), { recursive: true })
    fs.mkdirSync(path.join(directory, 'notes'), { recursive: true })
  } catch (err) {
    log.warn(`Could not create task directory ${directory}:`, err)
    return failure('directory_failed', 'The task folder could not be created')
  }

  const record: TaskRecord = {
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    title,
    slug,
    directory,
    status,
    departmentId: null,
    routedBy: null,
    materials: [],
    sessions: [],
    history: [{ at: now, kind: 'created' }],
    createdAt: now,
    updatedAt: now,
  }

  try {
    // The mirror is written before the record: a store row whose folder is
    // missing is a state the UI must tolerate, but a folder with no row would
    // be invisible work. If either write fails, neither is kept.
    writeJsonAtomic(path.join(directory, 'task.json'), record)
  } catch (err) {
    log.warn('Could not write the task mirror; removing the new folder:', err)
    try { fs.rmSync(directory, { recursive: true, force: true }) } catch { /* best effort */ }
    return failure('write_failed', 'The task could not be written to disk')
  }

  const store = readTaskStore()
  store.tasks.unshift(record)
  if (!writeTaskStore(store)) {
    try { fs.rmSync(directory, { recursive: true, force: true }) } catch { /* best effort */ }
    return failure('write_failed', 'The task could not be saved')
  }

  return { ok: true, task: taskView(record) }
}

export function updateTask(
  id: unknown,
  patch: { title?: unknown; status?: unknown },
): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')

  let next = current
  if (patch?.title !== undefined) {
    const title = nonEmptyString(patch.title)
    if (!title) return failure('invalid_title', 'A task needs a title')
    if (title.length > 200) return failure('invalid_title', 'The title must be 200 characters or fewer')
    if (title !== current.title) {
      next = appendEvent({ ...next, title }, 'renamed', `${current.title} -> ${title}`)
    }
  }
  if (patch?.status !== undefined) {
    if (!isStatus(patch.status)) return failure('invalid_status', 'Unknown task status')
    if (patch.status !== next.status) {
      next = appendEvent({ ...next, status: patch.status }, 'status_changed', `${next.status} -> ${patch.status}`)
    }
  }

  if (next === current) return { ok: true, task: taskView(current) }

  replaceTask(store, next)
  if (!writeTaskStore(store)) return failure('write_failed', 'The task could not be saved')
  writeTaskMirror(next)
  return { ok: true, task: taskView(next) }
}

export function archiveTask(id: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (current.status === 'archived') return { ok: true, task: taskView(current) }

  const next = appendEvent({ ...current, status: 'archived' }, 'status_changed', `${current.status} -> archived`)
  replaceTask(store, next)
  if (!writeTaskStore(store)) return failure('write_failed', 'The task could not be archived')
  writeTaskMirror(next)
  return { ok: true, task: taskView(next) }
}

/** Bring an archived task back to the status it had before archiving. */
export function restoreTask(id: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (current.status !== 'archived') return { ok: true, task: taskView(current) }

  let previous: TaskStatus = 'inbox'
  for (let i = current.history.length - 1; i >= 0; i--) {
    const event = current.history[i]
    if (event.kind !== 'status_changed' || !event.detail) continue
    const match = /^([a-z_]+) -> archived$/.exec(event.detail)
    if (match && isStatus(match[1]) && match[1] !== 'archived') {
      previous = match[1]
      break
    }
  }

  const restored = appendEvent({ ...current, status: previous }, 'restored', previous)
  replaceTask(store, restored)
  if (!writeTaskStore(store)) return failure('write_failed', 'The task could not be restored')
  writeTaskMirror(restored)
  return { ok: true, task: taskView(restored) }
}

/**
 * Delete a task. The default is an archive: the record stays and the folder
 * never moves. `deleteFiles: true` additionally moves the whole directory into
 * the app's trash (`userData/trash/tasks`), the same "nothing is destroyed at
 * once" discipline as jobs, sessions and skills.
 */
export function deleteTask(id: unknown, options?: { deleteFiles?: unknown }): TaskDeleteResult {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  if (options?.deleteFiles !== true) {
    const archived = archiveTask(id)
    return archived.ok ? { ok: true, mode: 'archived', task: archived.task } : archived
  }

  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')

  let trashedTo: string | undefined
  const missing = folderMissing(current.directory)
  if (!missing && !isOwnedDirectory(current)) {
    // The record points at a folder that is not this task's own copy. Refuse
    // rather than rename whatever happens to live there.
    return failure('invalid_directory', "The task's folder does not belong to this task")
  }
  if (!missing) {
    const trashRoot = path.join(app.getPath('userData'), 'trash', 'tasks')
    try {
      fs.mkdirSync(trashRoot, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const dest = path.join(trashRoot, `${path.basename(current.directory)}-${stamp}`)
      fs.renameSync(current.directory, dest)
      trashedTo = dest
    } catch (err) {
      log.warn(`Could not move task folder ${current.directory} to the trash:`, err)
      return failure('move_failed', 'The task folder could not be moved to the trash; the task was kept')
    }
  }

  const next = storeWith(store.tasks.filter(task => task.id !== id))
  if (!writeTaskStore(next)) {
    // Put the folder back so the store and the disk agree.
    if (trashedTo) {
      try { fs.renameSync(trashedTo, current.directory) } catch { /* best effort */ }
    }
    return failure('write_failed', 'The task could not be deleted')
  }
  return { ok: true, mode: 'deleted', ...(trashedTo ? { trashedTo } : {}) }
}

/**
 * Copy files into `<task>/materials/`. Every source is validated through the
 * app's allowed-roots gate before it is read. Copies only — never a link and
 * never a move, so the user's original is untouched and the task stays
 * self-contained.
 */
export function addMaterials(
  id: unknown,
  paths: unknown,
  source: unknown,
): TaskMaterialImportResult {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  if (!Array.isArray(paths) || paths.length === 0) return failure('invalid_paths', 'No files were given')
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (folderMissing(current.directory)) return failure('folder_missing', "The task's folder is missing")

  const materialsDir = path.join(current.directory, 'materials')
  try {
    fs.mkdirSync(materialsDir, { recursive: true })
  } catch (err) {
    log.warn(`Could not create materials folder for ${id}:`, err)
    return failure('directory_failed', 'The materials folder could not be created')
  }

  const workingDir = getPref('workingDir')
  const allowedRoots = getAllowedFsRoots(typeof workingDir === 'string' ? workingDir : undefined)
  const materialSource: TaskMaterialSource = typeof source === 'string' && MATERIAL_SOURCES.has(source as TaskMaterialSource)
    ? source as TaskMaterialSource
    : 'unknown'

  const added: TaskMaterial[] = []
  const errors: Array<{ path: string; error: string }> = []
  let next = current
  const usedNames = new Set(current.materials.map(material => path.basename(material.relPath)))

  for (const raw of paths) {
    if (typeof raw !== 'string' || !raw.trim()) {
      errors.push({ path: String(raw), error: 'Empty path' })
      continue
    }
    let sourcePath: string
    try {
      sourcePath = safePath(raw, allowedRoots)
      const stat = fs.statSync(sourcePath)
      if (!stat.isFile()) throw new Error('Not a file')
    } catch (err) {
      errors.push({ path: raw, error: err instanceof Error ? err.message : String(err) })
      continue
    }

    const originalName = path.basename(sourcePath)
    if (!originalName || originalName.includes('\0')) {
      errors.push({ path: raw, error: 'Unusable file name' })
      continue
    }
    const storedName = uniqueFileName(originalName, usedNames)
    usedNames.add(storedName)
    const dest = path.join(materialsDir, storedName)
    try {
      fs.copyFileSync(sourcePath, dest)
      const stat = fs.statSync(dest)
      const material: TaskMaterial = {
        id: `mat-${randomUUID()}`,
        name: originalName,
        relPath: `materials/${storedName}`,
        size: stat.size,
        addedAt: Date.now(),
        source: materialSource,
        originPath: sourcePath,
      }
      added.push(material)
      next = appendEvent({
        ...next,
        materials: [...next.materials, material],
      }, 'material_added', originalName)
    } catch (err) {
      errors.push({ path: raw, error: err instanceof Error ? err.message : String(err) })
      try { fs.rmSync(dest, { force: true }) } catch { /* best effort */ }
    }
  }

  if (added.length === 0) {
    return { ok: false, code: 'import_failed', error: 'No files could be added', errors }
  }

  replaceTask(store, next)
  if (!writeTaskStore(store)) {
    // The copies already exist; nothing in the store names them, so they would
    // sit in materials/ forever. Undo them with the failed record.
    for (const material of added) {
      try { fs.rmSync(path.join(current.directory, material.relPath), { force: true }) } catch { /* best effort */ }
    }
    return failure('write_failed', 'The task could not be saved')
  }
  writeTaskMirror(next)
  return { ok: true, task: taskView(next), added, errors }
}

/** Pick a destination name that does not overwrite an existing copy. */
function uniqueFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  let n = 1
  let candidate = `${stem} (${n})${ext}`
  while (used.has(candidate)) {
    n += 1
    candidate = `${stem} (${n})${ext}`
  }
  return candidate
}

/** Delete the task's copy. The original path recorded at import is never touched. */
export function removeMaterial(id: unknown, materialId: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  if (typeof materialId !== 'string' || !materialId) return failure('invalid_material', 'Unknown material')
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  const material = current.materials.find(item => item.id === materialId)
  if (!material) return failure('not_found', 'Unknown material')
  if (folderMissing(current.directory)) return failure('folder_missing', "The task's folder is missing")

  const materialsDir = path.join(current.directory, 'materials')
  const absolute = path.resolve(current.directory, material.relPath)
  // The normalizer already guarantees a single segment, but the delete path
  // re-checks containment so a future caller cannot widen this into a general
  // file remover.
  if (!isPathInside(materialsDir, absolute) || path.dirname(absolute) !== path.normalize(materialsDir)) {
    return failure('invalid_material', 'The material path is outside the task folder')
  }
  if (!isOwnedDirectory(current)) {
    return failure('invalid_directory', "The task's folder does not belong to this task")
  }

  const next = appendEvent({
    ...current,
    materials: current.materials.filter(item => item.id !== materialId),
  }, 'material_removed', material.name)

  replaceTask(store, next)
  if (!writeTaskStore(store)) return failure('write_failed', 'The task could not be saved')
  // The record stopped naming this file before the file went away, so a failed
  // unlink leaves an orphan the user can still find, not a row pointing at
  // something that no longer exists.
  try {
    fs.rmSync(absolute, { force: true })
  } catch (err) {
    log.warn(`Could not remove material ${absolute}:`, err)
  }
  writeTaskMirror(next)
  return { ok: true, task: taskView(next) }
}

/**
 * Move the task directory to a new parent, before any conversation exists.
 * Increment 1 has no turns, so this is the free pre-flight move described in
 * the design; increment 2 must stop offering it once a session has started.
 */
export function moveTask(id: unknown, targetRoot: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  if (typeof targetRoot !== 'string' || !targetRoot.trim()) {
    return failure('invalid_target', 'A destination folder is required')
  }
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (folderMissing(current.directory)) return failure('folder_missing', "The task's folder is missing")
  if (!isOwnedDirectory(current)) {
    return failure('invalid_directory', "The task's folder does not belong to this task")
  }

  const workingDir = getPref('workingDir')
  let target: string
  try {
    target = safePath(targetRoot, getAllowedFsRoots(typeof workingDir === 'string' ? workingDir : undefined))
  } catch (err) {
    return failure('invalid_target', err instanceof Error ? err.message : String(err))
  }

  const destination = path.join(target, path.basename(current.directory))
  if (path.resolve(destination) === path.resolve(current.directory)) {
    return { ok: true, task: taskView(current) }
  }
  try {
    fs.mkdirSync(target, { recursive: true })
    if (fs.existsSync(destination)) return failure('target_exists', 'A folder with that name already exists')
    fs.renameSync(current.directory, destination)
  } catch (err) {
    log.warn(`Could not move task ${id}:`, err)
    return failure('move_failed', 'The task folder could not be moved')
  }

  const next = appendEvent({
    ...current,
    directory: destination,
  }, 'moved', `${current.directory} -> ${destination}`)

  replaceTask(store, next)
  if (!writeTaskStore(store)) {
    try { fs.renameSync(destination, current.directory) } catch { /* best effort */ }
    return failure('write_failed', 'The task could not be saved after moving')
  }
  writeTaskMirror(next)
  return { ok: true, task: taskView(next) }
}
