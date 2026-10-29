/**
 * A holding area for deleted skills.
 *
 * Deleting a skill used to `rm -rf` a hand-written folder with no confirmation
 * and no way back — one misclick destroyed something the user may have spent a
 * week writing. A deleted skill is therefore moved here instead of being
 * erased, and stays restorable for the retention window below.
 *
 * The folders live under userData rather than beside the skills themselves:
 * `skills:list` scans those directories, so a holding area inside
 * `~/.claude/skills` would show deleted skills as installed ones.
 *
 * A trashed skill is a real folder on disk. It can be restored only while that
 * folder still exists — the user may have removed it from a file manager, or a
 * purge may already have run — and restoring never overwrites a folder that
 * has since appeared at the original path.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { isPathInside } from '../utils/validate'

const log = createLogger('skill-trash')

/**
 * How long a deleted skill can be restored. Exported so the UI can state the
 * same number instead of inventing one of its own; `skills:trash:list` also
 * sends it to the renderer for the section's copy.
 */
export const SKILL_TRASH_RETENTION_DAYS = 30
export const SKILL_TRASH_RETENTION_MS = SKILL_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

const MANIFEST_VERSION = 1

export interface TrashedSkillEntry {
  id: string
  name: string
  originalPath: string
  trashedPath: string
  deletedAt: number
}

export interface TrashedSkillListEntry extends TrashedSkillEntry {
  /** Whether the folder is still on disk; restore is impossible without it. */
  available: boolean
  /** When the entry leaves for good (epoch ms). */
  purgeAt: number
}

export type SkillTrashErrorCode =
  | 'not_found'
  | 'outside_skills'
  | 'outside_trash'
  | 'skill_missing'
  | 'folder_missing'
  | 'original_exists'
  | 'move_failed'
  | 'write_failed'
  | 'delete_failed'

export type SkillTrashFailure = { ok: false; code: SkillTrashErrorCode; error: string }
export type SkillTrashSuccess<T> = { ok: true } & T

/** The personal skills root the delete handler has always allowed. */
export function personalSkillsRoot(): string {
  return path.join(os.homedir(), '.claude', 'skills')
}

function trashRoot(): string {
  return path.join(app.getPath('userData'), 'trash')
}

function trashSkillsDir(): string {
  return path.join(trashRoot(), 'skills')
}

function manifestPath(): string {
  return path.join(trashRoot(), 'skills.json')
}

/**
 * One row survives on its own. A hand-edited or half-written manifest must not
 * hide the other trashed skills behind a single corrupt line.
 */
function normalizeEntry(raw: unknown): TrashedSkillEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : ''
  const originalPath = typeof entry.originalPath === 'string' && entry.originalPath.trim()
    ? entry.originalPath
    : ''
  const trashedPath = typeof entry.trashedPath === 'string' && entry.trashedPath.trim()
    ? entry.trashedPath
    : ''
  const deletedAt = typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt)
    ? entry.deletedAt
    : null
  if (!id || !originalPath || !trashedPath || deletedAt === null) return null
  const name = typeof entry.name === 'string' && entry.name.trim()
    ? entry.name.trim()
    : path.basename(originalPath)
  return { id, name, originalPath, trashedPath, deletedAt }
}

function readManifest(): TrashedSkillEntry[] {
  const file = manifestPath()
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
    // Accept both the wrapped shape and a bare array written by an older build
    // or by hand; either way each row is validated individually.
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).entries)
        ? (parsed as Record<string, unknown>).entries as unknown[]
        : []
    const entries = list
      .map(normalizeEntry)
      .filter((entry): entry is TrashedSkillEntry => entry !== null)
    if (entries.length !== list.length) {
      log.warn(`skill trash: dropped ${list.length - entries.length} malformed manifest row(s)`)
    }
    return entries
  } catch (err) {
    // Keep the corrupt file on disk for inspection; the next save rewrites it.
    log.warn('Could not read skill trash manifest:', err)
    return []
  }
}

