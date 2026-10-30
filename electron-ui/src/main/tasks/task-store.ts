/**
 * Main-owned durable state for tasks.
 *
 * A task is the unit of work that owns a directory: its materials are copies
 * inside that directory, not references to wherever the user happened to keep
 * them. The renderer caches this record but never owns it. Like automation
 * jobs, the file lives under userData and is written atomically (tmp + rename)
 * so a renderer preference save can never overwrite a task edit.
 *
 * Increment 2 records two things here that the renderer observes rather than
 * invents: the conversations that ran for a task (`sessions`, linked after a
 * completed turn) and the department a task is filed under (`departmentId`,
 * attribution only). Neither is a working directory — `directory` is the only
 * folder a task's turns run in, and this module never reads or writes
 * `prefs.workingDir`.
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
import { preserveCorruptFile } from '../utils/corrupt-file'
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

/**
 * A conversation that ran for this task. `startedAt` is the main-process clock
 * at the moment the successful turn was reported, never a renderer timestamp:
 * the record is what survives a restart, so it must not depend on a clock the
 * window can lose.
 */
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
  | 'routed'
  | 'reassigned'
  | 'session_started'
  | 'from_automation'
  | 'imported_folder'
  | 'from_notice'

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
  /**
   * Attribution, not a working directory: the task folder is where its turns
   * run, and this only records who the task is filed under. Null is a valid
   * state — a task never has to belong to a department.
   */
  departmentId: string | null
  /** How `departmentId` was chosen. Increment 2 only writes 'user'. */
  routedBy: 'user' | 'suggestion' | 'auto' | null
  materials: TaskMaterial[]
  /** Conversations that ran in this task, in the order they started. */
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
/** What the renderer reports once a turn in a task tab completed successfully. */
export interface TaskSessionLinkInput {
  sessionId?: unknown
  purpose?: unknown
  personaId?: unknown
}

export type TaskMaterialImportResult =
  | {
      ok: true
      task: TaskView
      added: TaskMaterial[]
      errors: Array<{ path: string; error: string }>
    }
  | (TaskFailure & { errors?: Array<{ path: string; error: string }> })

/** A text material is a note, not a transcript backup; this keeps one bounded. */
export const MAX_TEXT_MATERIAL_BYTES = 2 * 1024 * 1024

/**
 * How much of a legacy folder one import may copy.
 *
 * A legacy folder is user-owned and can be arbitrarily large (a project with
 * node_modules, a media dump). The import is a convenience, not a backup: it
 * copies a bounded snapshot and records how much it left behind, so the source
 * stays the complete original. The caps are generous for documents and small
 * projects, and small enough that the copy finishes while the click is still on
 * screen.
 */
export const MAX_LEGACY_IMPORT_FILES = 500
export const MAX_LEGACY_IMPORT_BYTES = 200 * 1024 * 1024

export type LegacyFolderStatus = 'ok' | 'missing' | 'empty' | 'unreadable' | 'too_large'

/** What the department note needs to know before it offers the import button. */
export interface LegacyFolderInspection {
  status: LegacyFolderStatus
  /** Importable files found within the caps, and their total size. */
  files: number
  bytes: number
  /** Hidden entries, symlinks, non-files and unreadable children skipped. */
  skipped: number
  /** Files found but not importable because a cap was reached. */
  truncated: number
}

export interface LegacyFolderImportInput {
  directory?: unknown
  departmentId?: unknown
}

export type LegacyFolderImportResult =
  | {
      ok: true
      task: TaskView
      /** The source path was already recorded by a live task; nothing was copied. */
      reused: boolean
      filesCopied: number
      filesSkipped: number
      filesTruncated: number
    }
  | TaskFailure

export interface LegacyImportCounts {
  files: number
  skipped: number
  truncated: number
}

/**
 * The history row's stable detail.
 *
 * The prefix is the exact source path, which is what idempotence looks for; the
 * suffixes are counts a person can read. The greedy parse below keeps a path
 * that happens to contain the separator intact, and `|` cannot appear in a
 * Windows file name in any case.
 */
