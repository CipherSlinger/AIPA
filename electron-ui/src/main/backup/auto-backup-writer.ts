/**
 * The disk half of automatic backups: write one, list them, prune only what we
 * can prove we wrote, and read one back for a merge restore.
 *
 * The document itself is not built here. `buildBackupDocument` (backup-data.ts)
 * is the one builder the manual Export button uses, and it is injected into
 * every automatic run, so a scheduled backup and a hand-made one can never
 * drift apart in shape.
 *
 * No Electron import: `userDataDir` is passed in. The harness points it at a
 * scratch folder.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { isPathInside } from '../utils/validate'
import {
  backupFileNameWithSerial,
  isBackupFileName,
  isSinglePathSegment,
  isBackupDue,
  normalizeAutoBackupPolicy,
  parseBackupFileName,
  planRetention,
  type AutoBackupPolicy,
  type BackupDueReason,
  type RetentionCandidate,
} from './auto-backup'

const log = createLogger('auto-backup')

export const AUTO_BACKUP_DIR_NAME = 'backups'
export const AUTO_BACKUP_STATE_FILE = 'auto-backup-state.json'

export function backupsDir(userDataDir: string): string {
  return path.join(userDataDir, AUTO_BACKUP_DIR_NAME)
}

export function autoBackupStatePath(userDataDir: string): string {
  return path.join(userDataDir, AUTO_BACKUP_STATE_FILE)
}

export type AutoBackupErrorCode = 'collect_failed' | 'write_failed'

export interface AutoBackupLastResult {
  ok: boolean
  at: number
  fileName?: string
  sizeBytes?: number
  pruned: number
  leftAlone: number
  pruneFailures: number
  error?: AutoBackupErrorCode
}

export interface AutoBackupState {
  policy: AutoBackupPolicy
  /** When the last automatic or manual attempt ran — the one-per-window gate. */
  lastAttemptAt: number | null
  /** When a backup was last written successfully. */
  lastSuccessAt: number | null
  lastResult: AutoBackupLastResult | null
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function emptyAutoBackupState(): AutoBackupState {
  return {
    policy: normalizeAutoBackupPolicy(undefined),
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastResult: null,
  }
}

/**
 * Read the state file, tolerating a missing file, a hand-edited one and the
 * older shape where the policy fields sat at the top level. A state file can
 * never make the app throw on startup.
 */
export function readAutoBackupState(userDataDir: string): AutoBackupState {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(autoBackupStatePath(userDataDir), 'utf-8'))
  } catch {
    return emptyAutoBackupState()
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyAutoBackupState()
  const value = raw as Record<string, unknown>
  const policySource = value.policy && typeof value.policy === 'object' && !Array.isArray(value.policy)
    ? value.policy
    : value

  let lastResult: AutoBackupLastResult | null = null
  if (value.lastResult && typeof value.lastResult === 'object' && !Array.isArray(value.lastResult)) {
    const result = value.lastResult as Record<string, unknown>
    const error = result.error === 'collect_failed' || result.error === 'write_failed'
      ? result.error
      : undefined
    lastResult = {
      ok: result.ok === true,
      at: finiteOrNull(result.at) ?? 0,
      // A name that no longer parses is not shown as if it were a backup file.
      ...(typeof result.fileName === 'string' && isBackupFileName(result.fileName)
        ? { fileName: result.fileName }
        : {}),
      ...(typeof result.sizeBytes === 'number' && Number.isFinite(result.sizeBytes) && result.sizeBytes >= 0
        ? { sizeBytes: result.sizeBytes }
        : {}),
      pruned: nonNegativeInt(result.pruned),
      leftAlone: nonNegativeInt(result.leftAlone),
      pruneFailures: nonNegativeInt(result.pruneFailures),
      ...(error ? { error } : {}),
    }
  }

  return {
    policy: normalizeAutoBackupPolicy(policySource),
    lastAttemptAt: finiteOrNull(value.lastAttemptAt),
    lastSuccessAt: finiteOrNull(value.lastSuccessAt),
    lastResult,
  }
}

/** Atomic: a crash mid-write must not leave half a state file behind. */
export function writeAutoBackupState(userDataDir: string, state: AutoBackupState): void {
  const target = autoBackupStatePath(userDataDir)
  const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    fs.renameSync(tmp, target)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw err
  }
}

/** Persist a policy change and return the normalized result the UI should show. */
export function setAutoBackupPolicy(userDataDir: string, patch: unknown): AutoBackupPolicy {
  const state = readAutoBackupState(userDataDir)
  const merged = patch && typeof patch === 'object' && !Array.isArray(patch)
    ? { ...state.policy, ...(patch as RememberedPolicyPatch) }
    : state.policy
  const policy = normalizeAutoBackupPolicy(merged)
  writeAutoBackupState(userDataDir, { ...state, policy })
  return policy
}

interface RememberedPolicyPatch {
  enabled?: unknown
  interval?: unknown
  retention?: unknown
}

// ── Listing ──────────────────────────────────────────────────────────

