/**
 * The whole of "export my data" and "restore my data", as one honest document.
 *
 * The first backup format carried electron-store preferences only. By the time
 * scheduled jobs, skills and memory documents had become the app's real
 * content, restoring that file on a new machine still looked like a restore
 * and was not one. Format 2 therefore carries every durable thing the main
 * process owns — except the things that must never leave the machine, and the
 * conversation transcripts, which are too large to put in a JSON file:
 *
 *   - settings and the app-store collections (personas, workflows, notes, …);
 *   - userData/automations.json (jobs, pause, spend caps) and the job trash;
 *   - skill folders and the skill trash, as relative path + text content;
 *   - memory documents under the two memory roots `memory-manager` reads;
 *   - the conversation trash manifest, without any transcript payload.
 *
 * `_meta.contains` says all of that inside the file itself, so a user who opens
 * it in a text editor is told the same truth the Settings panel shows.
 *
 * Restore merges and never clobbers: an id that already exists wins, an existing
 * file or folder wins, and every skip is counted and reported. A backup with no
 * jobs section never empties the user's jobs. A row naming `../../` is refused
 * as a whole entry before anything from that entry is written.
 *
 * Paths and the preference store are injected so the harness can point at a
 * scratch directory; the IPC handlers pass the real ones.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { isPathInside } from '../utils/validate'
import { MAX_AUTOMATION_JOBS } from '../automation/types'
import { normalizeDeptBudgets } from '../automation/dept-budget'
import { normalizeDailyCostLimit } from '../automation/spend-guard'
import {
  normalizeJob,
  readAutomationStore,
  writeAutomationStore,
} from '../automation/job-store'
import {
  mergeTrashedJobEntries,
  readTrashedJobEntries,
} from '../trash/job-trash'
import {
  mergeTrashedSkillEntries,
  readTrashedSkillEntries,
} from '../trash/skill-trash'
import {
  mergeTrashedSessionEntries,
  readTrashedSessionEntries,
} from '../trash/session-trash'

const log = createLogger('backup')

/**
 * Bumped whenever the document gains a section. Version 1 files still import
 * into the sections they have; version 3+ is refused rather than guessed at.
 */
export const BACKUP_FORMAT_VERSION = 2

/**
 * The per-file ceiling. Skill files and memory documents are hand-written
 * Markdown; half a megabyte is far above any real one, and a bigger file is
 * listed in `skippedFiles` instead of being truncated, because a skill missing
 * the middle of its instructions is worse than one that says it is incomplete.
 */
export const MAX_BACKUP_FILE_BYTES = 512 * 1024

/** A folder with more files than this is probably not a hand-written skill. */
export const MAX_FILES_PER_SKILL = 500

/** Guards against a pathological tree; exceeding it is recorded, not ignored. */
const MAX_SKILL_DEPTH = 12

const SETTINGS_KEYS = [
  'model',
  'workingDir',
  'fontSize',
  'fontFamily',
  'skipPermissions',
  'verbose',
  'theme',
  'effortLevel',
  'outputStyle',
  'compactMode',
  'desktopNotifications',
  'resumeLastSession',
  'systemPrompt',
  'promptTemplate',
  'thinkingLevel',
  'maxTurns',
  'maxBudgetUsd',
  'notifySound',
  'preventSleep',
  'displayName',
  'language',
] as const

/** The app-store collections, in the order the report presents them. */
const PREF_ARRAYS = [
  'personas',
  'workflows',
  'notes',
  'memories',
  'textSnippets',
  'quickReplies',
  'customConvTemplates',
  'tagNames',
] as const

export interface BackupRoots {
  /** userData: automations.json and the trash manifests live here. */
  userData: string
  /** The user's home directory: ~/.claude/skills and the memory roots. */
  homeDir: string
  /** The current project directory, for project-scoped skills. May be empty. */
  workingDir: string
}

export function defaultBackupRoots(workingDir: string): BackupRoots {
  return {
    userData: app.getPath('userData'),
    homeDir: os.homedir(),
    workingDir: typeof workingDir === 'string' ? workingDir.trim() : '',
  }
}

export interface BackupPrefs {
  all(): Record<string, unknown>
  read(key: string): unknown
  write(key: string, value: unknown): void
}

export interface BackupSkillFile {
  /** Relative to the skill folder, POSIX separators. */
  path: string
  content: string
}

export interface BackupSkillEntry {
  root: 'personal' | 'project'
  /** The skills root this folder came from (for project skills). */
  rootPath: string
  name: string
  files: BackupSkillFile[]
}

export interface BackupTrashedSkillEntry {
  id: string
  name: string
  originalPath: string
  deletedAt: number
  files: BackupSkillFile[]
}

export interface BackupMemoryFile {
  scope: 'global' | 'project'
  projectHash?: string
  fileName: string
  content: string
}

export type BackupSkipReason =
  | 'oversized'
  | 'binary'
  | 'unreadable'
  | 'symlink'
  | 'too_many_files'
  | 'too_deep'

export interface BackupSkippedFile {
  section: 'skills' | 'skillsTrash' | 'memoryFiles'
  /** The skill name or memory scope that owned the skipped file. */
  owner: string
  path: string
  reason: BackupSkipReason
  bytes?: number
}

export interface BackupCounts {
  settings: number
  personas: number
  workflows: number
  notes: number
  memories: number
  snippets: number
  quickReplies: number
  templates: number
  tagNames: number
  jobs: number
  jobTrash: number
  skills: number
  skillFiles: number
  trashedSkills: number
  trashedSkillFiles: number
  memoryFiles: number
  sessionTrash: number
  skippedFiles: number
}