export function legacyImportDetail(source: string, counts: LegacyImportCounts): string {
  return `${source} | files=${counts.files} skipped=${counts.skipped} truncated=${counts.truncated}`
}

export function parseLegacyImportDetail(
  detail: string | undefined,
): (LegacyImportCounts & { source: string }) | null {
  if (typeof detail !== 'string') return null
  const match = /^(.*) \| files=(\d+) skipped=(\d+) truncated=(\d+)$/.exec(detail)
  if (!match) return null
  const files = Number(match[2])
  const skipped = Number(match[3])
  const truncated = Number(match[4])
  if (![files, skipped, truncated].every(Number.isFinite)) return null
  return { source: match[1], files, skipped, truncated }
}

export interface TaskTextMaterialInput {
  /** Display name; sanitized to one path segment before it becomes a file. */
  name?: unknown
  text?: unknown
  source?: unknown
  /**
   * Main-process only: the automation run this material came from. It is
   * appended to history in the same store write as the material, so a saved
   * run can never leave a task whose provenance row is missing. The generic
   * IPC handler deliberately does not accept this field.
   */
  automationRun?: { jobId?: unknown; startedAt?: unknown }
}

/**
 * The stable provenance key for "this task holds the output of that run".
 * Job ids are opaque ids, not paths, so a `:` separator is unambiguous; the
 * start time is the record's identity within a job's history.
 */
export function automationRunDetail(jobId: string, startedAt: number): string {
  return `automation:${jobId}:${startedAt}`
}

export interface AutomationRunRef {
  jobId: string
  startedAt: number
}

function parseAutomationRun(input: TaskTextMaterialInput['automationRun']): AutomationRunRef | null {
  if (!input || typeof input !== 'object') return null
  const jobId = nonEmptyString(input.jobId)
  const startedAt = finiteNumber(input.startedAt)
  if (!jobId || jobId.length > 200 || startedAt === null || startedAt < 0) return null
  return { jobId, startedAt }
}

/** Every task whose history names this run, newest first (normally 0 or 1). */
export function findTasksByAutomationRun(jobId: string, startedAt: number): TaskRecord[] {
  const detail = automationRunDetail(jobId, startedAt)
  return readTaskStore().tasks
    .filter(task => task.history.some(event => event.kind === 'from_automation' && event.detail === detail))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * One filename segment, safe on Windows and readable. The IPC boundary may
 * carry a path, a drive letter or a control character; none may reach disk.
 */
function sanitizeMaterialName(raw: unknown, fallback: string): string {
  const base = typeof raw === 'string' ? path.basename(raw.replace(/\\/g, '/')) : ''
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 80)
  const name = cleaned || fallback
  return path.extname(name) ? name : `${name}.md`
}

function writeTextAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, 'utf-8')
  fs.renameSync(tmp, file)
}

/**
 * Write caller-supplied text into `<task>/materials/`.
 *
 * This is the text counterpart of `addMaterials`: the same ownership check
 * (the folder must carry this task's own mirror), the same single-segment
 * filename rule, an atomic write, and the same rollback when the store write
 * fails. It does not read any caller path, so the allowed-roots gate has
 * nothing to check — but the size cap is enforced here because the IPC
 * boundary accepts arbitrary text.
 */