export interface BackupFileInfo {
  name: string
  sizeBytes: number
  /** The local timestamp encoded in the name. */
  createdAt: number
}

export interface BackupDirListing {
  dir: string
  backups: BackupFileInfo[]
  /** Files in the folder AIPA did not create; never deleted. */
  foreignCount: number
}

interface ScannedEntry extends RetentionCandidate {
  sizeBytes: number
  createdAt: number
  serial: number
}

/**
 * Every top-level entry in the backups folder, classified.
 *
 * A symlink or a directory that happens to carry a backup name is *not* a
 * backup file: `Dirent.isFile()` must be true before the name alone can prove
 * ownership.
 */
function scanBackupDir(dir: string): ScannedEntry[] {
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const entries: ScannedEntry[] = []
  for (const dirent of dirents) {
    const isFile = dirent.isFile()
    const parsed = isFile ? parseBackupFileName(dirent.name) : null
    let sizeBytes = 0
    if (parsed) {
      try {
        sizeBytes = fs.statSync(path.join(dir, dirent.name)).size
      } catch {
        // It was listed a moment ago; if it vanished, treat it as unreadable.
        continue
      }
    }
    entries.push({
      name: dirent.name,
      isFile: parsed !== null,
      sizeBytes,
      createdAt: parsed?.at ?? 0,
      serial: parsed?.serial ?? 0,
    })
  }
  return entries
}

export function listBackupFiles(userDataDir: string): BackupDirListing {
  const dir = backupsDir(userDataDir)
  const entries = scanBackupDir(dir)
  const backups: BackupFileInfo[] = []
  let foreignCount = 0
  for (const entry of entries) {
    if (!entry.isFile) {
      foreignCount += 1
      continue
    }
    backups.push({
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      createdAt: entry.createdAt,
    })
  }
  backups.sort((a, b) => b.createdAt - a.createdAt)
  return { dir, backups, foreignCount }
}

/**
 * The absolute path of one listed backup, or null.
 *
 * Two independent gates: the name must be one AIPA writes (so `..`, separators
 * and absolute paths are gone before any join), and the resolved path must be
 * inside the backups folder. The stat must say "regular file".
 */
export function resolveBackupFile(userDataDir: string, name: string): string | null {
  const located = locateOwnedFile(userDataDir, name)
  return 'file' in located ? located.file : null
}

export type ReadBackupOutcome =
  | { ok: true; file: string; data: unknown }
  | { ok: false; error: 'not_ours' | 'not_found' | 'read_failed' }

/**
 * The resolved path of a name that is ours, distinguishing "never ours" from
 * "was ours and is gone now" — a row in an open panel can outlive its file.
 */
function locateOwnedFile(userDataDir: string, name: string): { file: string } | { error: 'not_ours' | 'not_found' } {
  if (!isSinglePathSegment(name) || !isBackupFileName(name)) return { error: 'not_ours' }
  const dir = backupsDir(userDataDir)
  const file = path.resolve(dir, name)
  if (!isPathInside(dir, file)) return { error: 'not_ours' }
  try {
    return fs.statSync(file).isFile() ? { file } : { error: 'not_ours' }
  } catch {
    return { error: 'not_found' }
  }
}

/** Read one backup for a merge restore. Only a listed name can be read. */
export function readBackupFile(userDataDir: string, name: string): ReadBackupOutcome {
  const located = locateOwnedFile(userDataDir, name)
  if ('error' in located) return { ok: false, error: located.error }
  try {
    return { ok: true, file: located.file, data: JSON.parse(fs.readFileSync(located.file, 'utf-8')) }
  } catch (err) {
    log.warn(`Could not read backup ${name}:`, String(err))
    return { ok: false, error: 'read_failed' }
  }
}

export type DeleteBackupOutcome =
  | { ok: true; name: string }
  | { ok: false; error: 'not_ours' | 'not_found' | 'delete_failed' }

/** Delete exactly one listed backup. Never a path, never a wildcard. */
export function deleteBackupFile(userDataDir: string, name: string): DeleteBackupOutcome {
  const located = locateOwnedFile(userDataDir, name)
  if ('error' in located) return { ok: false, error: located.error }
  try {
    fs.unlinkSync(located.file)
    return { ok: true, name }
  } catch (err) {
    log.warn(`Could not delete backup ${name}:`, String(err))
    return { ok: false, error: 'delete_failed' }
  }
}

// ── Running ──────────────────────────────────────────────────────────

/** What the injected builder must return — the manual export's document. */
export interface BackupBuildResult {
  json: string
  sizeBytes?: number
}

export interface RunAutoBackupOptions {
  userDataDir: string
  /** `() => buildBackupDocument(...)` — the same builder the Export button uses. */
  build: () => BackupBuildResult
  /** The instant the run is considered to happen at. Defaults to the real clock. */
  now?: number
  /** Skip the window gate. Used by "Back up now" and by the harness. */
  force?: boolean
}