export interface BackupDocument {
  _meta: {
    version: number
    exportDate: string
    appVersion: string
    counts: BackupCounts
    contains: {
      included: Record<string, string>
      excluded: Record<string, string>
      limits: { maxFileBytes: number; maxFilesPerSkill: number; note: string }
    }
  }
  settings: Record<string, unknown>
  personas: unknown[]
  workflows: unknown[]
  notes: unknown[]
  memories: unknown[]
  textSnippets: unknown[]
  quickReplies: unknown[]
  customConvTemplates: unknown[]
  tagNames: unknown[]
  automations: {
    store: {
      version: number
      pausedAll: boolean
      globalDailyCostLimitUsd?: number
      deptBudgets?: unknown[]
      jobs: unknown[]
    }
    jobTrash: unknown[]
  }
  skills: {
    entries: BackupSkillEntry[]
    trashed: BackupTrashedSkillEntry[]
    skipped: BackupSkippedFile[]
  }
  memoryFiles: {
    entries: BackupMemoryFile[]
    skipped: BackupSkippedFile[]
  }
  /** Manifest rows only. The transcript files are deliberately absent. */
  sessionTrash: {
    entries: unknown[]
    payloadsIncluded: false
  }
}

export interface CollectBackupOptions {
  roots: BackupRoots
  prefs: Record<string, unknown>
  appVersion: string
  now?: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  // Every stored value came from JSON (electron-store), so a round trip is a
  // safe deep copy and keeps the exported document free of live references.
  return JSON.parse(JSON.stringify(value)) as T
}

function readTextFile(
  file: string,
  owner: string,
  section: BackupSkippedFile['section'],
  skipped: BackupSkippedFile[],
): string | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    skipped.push({ section, owner, path: path.basename(file), reason: 'unreadable' })
    return null
  }
  if (!stat.isFile()) {
    skipped.push({ section, owner, path: path.basename(file), reason: 'unreadable' })
    return null
  }
  if (stat.size > MAX_BACKUP_FILE_BYTES) {
    skipped.push({ section, owner, path: path.basename(file), reason: 'oversized', bytes: stat.size })
    return null
  }
  let buffer: Buffer
  try {
    buffer = fs.readFileSync(file)
  } catch {
    skipped.push({ section, owner, path: path.basename(file), reason: 'unreadable' })
    return null
  }
  // A text backup must not silently replace bytes: a skill file with an image
  // pasted into it, or an encoding the app cannot read, is reported instead of
  // exported as mojibake. A NUL byte is the cheap binary signal; the strict
  // decoder catches UTF-16 and other non-UTF-8 encodings.
  if (buffer.includes(0)) {
    skipped.push({ section, owner, path: path.basename(file), reason: 'binary', bytes: stat.size })
    return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    skipped.push({ section, owner, path: path.basename(file), reason: 'binary', bytes: stat.size })
    return null
  }
}

/** Directories under a skills root that the skills store would list. */
function listSkillFolders(root: string): { name: string; dir: string }[] {
  const folders: { name: string; dir: string }[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return folders
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue
    folders.push({ name: entry.name, dir })
  }
  return folders
}