export function addTextMaterial(id: unknown, input: TaskTextMaterialInput): TaskMaterialImportResult {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  const text = typeof input?.text === 'string' ? input.text : ''
  if (!text.trim()) return failure('empty_text', 'There is no text to save')
  if (Buffer.byteLength(text, 'utf-8') > MAX_TEXT_MATERIAL_BYTES) {
    return failure('too_large', 'The text is too large to save as a material')
  }

  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (folderMissing(current.directory)) return failure('folder_missing', "The task's folder is missing")
  if (!isOwnedDirectory(current)) {
    return failure('invalid_directory', "The task's folder does not belong to this task")
  }

  const materialsDir = path.join(current.directory, 'materials')
  const usedNames = new Set(current.materials.map(material => path.basename(material.relPath)))
  const fallback = `note-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  const name = sanitizeMaterialName(input?.name, fallback)
  const storedName = uniqueFileName(name, usedNames)
  const dest = path.join(materialsDir, storedName)

  const materialSource: TaskMaterialSource = typeof input?.source === 'string' && MATERIAL_SOURCES.has(input.source as TaskMaterialSource)
    ? input.source as TaskMaterialSource
    : 'unknown'

  try {
    writeTextAtomic(dest, text)
  } catch (err) {
    log.warn(`Could not write text material to ${dest}:`, err)
    return failure('write_failed', 'The material could not be written to disk')
  }

  const stat = fs.statSync(dest)
  const material: TaskMaterial = {
    id: `mat-${randomUUID()}`,
    name,
    relPath: `materials/${storedName}`,
    size: stat.size,
    mimeType: storedName.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain',
    addedAt: Date.now(),
    source: materialSource,
  }
  let next = appendEvent({
    ...current,
    materials: [...current.materials, material],
  }, 'material_added', name)
  const run = parseAutomationRun(input?.automationRun)
  if (run) next = appendEvent(next, 'from_automation', automationRunDetail(run.jobId, run.startedAt))

  replaceTask(store, next)
  if (!writeTaskStore(store)) {
    try { fs.rmSync(dest, { force: true }) } catch { /* best effort */ }
    return failure('write_failed', 'The task could not be saved')
  }
  writeTaskMirror(next)
  return { ok: true, task: taskView(next), added: [material], errors: [] }
}

const EVENT_KINDS = new Set<TaskEventKind>([
  'created', 'material_added', 'material_removed', 'renamed',
  'status_changed', 'moved', 'folder_missing', 'restored',
  'routed', 'reassigned', 'session_started', 'from_automation',
  'imported_folder', 'from_notice',
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
  // `name` is the original display name and is deliberately allowed to differ
  // from the stored file: a same-name copy is stored as `stem (1).ext`. It must
  // still be a single segment, because a path here would make the label lie
  // about what the material is.
  if (name.includes('\0') || /[\\/]/.test(name)) return null

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
    // the only way to recover titles and folder paths by hand. The helper
    // copies once per process — the badge re-reads this file every 30 s.
    preserveCorruptFile(file)
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

/**
 * Count tasks in one status without building views.
 *
 * `taskView` stats each task's folder to report whether it is missing. That is
 * the right answer for a row the user is looking at, but the pet's badge only
 * needs a number and re-reads it on a timer; a few hundred stat calls on the
 * main thread every 30 s would be a stall for nothing.
 */
export function countTasksByStatus(status: TaskStatus): number {
  let count = 0
  for (const task of readTaskStore().tasks) {
    if (task.status === status) count += 1
  }
  return count
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

/**
 * File a task under a department, or clear that filing. Attribution only:
 * the task's `directory` is untouched, and no status changes because a task
 * was routed. `departmentId` is whatever the renderer's org tree calls an id;
 * the store does not import the renderer-owned tree, so an id that no longer
 * exists is kept rather than silently rewritten.
 *
 * `routed` is the first filing, `reassigned` every later change (including
 * clearing). Re-choosing the current department is a no-op, so the history
 * cannot fill with rows that did not change anything.
 */
export function routeTask(id: unknown, departmentId: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  let nextDepartmentId: string | null
  if (departmentId === null || departmentId === undefined) {
    nextDepartmentId = null
  } else {
    nextDepartmentId = nonEmptyString(departmentId)
    if (!nextDepartmentId) return failure('invalid_department', 'Unknown department')
    if (nextDepartmentId.length > 200) return failure('invalid_department', 'Unknown department')
  }

  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (current.departmentId === nextDepartmentId) return { ok: true, task: taskView(current) }

  const kind: TaskEventKind = nextDepartmentId && !current.departmentId ? 'routed' : 'reassigned'
  const next = appendEvent({
    ...current,
    departmentId: nextDepartmentId,
    routedBy: nextDepartmentId ? 'user' : null,
  }, kind, nextDepartmentId ?? undefined)

  replaceTask(store, next)
  if (!writeTaskStore(store)) return failure('write_failed', 'The task could not be saved')
  writeTaskMirror(next)
  return { ok: true, task: taskView(next) }
}

/**
 * Append one provenance event to a task's history.
 *
 * The pet's notice log creates tasks outside the task IPC and needs a durable
 * record of *which notice* a task came from: an in-memory map forgets it on
 * restart, and saving the same notice again would then create a second task.
 * The kind is checked against the same whitelist as every other write, so a
 * caller cannot invent a history claim from an arbitrary string.
 */
export function appendTaskEvent(id: unknown, kind: TaskEventKind, detail?: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  if (!EVENT_KINDS.has(kind)) return failure('invalid_event', 'Unknown task event')
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  const text = typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 500) : undefined
  const next = appendEvent(current, kind, text)
  replaceTask(store, next)
  if (!writeTaskStore(store)) return failure('write_failed', 'The task could not be saved')
  writeTaskMirror(next)
  return { ok: true, task: taskView(next) }
}

/**
 * Record the conversation a completed turn in a task tab actually produced.
 *
 * Called by the renderer only after a *successful* turn, so a failed or stopped
 * attempt never becomes the task's conversation. The renderer may report the
 * same thread twice (a result echo, a reload); the record keeps one row per
 * session id and says success rather than appending a duplicate. The purpose
 * is the renderer's statement of what the turn was for — `dispatch` for the
 * task's first conversation, `followup` for a new one started later on the
 * same task.
 */
export function linkTaskSession(id: unknown, input: TaskSessionLinkInput): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  const sessionId = nonEmptyString(input?.sessionId)
  if (!sessionId) return failure('invalid_session', 'A conversation id is required')
  if (sessionId.length > 200) return failure('invalid_session', 'A conversation id is required')
  const purpose = input?.purpose === 'dispatch' || input?.purpose === 'followup'
    ? input.purpose
    : null
  if (!purpose) return failure('invalid_purpose', 'A conversation purpose is required')
  const personaId = nonEmptyString(input?.personaId)

  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (current.sessions.some(session => session.sessionId === sessionId)) {
    return { ok: true, task: taskView(current) }
  }

  const session: TaskSessionRef = {
    sessionId,
    startedAt: Date.now(),
    purpose,
    ...(personaId ? { personaId } : {}),
  }
  const next = appendEvent({
    ...current,
    sessions: [...current.sessions, session],
  }, 'session_started', purpose)

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
  // Same ownership gate as every other write: a record whose directory points
  // at a folder that is not this task's own copy (a hand-edited store, a
  // corrupted row) must not receive new files.
  if (!isOwnedDirectory(current)) {
    return failure('invalid_directory', "The task's folder does not belong to this task")
  }

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
 * Once a conversation has run, its cwd is recorded in the engine's rollout and
 * the task record points at this folder; moving it would make both wrong, so
 * the store refuses instead of moving the ground under a session. The UI never
 * offered this after increment 2 either.
 */
export function moveTask(id: unknown, targetRoot: unknown): TaskMutation {
  if (typeof id !== 'string' || !id) return failure('invalid_id', 'Unknown task')
  if (typeof targetRoot !== 'string' || !targetRoot.trim()) {
    return failure('invalid_target', 'A destination folder is required')
  }
  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === id)
  if (!current) return failure('not_found', 'Unknown task')
  if (current.sessions.length > 0) {
    return failure('has_sessions', 'The task folder cannot move after its first conversation')
  }
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

interface LegacyScanFile {
  absolute: string
  name: string
  size: number
}

interface LegacyScan {
  files: LegacyScanFile[]
  skipped: number
  truncated: number
  bytes: number
}

/** ENOENT / ENOTDIR mean "gone"; anything else means "we were not allowed to look". */
function legacySourceState(directory: string): 'ok' | 'missing' | 'unreadable' {
  try {
    return fs.statSync(directory).isDirectory() ? 'ok' : 'missing'
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unreadable'
  }
}

/**
 * Walk a folder without ever leaving it: hidden entries are skipped, symlinks
 * are never followed (they are counted as skipped, not recursed into), and both
 * caps are applied before a file is opened. Entries are sorted by name so a
 * retried import produces the same material order and the same stored names.
 */
function scanLegacyFolder(directory: string): LegacyScan {
  const files: LegacyScanFile[] = []
  let skipped = 0
  let truncated = 0
  let bytes = 0

  const walk = (dir: string, isRoot: boolean): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      // A nested folder we cannot read costs its contents, not the import; the
      // root failing means there is nothing to import at all.
      if (isRoot) throw err
      skipped += 1
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        skipped += 1
        continue
      }
      const absolute = path.join(dir, entry.name)
      let stat: fs.Stats
      try {
        stat = fs.lstatSync(absolute)
      } catch {
        skipped += 1
        continue
      }
      if (stat.isSymbolicLink()) {
        skipped += 1
        continue
      }
      if (stat.isDirectory()) {
        walk(absolute, false)
        continue
      }
      if (!stat.isFile()) {
        skipped += 1
        continue
      }
      if (files.length >= MAX_LEGACY_IMPORT_FILES || bytes + stat.size > MAX_LEGACY_IMPORT_BYTES) {
        truncated += 1
        continue
      }
      files.push({ absolute, name: entry.name, size: stat.size })
      bytes += stat.size
    }
  }

  walk(directory, true)
  return { files, skipped, truncated, bytes }
}

function emptyInspection(status: LegacyFolderStatus): LegacyFolderInspection {
  return { status, files: 0, bytes: 0, skipped: 0, truncated: 0 }
}

export function inspectLegacyFolder(directory: unknown): LegacyFolderInspection {
  const raw = typeof directory === 'string' ? directory.trim() : ''
  if (!raw || !path.isAbsolute(raw)) return emptyInspection('missing')
  const source = path.resolve(raw)
  const state = legacySourceState(source)
  if (state !== 'ok') return emptyInspection(state)

  let scan: LegacyScan
  try {
    scan = scanLegacyFolder(source)
  } catch (err) {
    log.warn(`Could not read legacy folder ${source}:`, err)
    return emptyInspection('unreadable')
  }
  if (scan.files.length === 0) {
    return {
      status: scan.truncated > 0 ? 'too_large' : 'empty',
      files: 0,
      bytes: 0,
      skipped: scan.skipped,
      truncated: scan.truncated,
    }
  }
  return {
    status: 'ok',
    files: scan.files.length,
    bytes: scan.bytes,
    skipped: scan.skipped,
    truncated: scan.truncated,
  }
}

function normalizeSourcePath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** A live task that already imported this exact folder, if there is one. */
function findImportedTask(source: string): {
  task: TaskRecord
  counts: LegacyImportCounts & { source: string }
} | null {
  const key = normalizeSourcePath(source)
  const tasks = readTaskStore().tasks.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  for (const task of tasks) {
    // Archived work does not block a fresh import: the user may want the folder
    // back in the active task list.
    if (task.status === 'archived') continue
    for (const event of task.history) {
      if (event.kind !== 'imported_folder') continue
      const parsed = parseLegacyImportDetail(event.detail)
      if (parsed && normalizeSourcePath(parsed.source) === key) return { task, counts: parsed }
    }
  }
  return null
}

/**
 * Undo a half-made import: the copies this call wrote, the folder it created,
 * and the record `createTask` wrote. Best effort on a store that already
 * refused to write, but never leaves copied files behind a failed task.
 */
function discardImportedTask(record: TaskRecord, copiedRelPaths: readonly string[]): void {
  for (const relPath of copiedRelPaths) {
    try { fs.rmSync(path.join(record.directory, relPath), { force: true }) } catch { /* best effort */ }
  }
  try { fs.rmSync(record.directory, { recursive: true, force: true }) } catch { /* best effort */ }
  try {
    const store = readTaskStore()
    const tasks = store.tasks.filter(task => task.id !== record.id)
    if (tasks.length !== store.tasks.length) writeTaskStore({ tasks })
  } catch (err) {
    log.warn(`Could not remove the failed import ${record.id} from tasks.json:`, err)
  }
}

/**
 * Import a legacy department folder as a task.
 *
 * Copy, never move: the source is only ever read, so the user's folder keeps
 * every file, timestamp and attribute. The task is created first by the same
 * `createTask` every other path uses; the materials, department and history
 * rows are then committed in one store write. If that write fails, the copies
 * and the task are removed together — a task that silently asserts "these
 * files are here" when they are not is worse than a failed import.
 *
 * Idempotence: a live task whose history already names this exact source is
 * reopened, so repeated clicks cannot produce duplicate task folders.
 */
export function importLegacyFolder(input: LegacyFolderImportInput): LegacyFolderImportResult {
  const raw = nonEmptyString(input?.directory)
  if (!raw || !path.isAbsolute(raw)) return failure('invalid_directory', 'A legacy folder path is required')
  const source = path.resolve(raw)

  const departmentId = nonEmptyString(input?.departmentId)
  if (!departmentId) return failure('invalid_department', 'A department is required')
  if (departmentId.length > 200) return failure('invalid_department', 'Unknown department')

  const existing = findImportedTask(source)
  if (existing) {
    return {
      ok: true,
      task: taskView(existing.task),
      reused: true,
      filesCopied: existing.counts.files,
      filesSkipped: existing.counts.skipped,
      filesTruncated: existing.counts.truncated,
    }
  }

  const state = legacySourceState(source)
  if (state !== 'ok') {
    return failure(state, state === 'missing' ? 'That folder no longer exists' : 'That folder cannot be read')
  }

  let scan: LegacyScan
  try {
    scan = scanLegacyFolder(source)
  } catch (err) {
    log.warn(`Could not read legacy folder ${source}:`, err)
    return failure('unreadable', 'That folder cannot be read')
  }
  if (scan.files.length === 0) {
    return scan.truncated > 0
      ? failure('too_large', 'The folder is larger than an import can copy')
      : failure('empty', 'That folder has no files to import')
  }

  const title = (path.basename(source).trim() || 'Imported folder').slice(0, 200)
  const created = createTask({ title })
  if (!created.ok) return created

  const materialsDir = path.join(created.task.directory, 'materials')
  const usedNames = new Set<string>()
  const added: TaskMaterial[] = []
  const copiedRelPaths: string[] = []
  let skipped = scan.skipped

  for (const file of scan.files) {
    const storedName = uniqueFileName(file.name, usedNames)
    usedNames.add(storedName)
    const dest = path.join(materialsDir, storedName)
    try {
      fs.copyFileSync(file.absolute, dest)
      const stat = fs.statSync(dest)
      const material: TaskMaterial = {
        id: `mat-${randomUUID()}`,
        name: file.name,
        relPath: `materials/${storedName}`,
        size: stat.size,
        addedAt: Date.now(),
        source: 'import',
        originPath: file.absolute,
      }
      added.push(material)
      copiedRelPaths.push(material.relPath)
    } catch (err) {
      log.warn(`Could not copy ${file.absolute} into ${created.task.directory}:`, err)
      skipped += 1
      try { fs.rmSync(dest, { force: true }) } catch { /* best effort */ }
    }
  }

  if (added.length === 0) {
    discardImportedTask(created.task, copiedRelPaths)
    return failure('unreadable', 'No file in that folder could be copied')
  }

  const store = readTaskStore()
  const current = store.tasks.find(task => task.id === created.task.id)
  if (!current) {
    discardImportedTask(created.task, copiedRelPaths)
    return failure('write_failed', 'The task could not be saved')
  }

  let next: TaskRecord = {
    ...current,
    materials: added,
    departmentId,
    routedBy: 'user',
  }
  next = appendEvent(next, 'routed', departmentId)
  next = appendEvent(next, 'imported_folder', legacyImportDetail(source, {
    files: added.length,
    skipped,
    truncated: scan.truncated,
  }))

  replaceTask(store, next)
  if (!writeTaskStore(store)) {
    discardImportedTask(current, copiedRelPaths)
    return failure('write_failed', 'The task could not be saved')
  }
  writeTaskMirror(next)

  log.info(`Imported ${added.length} file(s) from ${source} as task ${next.id}`)
  return {
    ok: true,
    task: taskView(next),
    reused: false,
    filesCopied: added.length,
    filesSkipped: skipped,
    filesTruncated: scan.truncated,
  }
}