export interface AutoBackupRunResult {
  ok: boolean
  skipped?: boolean
  /** Present when `skipped`: why the window gate said no. */
  reason?: BackupDueReason
  fileName?: string
  sizeBytes?: number
  createdAt?: number
  pruned: number
  leftAlone: number
  pruneFailures: number
  error?: AutoBackupErrorCode
}

function chooseFileName(dir: string, now: number): string {
  for (let serial = 1; serial <= 999; serial += 1) {
    const candidate = backupFileNameWithSerial(now, serial)
    if (!fs.existsSync(path.join(dir, candidate))) return candidate
  }
  throw new Error('No free backup file name for this minute')
}

function writeFileAtomic(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = path.join(
    path.dirname(target),
    `.aipa-backup-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  )
  try {
    fs.writeFileSync(tmp, content, 'utf-8')
    fs.renameSync(tmp, target)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw err
  }
}

function recordFailure(
  userDataDir: string,
  state: AutoBackupState,
  now: number,
  error: AutoBackupErrorCode,
): AutoBackupRunResult {
  const lastResult: AutoBackupLastResult = {
    ok: false,
    at: now,
    pruned: 0,
    leftAlone: 0,
    pruneFailures: 0,
    error,
  }
  try {
    // lastSuccessAt deliberately keeps the older date: the panel must not read
    // a failed attempt as "your last backup is today".
    writeAutoBackupState(userDataDir, { ...state, lastAttemptAt: now, lastResult })
  } catch (err) {
    log.warn('Could not record the failed automatic backup:', String(err))
  }
  return { ok: false, error, pruned: 0, leftAlone: 0, pruneFailures: 0 }
}

/**
 * One backup attempt.
 *
 * A skipped run writes nothing at all — not even a stamp — because the stamp
 * from the earlier attempt is what makes it a skip. Every failed attempt is
 * recorded in the state file, so the Settings panel can say what went wrong
 * instead of the failure disappearing into the console.
 */
export function runAutoBackup(options: RunAutoBackupOptions): AutoBackupRunResult {
  const { userDataDir, build } = options
  const now = typeof options.now === 'number' ? options.now : Date.now()
  const state = readAutoBackupState(userDataDir)

  if (!options.force) {
    const due = isBackupDue({ now, lastAttemptAt: state.lastAttemptAt, policy: state.policy })
    if (!due.due) {
      return {
        ok: true,
        skipped: true,
        reason: due.reason,
        pruned: 0,
        leftAlone: 0,
        pruneFailures: 0,
      }
    }
  }

  const dir = backupsDir(userDataDir)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    log.warn('Could not create the backups folder:', String(err))
    return recordFailure(userDataDir, state, now, 'write_failed')
  }

  let built: BackupBuildResult
  try {
    built = build()
    if (!built || typeof built.json !== 'string') throw new Error('builder returned no document')
  } catch (err) {
    // collectBackup reads skills, memory documents and the automation store;
    // a broken one is reported, never written as an empty "backup".
    log.warn('Could not build the automatic backup:', String(err))
    return recordFailure(userDataDir, state, now, 'collect_failed')
  }

  const sizeBytes = typeof built.sizeBytes === 'number' && Number.isFinite(built.sizeBytes)
    ? built.sizeBytes
    : Buffer.byteLength(built.json, 'utf-8')

  let fileName: string
  try {
    fileName = chooseFileName(dir, now)
    const target = path.resolve(dir, fileName)
    if (!isPathInside(dir, target)) throw new Error(`Refusing backup path ${target}`)
    writeFileAtomic(target, built.json)
  } catch (err) {
    log.warn('Could not write the automatic backup:', String(err))
    return recordFailure(userDataDir, state, now, 'write_failed')
  }

  // Retention runs after the new file is on disk and counts it: "keep 7" means
  // seven files including the one just written.
  const entries = scanBackupDir(dir)
  const plan = planRetention(entries.map(entry => ({ name: entry.name, isFile: entry.isFile })), state.policy.retention)
  let pruned = 0
  let pruneFailures = 0
  for (const name of plan.prune) {
    const file = path.resolve(dir, name)
    if (!isPathInside(dir, file)) {
      pruneFailures += 1
      continue
    }
    try {
      fs.unlinkSync(file)
      pruned += 1
    } catch (err) {
      pruneFailures += 1
      log.warn(`Could not prune ${name}:`, String(err))
    }
  }

  const createdAt = parseBackupFileName(fileName)?.at ?? now
  const lastResult: AutoBackupLastResult = {
    ok: true,
    at: now,
    fileName,
    sizeBytes,
    pruned,
    leftAlone: plan.foreign.length,
    pruneFailures,
  }
  try {
    writeAutoBackupState(userDataDir, {
      ...state,
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastResult,
    })
  } catch (err) {
    // The backup is safely on disk; only the next-window gate is unlucky. The
    // file wins over the bookkeeping — say so in the log, do not fail the run.
    log.warn('Could not persist the auto-backup stamp:', String(err))
  }

  return {
    ok: true,
    fileName,
    sizeBytes,
    createdAt,
    pruned,
    leftAlone: plan.foreign.length,
    pruneFailures,
  }
}