function collectSkillFiles(
  skillDir: string,
  owner: string,
  skipped: BackupSkippedFile[],
  section: BackupSkippedFile['section'],
): BackupSkillFile[] {
  const files: BackupSkillFile[] = []
  let seen = 0

  const walk = (dir: string, relative: string, depth: number): void => {
    if (depth > MAX_SKILL_DEPTH) {
      skipped.push({ section, owner, path: relative || '.', reason: 'too_deep' })
      return
    }
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      skipped.push({ section, owner, path: relative || '.', reason: 'unreadable' })
      return
    }
    for (const entry of entries) {
      const childRel = relative ? `${relative}/${entry.name}` : entry.name
      const childPath = path.join(dir, entry.name)
      // A symlink could leave the skill folder or form a cycle; neither belongs
      // in a portable document, so it is listed and not followed.
      if (entry.isSymbolicLink()) {
        skipped.push({ section, owner, path: childRel, reason: 'symlink' })
        continue
      }
      if (entry.isDirectory()) {
        walk(childPath, childRel, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (seen >= MAX_FILES_PER_SKILL) {
        skipped.push({ section, owner, path: childRel, reason: 'too_many_files' })
        continue
      }
      const content = readTextFile(childPath, owner, section, skipped)
      if (content === null) continue
      seen += 1
      files.push({ path: childRel, content })
    }
  }

  walk(skillDir, '', 0)
  return files
}

function collectSkills(
  roots: BackupRoots,
  skipped: BackupSkippedFile[],
): { entries: BackupSkillEntry[]; trashed: BackupTrashedSkillEntry[] } {
  const entries: BackupSkillEntry[] = []
  const rootsToScan: { root: 'personal' | 'project'; rootPath: string }[] = [
    { root: 'personal', rootPath: path.join(roots.homeDir, '.claude', 'skills') },
  ]
  if (roots.workingDir) {
    const projectRoot = path.join(roots.workingDir, '.claude', 'skills')
    if (path.resolve(projectRoot) !== path.resolve(rootsToScan[0].rootPath)) {
      rootsToScan.push({ root: 'project', rootPath: projectRoot })
    }
  }
  for (const source of rootsToScan) {
    for (const folder of listSkillFolders(source.rootPath)) {
      entries.push({
        root: source.root,
        rootPath: source.rootPath,
        name: folder.name,
        files: collectSkillFiles(folder.dir, folder.name, skipped, 'skills'),
      })
    }
  }

  const trashDir = path.join(roots.userData, 'trash')
  const trashed: BackupTrashedSkillEntry[] = []
  let manifest: ReturnType<typeof readTrashedSkillEntries> = []
  try {
    manifest = readTrashedSkillEntries(trashDir)
  } catch (err) {
    log.warn('Could not read the skill trash manifest for backup:', String(err))
  }
  for (const entry of manifest) {
    const folder = path.resolve(entry.trashedPath)
    if (!isPathInside(path.join(trashDir, 'skills'), folder) || !fs.existsSync(folder)) {
      // The row stays in the manifest the backup does not carry; nothing is
      // invented for a folder that is already gone.
      continue
    }
    trashed.push({
      id: entry.id,
      name: entry.name,
      originalPath: entry.originalPath,
      deletedAt: entry.deletedAt,
      files: collectSkillFiles(folder, entry.name, skipped, 'skillsTrash'),
    })
  }
  return { entries, trashed }
}

function collectMemoryFiles(
  roots: BackupRoots,
  skipped: BackupSkippedFile[],
): BackupMemoryFile[] {
  const entries: BackupMemoryFile[] = []
  const globalDir = path.join(roots.homeDir, '.claude', 'memory')

  const addDirectory = (dir: string, scope: BackupMemoryFile['scope'], hash?: string): void => {
    let names: string[]
    try {
      names = fs.readdirSync(dir).filter(name => name.endsWith('.md'))
    } catch {
      return
    }
    const owner = scope === 'global' ? 'memory' : `memory:${hash ?? ''}`
    for (const fileName of names.sort()) {
      const content = readTextFile(path.join(dir, fileName), owner, 'memoryFiles', skipped)
      if (content === null) continue
      entries.push({
        scope,
        ...(hash ? { projectHash: hash } : {}),
        fileName,
        content,
      })
    }
  }

  addDirectory(globalDir, 'global')

  const projectsDir = path.join(roots.homeDir, '.claude', 'projects')
  let hashes: string[] = []
  try {
    hashes = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.includes('/') && !entry.name.includes('\\') && entry.name !== '.' && entry.name !== '..')
      .map(entry => entry.name)
  } catch {
    hashes = []
  }
  for (const hash of hashes) addDirectory(path.join(projectsDir, hash, 'memory'), 'project', hash)

  return entries
}

export function collectBackup(options: CollectBackupOptions): { document: BackupDocument; counts: BackupCounts } {
  const { roots, prefs, appVersion } = options
  const now = options.now ?? Date.now()
  const skipped: BackupSkippedFile[] = []

  const settings: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) {
    const value = prefs[key]
    if (value !== undefined && value !== null) settings[key] = cloneJson(value)
  }

  const arrays: Record<string, unknown[]> = {}
  for (const key of PREF_ARRAYS) {
    const value = prefs[key]
    arrays[key] = Array.isArray(value) ? cloneJson(value) : []
  }
  const tagNames = arrays.tagNames

  // The store owns the one validator for a job; the backup carries the same
  // normalized records the scheduler would read back.
  const automationFile = path.join(roots.userData, 'automations.json')
  const store = readAutomationStore(automationFile)
  const jobTrash = readTrashedJobEntries(path.join(roots.userData, 'trash'))
  const skills = collectSkills(roots, skipped)
  const memoryFiles = collectMemoryFiles(roots, skipped)
  let sessionTrash: ReturnType<typeof readTrashedSessionEntries> = []
  try {
    sessionTrash = readTrashedSessionEntries(path.join(roots.userData, 'trash'))
  } catch (err) {
    log.warn('Could not read the conversation trash manifest for backup:', String(err))
  }

  const counts: BackupCounts = {
    settings: Object.keys(settings).length,
    personas: arrays.personas.length,
    workflows: arrays.workflows.length,
    notes: arrays.notes.length,
    memories: arrays.memories.length,
    snippets: arrays.textSnippets.length,
    quickReplies: arrays.quickReplies.length,
    templates: arrays.customConvTemplates.length,
    tagNames: tagNames.length,
    jobs: store.jobs.length,
    jobTrash: jobTrash.length,
    skills: skills.entries.length,
    skillFiles: skills.entries.reduce((sum, entry) => sum + entry.files.length, 0),
    trashedSkills: skills.trashed.length,
    trashedSkillFiles: skills.trashed.reduce((sum, entry) => sum + entry.files.length, 0),
    memoryFiles: memoryFiles.length,
    sessionTrash: sessionTrash.length,
    skippedFiles: skipped.length,
  }

  const document: BackupDocument = {
    _meta: {
      version: BACKUP_FORMAT_VERSION,
      exportDate: new Date(now).toISOString(),
      appVersion,
      counts,
      contains: {
        included: {
          settings: 'App settings: model, working directory, fonts, theme, notifications and the other fields listed under settings.',
          personas: 'Personas',
          workflows: 'Workflows',
          notes: 'Notes',
          memories: 'Memories saved in the app store',
          textSnippets: 'Text snippets',
          quickReplies: 'Quick replies',
          customConvTemplates: 'Conversation templates',
          tagNames: 'Tag names',
          scheduledJobs: 'Scheduled jobs, their run history, and the global pause and spend caps',
          jobTrash: 'Recently deleted scheduled jobs (records)',
          skills: 'Skill folders and their files, personal and project',
          skillTrash: 'Recently deleted skill folders and their files',
          memoryFiles: 'Memory documents under ~/.claude/memory and ~/.claude/projects/*/memory',
          sessionTrash: 'Recently deleted conversation records; the transcript files themselves are NOT included',
        },
        excluded: {
          conversations:
            'Conversation transcripts are not in this file. Restoring it does not bring conversations back.',
          sessionTrashPayloads:
            'The files behind the Recently deleted conversation records are not in this file. After a restore those records point at files that do not exist and cannot be opened or restored.',
          apiKeys: 'API keys and provider credentials are never exported.',
          pluginData:
            'Plugin data and plugin credentials (~/.aipa/plugin-data, ~/.claude/plugins.json) are never exported.',
          modelProviders: 'Model provider configurations and their API keys are not exported.',
          machineUi:
            'Window size, sidebar widths and other machine-specific UI state are not exported.',
          memoryIndexes: 'The MEMORY.md index files are not exported; only the memory documents in the memory directories are.',
        },
        limits: {
          maxFileBytes: MAX_BACKUP_FILE_BYTES,
          maxFilesPerSkill: MAX_FILES_PER_SKILL,
          note: 'Files larger than the limit, binary files and unreadable files are skipped and listed under skills.skipped / memoryFiles.skipped. A skill file is never truncated.',
        },
      },
    },
    settings,
    personas: arrays.personas,
    workflows: arrays.workflows,
    notes: arrays.notes,
    memories: arrays.memories,
    textSnippets: arrays.textSnippets,
    quickReplies: arrays.quickReplies,
    customConvTemplates: arrays.customConvTemplates,
    tagNames,
    automations: {
      // Not the raw file: only the fields the scheduler persists, validated
      // against the same whitelist a live store uses.
      store: {
        version: 1,
        pausedAll: store.pausedAll,
        ...(store.globalDailyCostLimitUsd !== undefined
          ? { globalDailyCostLimitUsd: store.globalDailyCostLimitUsd }
          : {}),
        ...(store.deptBudgets && store.deptBudgets.length > 0
          ? { deptBudgets: cloneJson(store.deptBudgets) }
          : {}),
        jobs: cloneJson(store.jobs),
      },
      jobTrash: cloneJson(jobTrash),
    },
    skills: {
      entries: skills.entries,
      trashed: skills.trashed,
      skipped: skipped.filter(item => item.section === 'skills' || item.section === 'skillsTrash'),
    },
    memoryFiles: {
      entries: memoryFiles,
      skipped: skipped.filter(item => item.section === 'memoryFiles'),
    },
    sessionTrash: {
      entries: cloneJson(sessionTrash),
      payloadsIncluded: false,
    },
  }

  return { document, counts }
}