function writeManifest(entries: TrashedSkillEntry[]): void {
  const file = manifestPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({
    version: MANIFEST_VERSION,
    entries,
  }, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

/**
 * Move a directory, falling back to copy+delete across volumes: the trash lives
 * under userData, which can be on a different drive than the user's home folder,
 * and `rename` fails with EXDEV in that case.
 *
 * If the delete half of the fallback fails, the copy is removed again — leaving
 * two visible copies of the same skill would be worse than reporting failure.
 */
function moveDirectory(from: string, to: string): void {
  try {
    fs.renameSync(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    fs.cpSync(from, to, { recursive: true })
    try {
      fs.rmSync(from, { recursive: true, force: true })
    } catch (rmErr) {
      try {
        fs.rmSync(to, { recursive: true, force: true })
      } catch { /* best effort: the original is still intact */ }
      throw rmErr
    }
  }
}

function uniqueTrashPath(now: number, base: string): string {
  fs.mkdirSync(trashSkillsDir(), { recursive: true })
  let candidate = path.join(trashSkillsDir(), `${now}-${base}`)
  let suffix = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(trashSkillsDir(), `${now}-${base}-${suffix}`)
    suffix += 1
  }
  return candidate
}

function uniqueId(entries: TrashedSkillEntry[], now: number): string {
  const taken = new Set(entries.map(entry => entry.id))
  let id = ''
  do {
    id = `trash-${now}-${Math.random().toString(36).slice(2, 8)}`
  } while (taken.has(id))
  return id
}

function failure(code: SkillTrashErrorCode, error: string): SkillTrashFailure {
  return { ok: false, code, error }
}

/**
 * Move a skill folder into the trash and record it.
 *
 * `skillsRoot` is a seam for the harness only: it lets the test move folders in
 * a temp directory instead of the user's real `~/.claude/skills`. The IPC
 * handlers never pass it, so the installed app always uses the default root.
 */
export function moveSkillToTrash(
  dirPath: string,
  now: number = Date.now(),
  skillsRoot: string = personalSkillsRoot(),
): SkillTrashSuccess<{ entry: TrashedSkillEntry }> | SkillTrashFailure {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    return failure('outside_skills', 'No skill folder was given')
  }
  const root = path.resolve(skillsRoot)
  const resolved = path.resolve(dirPath)
  // Same rule the delete handler used: a child of the personal skills root,
  // never the root itself and never a sibling with a shared prefix.
  if (!isPathInside(root, resolved)) {
    return failure('outside_skills', 'Can only delete personal skills')
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(resolved)
  } catch {
    return failure('skill_missing', 'The skill folder no longer exists')
  }
  if (!stat.isDirectory()) {
    return failure('skill_missing', 'The skill is not a folder')
  }

  const base = path.basename(resolved)
  let trashedPath: string
  try {
    trashedPath = uniqueTrashPath(now, base)
    moveDirectory(resolved, trashedPath)
  } catch (err) {
    log.warn('Could not move skill to trash:', err)
    return failure('move_failed', String(err))
  }

  const entries = readManifest()
  const entry: TrashedSkillEntry = {
    id: uniqueId(entries, now),
    name: base,
    originalPath: resolved,
    trashedPath,
    deletedAt: now,
  }
  try {
    writeManifest([...entries, entry])
  } catch (err) {
    // The manifest is what makes a trashed folder restorable. If it cannot be
    // written, put the skill back rather than leaving an invisible copy the
    // user has no way to recover through the UI.
    try {
      moveDirectory(trashedPath, resolved)
    } catch (restoreErr) {
      log.error('Skill moved to trash but the manifest failed and the move back failed:', restoreErr)
    }
    log.warn('Could not write skill trash manifest:', err)
    return failure('write_failed', 'The skill could not be recorded in the trash; it was left in place')
  }

  return { ok: true, entry }
}

/**
 * The trash contents, newest first, with the instant each leaves for good.
 * The clock parameter is accepted so every entry point takes the same shape;
 * each row's purge instant comes from its own `deletedAt`, not from "now".
 */
export function listTrashedSkills(_now: number = Date.now()): SkillTrashSuccess<{
  entries: TrashedSkillListEntry[]
  retentionDays: number
}> {
  const entries = readManifest()
    .map(entry => ({
      ...entry,
      available: fs.existsSync(entry.trashedPath),
      purgeAt: entry.deletedAt + SKILL_TRASH_RETENTION_MS,
    }))
    .sort((a, b) => b.deletedAt - a.deletedAt)
  return { ok: true, entries, retentionDays: SKILL_TRASH_RETENTION_DAYS }
}

/**
 * Move a trashed folder back where it came from.
 *
 * Refuses with a named reason instead of overwriting: the original path may
 * now hold a folder the user made (or re-installed) after the delete, and
 * clobbering it would destroy the very kind of work this holding area exists
 * to protect.
 */
export function restoreTrashedSkill(
  id: string,
  _now: number = Date.now(),
  skillsRoot: string = personalSkillsRoot(),
): SkillTrashSuccess<{ entry: TrashedSkillEntry }> | SkillTrashFailure {
  const entries = readManifest()
  const entry = entries.find(item => item.id === id)
  if (!entry) return failure('not_found', 'This item is no longer in Recently deleted')

  const root = path.resolve(skillsRoot)
  const originalPath = path.resolve(entry.originalPath)
  // The manifest is user-editable state; never move a folder to a path outside
  // the skills root because a tampered row asked for it.
  if (!isPathInside(root, originalPath)) {
    return failure('outside_skills', 'The recorded location is outside the skills folder')
  }
  const trashedPath = path.resolve(entry.trashedPath)
  if (!isPathInside(trashSkillsDir(), trashedPath)) {
    return failure('outside_trash', 'The recorded trash location is invalid')
  }
  // A trashed skill is a real folder; without it there is nothing to restore.
  if (!fs.existsSync(trashedPath)) {
    return failure('folder_missing', 'The deleted skill folder is no longer on disk')
  }
  if (fs.existsSync(originalPath)) {
    return failure('original_exists', `A folder already exists at ${originalPath}`)
  }

  try {
    fs.mkdirSync(path.dirname(originalPath), { recursive: true })
    moveDirectory(trashedPath, originalPath)
  } catch (err) {
    log.warn('Could not restore skill from trash:', err)
    return failure('move_failed', String(err))
  }

  try {
    writeManifest(entries.filter(item => item.id !== id))
  } catch (err) {
    // The folder is already back where the user can see it. A stale manifest
    // row would later read as "folder gone"; say nothing scary about the
    // restore itself, but log the manifest problem.
    log.warn('Skill restored but the trash manifest could not be updated:', err)
  }

  return { ok: true, entry }
}

/**
 * Delete entries whose retention window has passed. One failing folder must
 * not abort the rest, so failures are counted and their entries kept for a
 * later purge.
 */
export function purgeTrashedSkills(now: number = Date.now()): SkillTrashSuccess<{
  removed: number
  failed: number
}> {
  const entries = readManifest()
  const kept: TrashedSkillEntry[] = []
  let removed = 0
  let failed = 0

  for (const entry of entries) {
    // Exactly at the window is not yet "older than" it, so it stays for one
    // more pass; only an entry past the window leaves.
    if (entry.deletedAt + SKILL_TRASH_RETENTION_MS >= now) {
      kept.push(entry)
      continue
    }
    const trashedPath = path.resolve(entry.trashedPath)
    // Never delete outside the trash folder, even if a row was tampered with.
    if (!isPathInside(trashSkillsDir(), trashedPath)) {
      kept.push(entry)
      failed += 1
      continue
    }
    try {
      if (fs.existsSync(trashedPath)) {
        fs.rmSync(trashedPath, { recursive: true, force: true })
      }
      // A folder that was already gone still counts as removed: the entry is
      // expired and has nothing left to restore.
      removed += 1
    } catch (err) {
      log.warn('Could not purge trashed skill:', err)
      kept.push(entry)
      failed += 1
    }
  }

  try {
    writeManifest(kept)
  } catch (err) {
    log.warn('Could not write skill trash manifest after purge:', err)
  }

  return { ok: true, removed, failed }
}

/** Remove one entry (and its folder) for good. */
export function removeTrashedSkill(id: string): SkillTrashSuccess<{ entry: TrashedSkillEntry }> | SkillTrashFailure {
  const entries = readManifest()
  const entry = entries.find(item => item.id === id)
  if (!entry) return failure('not_found', 'This item is no longer in Recently deleted')

  const trashedPath = path.resolve(entry.trashedPath)
  if (!isPathInside(trashSkillsDir(), trashedPath)) {
    return failure('outside_trash', 'The recorded trash location is invalid')
  }

  try {
    if (fs.existsSync(trashedPath)) {
      fs.rmSync(trashedPath, { recursive: true, force: true })
    }
  } catch (err) {
    log.warn('Could not remove trashed skill:', err)
    return failure('delete_failed', String(err))
  }

  try {
    writeManifest(entries.filter(item => item.id !== id))
  } catch (err) {
    log.warn('Could not write skill trash manifest after removal:', err)
    return failure('write_failed', 'The item was removed but its trash record could not be updated')
  }

  return { ok: true, entry }
}