// ── Restore ──────────────────────────────────────────────────────────

export type BackupImportErrorCode =
  | 'invalid_format'
  | 'unsupported_version'
  | 'read_failed'

export type BackupRefusalReason = 'path_traversal' | 'invalid_entry' | 'outside_roots'

export interface BackupRefusal {
  section: 'settings' | 'skills' | 'skillsTrash' | 'memoryFiles' | 'sessionTrash' | 'automations'
  path: string
  reason: BackupRefusalReason
}

export interface BackupImportWarning {
  code:
    | 'older_version'
    | 'no_jobs_section'
    | 'session_payloads_missing'
    | 'skipped_files'
    | 'refused_entries'
    | 'write_failures'
  count?: number
  version?: number
}

export interface BackupImportReport {
  ok: true
  backupVersion: number
  backupDate: string | null
  /** True for a version 1 file: it was made before jobs/skills/memory existed. */
  olderVersion: boolean
  written: Record<string, number>
  skippedExisting: Record<string, number>
  failed: Record<string, number>
  refused: BackupRefusal[]
  warnings: BackupImportWarning[]
  sectionsPresent: {
    automations: boolean
    skills: boolean
    memoryFiles: boolean
    sessionTrash: boolean
  }
}

export interface ImportBackupOptions {
  roots: BackupRoots
  prefs: BackupPrefs
  data: unknown
  now?: number
}

function emptyCounts(): Record<string, number> {
  return {
    settings: 0,
    personas: 0,
    workflows: 0,
    notes: 0,
    memories: 0,
    snippets: 0,
    quickReplies: 0,
    templates: 0,
    tagNames: 0,
    jobs: 0,
    jobTrash: 0,
    skills: 0,
    skillFiles: 0,
    trashedSkills: 0,
    trashedSkillFiles: 0,
    memoryFiles: 0,
    sessionTrash: 0,
  }
}

function isSafeSegment(segment: unknown): segment is string {
  return typeof segment === 'string' &&
    segment.length > 0 &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('/') &&
    !segment.includes('\\') &&
    !segment.includes('\0') &&
    !path.isAbsolute(segment)
}

/** A relative path inside a skill folder; `..`, absolute paths and NUL refuse the entry. */
function isSafeRelative(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || !filePath.trim() || filePath.includes('\0')) return false
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return false
  return normalized.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function isInsideOrEqual(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedRoot === resolvedTarget || isPathInside(resolvedRoot, resolvedTarget)
}

function safeBaseName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 48)
  return cleaned || 'skill'
}

function mergePrefArray(
  key: string,
  incoming: unknown,
  prefs: BackupPrefs,
  written: Record<string, number>,
  skippedExisting: Record<string, number>,
  counterKey: string,
): void {
  if (!Array.isArray(incoming) || incoming.length === 0) return
  const current = prefs.read(key)
  const existing = Array.isArray(current) ? current : []
  const existingIds = new Set(
    existing
      .map(item => (isObject(item) && typeof item.id === 'string' ? item.id : null))
      .filter((id): id is string => !!id),
  )
  const existingStrings = new Set(existing.filter((item): item is string => typeof item === 'string'))
  const additions: unknown[] = []
  let skipped = 0

  for (const item of incoming) {
    if (isObject(item) && typeof item.id === 'string') {
      if (existingIds.has(item.id)) { skipped += 1; continue }
      existingIds.add(item.id)
      additions.push(cloneJson(item))
      continue
    }
    if (typeof item === 'string') {
      // Tag names are plain strings; the same name must not be added twice.
      if (existingStrings.has(item)) { skipped += 1; continue }
      existingStrings.add(item)
      additions.push(item)
      continue
    }
    // An item with no id cannot be matched against anything already here; the
    // old importer appended it, and so does this one.
    additions.push(cloneJson(item))
  }

  if (additions.length > 0) prefs.write(key, [...existing, ...additions])
  written[counterKey] = additions.length
  if (skipped > 0) skippedExisting[counterKey] = skipped
}

function writeSkillFolder(target: string, files: BackupSkillFile[]): void {
  const parent = path.dirname(target)
  fs.mkdirSync(parent, { recursive: true })
  // Build beside the destination and rename once: a failed write must not
  // leave half a skill behind, and a folder that appeared meanwhile makes the
  // rename fail instead of being merged into.
  const staging = fs.mkdtempSync(path.join(parent, '.aipa-restore-'))
  try {
    for (const file of files) {
      const relative = file.path.replace(/\\/g, '/')
      const dest = path.resolve(staging, ...relative.split('/'))
      if (!isPathInside(staging, dest)) throw new Error(`Refusing file path ${file.path}`)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, file.content, 'utf-8')
    }
    fs.renameSync(staging, target)
  } catch (err) {
    try { fs.rmSync(staging, { recursive: true, force: true }) } catch { /* best effort */ }
    throw err
  }
}

function writeFileAtomic(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    fs.writeFileSync(tmp, content, 'utf-8')
    fs.renameSync(tmp, target)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw err
  }
}

function parseSkillFiles(raw: unknown): BackupSkillFile[] | null {
  if (!Array.isArray(raw)) return null
  const files: BackupSkillFile[] = []
  for (const item of raw) {
    if (!isObject(item)) return null
    if (typeof item.path !== 'string' || typeof item.content !== 'string') return null
    if (!isSafeRelative(item.path)) return null
    if (Buffer.byteLength(item.content, 'utf-8') > MAX_BACKUP_FILE_BYTES) return null
    files.push({ path: item.path.replace(/\\/g, '/'), content: item.content })
  }
  return files
}

/** True when any file path would escape its skill folder; used for the refusal reason only. */
function hasUnsafeFilePath(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some(item => isObject(item) && typeof item.path === 'string' && !isSafeRelative(item.path))
}

function resolveProjectSkillsRoot(entry: Record<string, unknown>, roots: BackupRoots): string | null {
  if (typeof entry.rootPath !== 'string' || !entry.rootPath.trim()) return null
  const rootPath = path.resolve(entry.rootPath)
  // The only shape the skills store reads: <something>/.claude/skills.
  if (path.basename(rootPath) !== 'skills' || path.basename(path.dirname(rootPath)) !== '.claude') return null
  const allowed = [
    roots.homeDir,
    path.join(roots.homeDir, '.claude'),
    ...(roots.workingDir ? [roots.workingDir] : []),
  ]
  return allowed.some(root => isInsideOrEqual(root, rootPath)) ? rootPath : null
}

function restoreSkills(
  raw: unknown,
  roots: BackupRoots,
  report: BackupImportReport,
): void {
  // A version 1 file has no skills section at all; an absent section is never
  // a reason to touch the skills the user already has.
  if (!isObject(raw)) return
  const personalRoot = path.join(roots.homeDir, '.claude', 'skills')

  if (Array.isArray(raw.entries)) {
    for (const rawEntry of raw.entries) {
      if (!isObject(rawEntry)) {
        report.refused.push({ section: 'skills', path: '?', reason: 'invalid_entry' })
        continue
      }
      const name = rawEntry.name
      const files = parseSkillFiles(rawEntry.files)
      if (!isSafeSegment(name)) {
        report.refused.push({ section: 'skills', path: typeof name === 'string' ? name : '?', reason: 'path_traversal' })
        continue
      }
      if (!files) {
        report.refused.push({
          section: 'skills',
          path: name,
          reason: hasUnsafeFilePath(rawEntry.files) ? 'path_traversal' : 'invalid_entry',
        })
        continue
      }
      let root: string | null
      if (rawEntry.root === 'personal') {
        root = personalRoot
      } else if (rawEntry.root === 'project') {
        root = resolveProjectSkillsRoot(rawEntry, roots)
        if (!root) {
          report.refused.push({ section: 'skills', path: name, reason: 'outside_roots' })
          continue
        }
      } else {
        report.refused.push({ section: 'skills', path: name, reason: 'invalid_entry' })
        continue
      }

      const target = path.resolve(root, name)
      if (!isPathInside(path.resolve(root), target)) {
        report.refused.push({ section: 'skills', path: name, reason: 'path_traversal' })
        continue
      }
      // Existing wins: a skill folder may have been edited or re-installed here
      // since the backup, and the user is told it was skipped rather than being
      // told the folder was restored.
      if (fs.existsSync(target)) {
        report.skippedExisting.skills += 1
        continue
      }
      try {
        writeSkillFolder(target, files)
        report.written.skills += 1
        report.written.skillFiles += files.length
      } catch (err) {
        log.warn(`Could not restore skill ${name}:`, String(err))
        report.failed.skills += 1
      }
    }
  }

  restoreTrashedSkills(raw, roots, report)
}

function restoreTrashedSkills(raw: Record<string, unknown>, roots: BackupRoots, report: BackupImportReport): void {
  if (!Array.isArray(raw.trashed) || raw.trashed.length === 0) return
  const trashDir = path.join(roots.userData, 'trash')
  const trashSkillsDir = path.join(trashDir, 'skills')
  const personalRoot = path.join(roots.homeDir, '.claude', 'skills')
  const rows: Record<string, unknown>[] = []
  // Written folder + its file count, keyed by the manifest id, so a merge that
  // refuses or skips a row can take that folder back out.
  const pending = new Map<string, { folder: string; files: number }>()

  for (const rawEntry of raw.trashed) {
    if (!isObject(rawEntry)) {
      report.refused.push({ section: 'skillsTrash', path: '?', reason: 'invalid_entry' })
      continue
    }
    const id = rawEntry.id
    const name = rawEntry.name
    const deletedAt = rawEntry.deletedAt
    const files = parseSkillFiles(rawEntry.files)
    if (typeof id !== 'string' || !id.trim() || typeof deletedAt !== 'number' || !Number.isFinite(deletedAt)) {
      report.refused.push({ section: 'skillsTrash', path: typeof name === 'string' ? name : '?', reason: 'invalid_entry' })
      continue
    }
    if (!isSafeSegment(name)) {
      report.refused.push({
        section: 'skillsTrash',
        path: typeof name === 'string' ? name : '?',
        reason: 'path_traversal',
      })
      continue
    }
    if (!files) {
      report.refused.push({
        section: 'skillsTrash',
        path: name,
        reason: hasUnsafeFilePath(rawEntry.files) ? 'path_traversal' : 'invalid_entry',
      })
      continue
    }
    const base = `${deletedAt}-${safeBaseName(name)}`
    if (fs.existsSync(path.join(trashSkillsDir, base))) {
      report.skippedExisting.trashedSkills += 1
      continue
    }
    let folder: string
    try {
      fs.mkdirSync(trashSkillsDir, { recursive: true })
      let candidate = path.join(trashSkillsDir, base)
      let suffix = 2
      while (fs.existsSync(candidate)) {
        candidate = path.join(trashSkillsDir, `${base}-${suffix}`)
        suffix += 1
      }
      folder = candidate
      writeSkillFolder(folder, files)
    } catch (err) {
      log.warn(`Could not restore trashed skill ${name}:`, String(err))
      report.failed.trashedSkills += 1
      continue
    }
    pending.set(id, { folder, files: files.length })
    rows.push({
      id,
      name,
      // The original path from another machine may not exist here; the trash
      // restore puts the folder back under this machine's skills root, so that
      // is the path recorded. `name` is the folder's basename, as on delete.
      originalPath: path.join(personalRoot, name),
      trashedPath: folder,
      deletedAt,
    })
  }

  if (rows.length === 0) return
  try {
    const result = mergeTrashedSkillEntries(rows, trashDir)
    report.written.trashedSkills += result.added
    report.skippedExisting.trashedSkills += result.skipped
    report.failed.trashedSkills += result.invalid
    if (result.invalid > 0) {
      report.refused.push({ section: 'skillsTrash', path: '?', reason: 'invalid_entry' })
    }
    // Rows the merge did not add have a folder but no manifest row, which is
    // exactly the unreachable copy this holding area exists to prevent.
    const added = new Set(
      readTrashedSkillEntries(trashDir).map(entry => path.resolve(entry.trashedPath)),
    )
    for (const item of pending.values()) {
      if (added.has(path.resolve(item.folder))) {
        report.written.trashedSkillFiles += item.files
      } else {
        try { fs.rmSync(item.folder, { recursive: true, force: true }) } catch { /* best effort */ }
      }
    }
  } catch (err) {
    log.warn('Could not write the skill trash manifest during restore:', String(err))
    for (const item of pending.values()) {
      try { fs.rmSync(item.folder, { recursive: true, force: true }) } catch { /* best effort */ }
    }
    report.failed.trashedSkills += rows.length
  }
}

function restoreMemoryFiles(raw: unknown, roots: BackupRoots, report: BackupImportReport): void {
  if (!isObject(raw) || !Array.isArray(raw.entries)) return
  for (const rawEntry of raw.entries) {
    if (!isObject(rawEntry)) {
      report.refused.push({ section: 'memoryFiles', path: '?', reason: 'invalid_entry' })
      continue
    }
    const { scope, projectHash, fileName, content } = rawEntry
    if (scope !== 'global' && scope !== 'project') {
      report.refused.push({ section: 'memoryFiles', path: '?', reason: 'invalid_entry' })
      continue
    }
    if (!isSafeSegment(fileName) || typeof content !== 'string') {
      report.refused.push({
        section: 'memoryFiles',
        path: typeof fileName === 'string' ? fileName : '?',
        reason: isSafeSegment(fileName) ? 'invalid_entry' : 'path_traversal',
      })
      continue
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_BACKUP_FILE_BYTES) {
      report.failed.memoryFiles += 1
      continue
    }
    let dir: string
    if (scope === 'global') {
      dir = path.join(roots.homeDir, '.claude', 'memory')
    } else {
      if (!isSafeSegment(projectHash)) {
        report.refused.push({ section: 'memoryFiles', path: String(fileName), reason: 'path_traversal' })
        continue
      }
      dir = path.join(roots.homeDir, '.claude', 'projects', projectHash, 'memory')
    }
    const target = path.resolve(dir, fileName)
    if (!isPathInside(path.resolve(dir), target)) {
      report.refused.push({ section: 'memoryFiles', path: String(fileName), reason: 'path_traversal' })
      continue
    }
    if (fs.existsSync(target)) {
      report.skippedExisting.memoryFiles += 1
      continue
    }
    try {
      writeFileAtomic(target, content)
      report.written.memoryFiles += 1
    } catch (err) {
      log.warn(`Could not restore memory file ${fileName}:`, String(err))
      report.failed.memoryFiles += 1
    }
  }
}

function restoreAutomations(
  raw: unknown,
  roots: BackupRoots,
  report: BackupImportReport,
): void {
  const file = path.join(roots.userData, 'automations.json')
  if (!isObject(raw)) {
    // No section at all (a version 1 file): the user's jobs stay exactly as
    // they are. This is the case the old importer could not even notice.
    report.warnings.push({ code: 'no_jobs_section' })
    return
  }
  const storeRaw = isObject(raw.store) ? raw.store : {}
  const existingFileExists = fs.existsSync(file)
  const existing = readAutomationStore(file)

  if (Array.isArray(storeRaw.jobs)) {
    const ids = new Set(existing.jobs.map(job => job.id))
    let skipped = 0
    let invalid = 0
    const additions = []
    for (const rawJob of storeRaw.jobs) {
      const job = normalizeJob(rawJob)
      if (!job) { invalid += 1; continue }
      if (ids.has(job.id)) { skipped += 1; continue }
      if (existing.jobs.length + additions.length >= MAX_AUTOMATION_JOBS) {
        report.failed.jobs += 1
        continue
      }
      ids.add(job.id)
      additions.push(job)
    }
    if (skipped > 0) report.skippedExisting.jobs = skipped
    if (invalid > 0) report.refused.push({ section: 'automations', path: 'jobs', reason: 'invalid_entry' })

    if (additions.length > 0 || (!existingFileExists && storeRaw.jobs.length > 0)) {
      // A fresh machine takes the backup's global state; an existing store
      // keeps its own pause and caps, because those belong to this machine's
      // unattended spend, not to the file being restored.
      const pausedAll = existingFileExists ? existing.pausedAll : storeRaw.pausedAll === true
      const globalDailyCostLimitUsd = existingFileExists
        ? existing.globalDailyCostLimitUsd
        : normalizeDailyCostLimit(storeRaw.globalDailyCostLimitUsd)
      const deptBudgets = existingFileExists
        ? existing.deptBudgets
        : normalizeDeptBudgets(storeRaw.deptBudgets)
      try {
        writeAutomationStore({
          jobs: [...existing.jobs, ...additions],
          pausedAll,
          ...(globalDailyCostLimitUsd !== undefined ? { globalDailyCostLimitUsd } : {}),
          ...(deptBudgets && deptBudgets.length > 0 ? { deptBudgets } : {}),
        }, file)
        report.written.jobs += additions.length
      } catch (err) {
        log.warn('Could not write restored jobs:', String(err))
        report.failed.jobs += additions.length
      }
    }
  }

  if (Array.isArray(raw.jobTrash) && raw.jobTrash.length > 0) {
    try {
      const result = mergeTrashedJobEntries(raw.jobTrash, path.join(roots.userData, 'trash'))
      report.written.jobTrash += result.added
      report.skippedExisting.jobTrash += result.skipped
      report.failed.jobTrash += result.invalid
    } catch (err) {
      log.warn('Could not restore the job trash:', String(err))
      report.failed.jobTrash += raw.jobTrash.length
    }
  }
}

function restoreSessionTrash(raw: unknown, roots: BackupRoots, report: BackupImportReport): void {
  if (!isObject(raw) || !Array.isArray(raw.entries) || raw.entries.length === 0) return
  const trashDir = path.join(roots.userData, 'trash')
  const sessionsRoot = path.join(trashDir, 'sessions')
  const rows: Record<string, unknown>[] = []

  for (const rawEntry of raw.entries) {
    if (!isObject(rawEntry) || !Array.isArray(rawEntry.items) || rawEntry.items.length === 0) {
      report.refused.push({ section: 'sessionTrash', path: '?', reason: 'invalid_entry' })
      continue
    }
    // The manifest row is validated once here so the placeholder payload path
    // is never built from a hand-edited id, engine or timestamp.
    if (
      typeof rawEntry.id !== 'string' || !rawEntry.id.trim() ||
      typeof rawEntry.sessionId !== 'string' || !rawEntry.sessionId.trim() ||
      (rawEntry.engine !== 'claude' && rawEntry.engine !== 'codex' && rawEntry.engine !== 'both') ||
      typeof rawEntry.deletedAt !== 'number' || !Number.isFinite(rawEntry.deletedAt)
    ) {
      report.refused.push({ section: 'sessionTrash', path: '?', reason: 'invalid_entry' })
      continue
    }
    const items: Record<string, unknown>[] = []
    let valid = true
    for (let index = 0; index < rawEntry.items.length; index++) {
      const item = rawEntry.items[index]
      if (!isObject(item) || typeof item.originalPath !== 'string' || !item.originalPath.trim()) {
        valid = false
        break
      }
      const base = path.basename(item.originalPath) || 'session'
      // The payload is not in the backup. The row points into this machine's
      // trash folder at a path that does not exist, which is exactly what the
      // UI then says: the record is here, the file is not.
      items.push({
        originalPath: item.originalPath,
        trashedPath: path.join(sessionsRoot, `${rawEntry.deletedAt ?? 'restored'}-missing`, `${index}-${base}`),
      })
    }
    if (!valid) {
      report.refused.push({ section: 'sessionTrash', path: '?', reason: 'invalid_entry' })
      continue
    }
    rows.push({
      id: rawEntry.id,
      sessionId: rawEntry.sessionId,
      engine: rawEntry.engine,
      items,
      deletedAt: rawEntry.deletedAt,
      ...(typeof rawEntry.title === 'string' && rawEntry.title.trim() ? { title: rawEntry.title } : {}),
    })
  }

  if (rows.length === 0) return
  try {
    const result = mergeTrashedSessionEntries(rows, trashDir)
    report.written.sessionTrash += result.added
    report.skippedExisting.sessionTrash += result.skipped
    report.failed.sessionTrash += result.invalid
    if (result.added > 0) {
      report.warnings.push({ code: 'session_payloads_missing', count: result.added })
    }
  } catch (err) {
    log.warn('Could not restore the conversation trash manifest:', String(err))
    report.failed.sessionTrash += rows.length
  }
}

export type ImportBackupOutcome =
  | { ok: true; report: BackupImportReport }
  | { ok: false; code: BackupImportErrorCode }

export function importBackup(options: ImportBackupOptions): ImportBackupOutcome {
  const data = options.data
  if (!isObject(data) || !isObject(data._meta)) return { ok: false, code: 'invalid_format' }
  const version = data._meta.version
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) {
    return { ok: false, code: 'invalid_format' }
  }
  // A newer file may mean fields this build would silently drop. Refuse rather
  // than perform half a restore.
  if (version > BACKUP_FORMAT_VERSION) return { ok: false, code: 'unsupported_version' }

  const report: BackupImportReport = {
    ok: true,
    backupVersion: version,
    backupDate: typeof data._meta.exportDate === 'string' ? data._meta.exportDate : null,
    olderVersion: version < BACKUP_FORMAT_VERSION,
    written: emptyCounts(),
    skippedExisting: emptyCounts(),
    failed: emptyCounts(),
    refused: [],
    warnings: [],
    sectionsPresent: {
      automations: isObject(data.automations),
      skills: isObject(data.skills),
      memoryFiles: isObject(data.memoryFiles),
      sessionTrash: isObject(data.sessionTrash),
    },
  }

  const prefs = options.prefs
  if (isObject(data.settings)) {
    let applied = 0
    for (const key of SETTINGS_KEYS) {
      const value = data.settings[key]
      // The allowlist is the security boundary: a hand-edited file cannot set
      // apiKey/apiKeyEncrypted/modelProviders or any other unlisted pref.
      if (value === undefined || value === null) continue
      prefs.write(key, cloneJson(value))
      applied += 1
    }
    report.written.settings = applied
  }

  mergePrefArray('personas', data.personas, prefs, report.written, report.skippedExisting, 'personas')
  mergePrefArray('workflows', data.workflows, prefs, report.written, report.skippedExisting, 'workflows')
  mergePrefArray('notes', data.notes, prefs, report.written, report.skippedExisting, 'notes')
  mergePrefArray('memories', data.memories, prefs, report.written, report.skippedExisting, 'memories')
  mergePrefArray('textSnippets', data.textSnippets, prefs, report.written, report.skippedExisting, 'snippets')
  mergePrefArray('quickReplies', data.quickReplies, prefs, report.written, report.skippedExisting, 'quickReplies')
  mergePrefArray('customConvTemplates', data.customConvTemplates, prefs, report.written, report.skippedExisting, 'templates')
  mergePrefArray('tagNames', data.tagNames, prefs, report.written, report.skippedExisting, 'tagNames')

  restoreAutomations(data.automations, options.roots, report)
  restoreSkills(data.skills, options.roots, report)
  restoreMemoryFiles(data.memoryFiles, options.roots, report)
  restoreSessionTrash(data.sessionTrash, options.roots, report)

  if (report.olderVersion) {
    report.warnings.push({ code: 'older_version', version })
  }
  // A version 1 file was made before any of these sections existed. Saying so
  // is the point: the user must not read "restored" as "jobs and skills came
  // back".
  const skippedFileCount = countBackupSkippedFiles(data)
  if (skippedFileCount > 0) report.warnings.push({ code: 'skipped_files', count: skippedFileCount })
  if (report.refused.length > 0) report.warnings.push({ code: 'refused_entries', count: report.refused.length })
  const failedTotal = Object.values(report.failed).reduce((sum, value) => sum + value, 0)
  if (failedTotal > 0) report.warnings.push({ code: 'write_failures', count: failedTotal })

  return { ok: true, report }
}

function countBackupSkippedFiles(data: Record<string, unknown>): number {
  let total = 0
  if (isObject(data.skills) && Array.isArray(data.skills.skipped)) total += data.skills.skipped.length
  if (isObject(data.memoryFiles) && Array.isArray(data.memoryFiles.skipped)) total += data.memoryFiles.skipped.length
  return total
}

/** The settings the export is allowed to carry, for the handler's fixed map. */
export const BACKUP_SETTINGS_KEYS = SETTINGS_KEYS
