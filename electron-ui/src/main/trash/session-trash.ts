/**
 * A holding area for deleted conversations.
 *
 * Deleting a conversation used to unlink the transcript (Claude) or the
 * transcript and its per-thread folder (Codex) on the spot. A conversation is
 * not one file: the same session id can have a transcript under several Claude
 * project slugs, and Codex may keep a folder beside the rollout — so the old
 * delete could also leave a half-deleted conversation behind without saying so.
 *
 * Every file that belonged to the session is therefore moved here as one entry,
 * all of it or none of it, and stays restorable for the window below. The entry
 * lives under userData rather than beside the transcripts: `session:list` scans
 * the real session roots, so a holding area inside them would list deleted
 * conversations as live ones.
 *
 * Restore never overwrites. The user may have created something at the
 * transcript's old path in the meantime, and clobbering that would destroy the
 * very kind of work this area exists to protect.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { isPathInside, isValidSessionId } from '../utils/validate'
import { movePath } from './path-move'
import {
  claudeProjectsDir,
  findSessionFiles,
  forgetSessionCache as forgetClaudeSessionCache,
} from '../sessions/session-reader'
import {
  codexSessionRoots,
  findSessionPaths,
  forgetSessionCache as forgetCodexSessionCache,
} from '../codex/codex-session-reader'

const log = createLogger('session-trash')

/**
 * How long a deleted conversation can be restored. Exported so the UI states
 * the same number instead of inventing one; `session:trash:list` sends it along
 * for the section's copy.
 */
export const SESSION_TRASH_RETENTION_DAYS = 30
export const SESSION_TRASH_RETENTION_MS = SESSION_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

const MANIFEST_VERSION = 1

/** One moved file or folder in the holding area. */
export interface TrashedSessionItem {
  originalPath: string
  trashedPath: string
}

export interface TrashedSessionEntry {
  id: string
  sessionId: string
  /** Display text from the renderer. Absent when the caller had none; never invented. */
  title?: string
  engine: 'claude' | 'codex' | 'both'
  items: TrashedSessionItem[]
  deletedAt: number
}

export interface TrashedSessionListEntry extends TrashedSessionEntry {
  /** False once any payload is gone from disk; restore is then impossible. */
  available: boolean
  /** When the entry leaves for good (epoch ms). */
  purgeAt: number
}

export type SessionTrashErrorCode =
  | 'not_found'
  | 'invalid_session'
  | 'outside_sessions'
  | 'outside_trash'
  | 'folder_missing'
  | 'target_exists'
  | 'move_failed'
  | 'write_failed'
  | 'delete_failed'

export type SessionTrashFailure = { ok: false; code: SessionTrashErrorCode; error: string }
export type SessionTrashSuccess<T> = { ok: true } & T

/**
 * Where a conversation may live. Passed in (rather than read from the readers
 * on every call) so the module has one definition of "inside the sessions
 * folders" and so its harness can point at temp directories.
 */
export interface SessionRoots {
  /** `~/.claude/projects` — one folder per working directory. */
  claude: string
  /** Codex's `sessions` and `archived_sessions` roots. */
  codex: string[]
}

export function defaultSessionRoots(): SessionRoots {
  return { claude: claudeProjectsDir(), codex: codexSessionRoots() }
}

export interface MoveSessionOptions {
  /** Optional display text from the renderer. */
  title?: string
  now?: number
  roots?: SessionRoots
  /**
   * Harness seam: lets a test fail the Nth move and prove the rollback. The
   * IPC handlers never pass it, so the app always moves through `movePath`.
   */
  move?: (from: string, to: string) => void
}

export interface RestoreSessionOptions {
  now?: number
  roots?: SessionRoots
}

function trashRoot(override?: string): string {
  return override ?? path.join(app.getPath('userData'), 'trash')
}

function trashSessionsDir(override?: string): string {
  return path.join(trashRoot(override), 'sessions')
}

function manifestPath(override?: string): string {
  return path.join(trashRoot(override), 'sessions.json')
}

function failure(code: SessionTrashErrorCode, error: string): SessionTrashFailure {
  return { ok: false, code, error }
}

function isAllowedOriginal(target: string, roots: SessionRoots): boolean {
  if (isPathInside(roots.claude, target)) return true
  return roots.codex.some(root => isPathInside(root, target))
}

/**
 * One row survives on its own. A hand-edited or half-written manifest must not
 * hide the other trashed conversations behind a single corrupt line — and a
 * row missing a path or an item is not one we can restore, so it is dropped.
 */
function normalizeEntry(raw: unknown): TrashedSessionEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : ''
  const sessionId = typeof entry.sessionId === 'string' && entry.sessionId.trim()
    ? entry.sessionId.trim()
    : ''
  const engine = entry.engine === 'claude' || entry.engine === 'codex' || entry.engine === 'both'
    ? entry.engine
    : null
  const deletedAt = typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt)
    ? entry.deletedAt
    : null
  if (!id || !sessionId || !engine || deletedAt === null) return null
  if (!Array.isArray(entry.items)) return null

  const items: TrashedSessionItem[] = []
  for (const rawItem of entry.items) {
    if (!rawItem || typeof rawItem !== 'object') return null
    const item = rawItem as Record<string, unknown>
    const originalPath = typeof item.originalPath === 'string' && item.originalPath.trim()
      ? item.originalPath
      : ''
    const trashedPath = typeof item.trashedPath === 'string' && item.trashedPath.trim()
      ? item.trashedPath
      : ''
    if (!originalPath || !trashedPath) return null
    items.push({ originalPath, trashedPath })
  }
  if (items.length === 0) return null

  const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined
  return { id, sessionId, engine, items, deletedAt, ...(title ? { title } : {}) }
}

function readManifest(trashDir?: string): TrashedSessionEntry[] {
  const file = manifestPath(trashDir)
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
    // Accept both the wrapped shape and a bare array written by hand; either
    // way every row is validated on its own.
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).entries)
        ? (parsed as Record<string, unknown>).entries as unknown[]
        : []
    const entries = list
      .map(normalizeEntry)
      .filter((entry): entry is TrashedSessionEntry => entry !== null)
    if (entries.length !== list.length) {
      log.warn(`session trash: dropped ${list.length - entries.length} malformed manifest row(s)`)
    }
    return entries
  } catch (err) {
    // Keep the corrupt file on disk for inspection; the next save rewrites it.
    log.warn('Could not read session trash manifest:', err)
    return []
  }
}

function writeManifest(entries: TrashedSessionEntry[], trashDir?: string): void {
  const file = manifestPath(trashDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({
    version: MANIFEST_VERSION,
    entries,
  }, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

function uniquePayloadDir(now: number, base: string): string {
  const root = trashSessionsDir()
  fs.mkdirSync(root, { recursive: true })
  // The base name is for a human poking at the folder; two conversations can
  // share one (both are `<sessionId>.jsonl` only when the ids collide, but a
  // delete can be repeated within the same millisecond in a test).
  const safeBase = base.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 48) || 'session'
  let candidate = path.join(root, `${now}-${safeBase}`)
  let suffix = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${now}-${safeBase}-${suffix}`)
    suffix += 1
  }
  return candidate
}

function uniqueId(entries: TrashedSessionEntry[], now: number): string {
  const taken = new Set(entries.map(entry => entry.id))
  let id = ''
  do {
    id = `trash-${now}-${Math.random().toString(36).slice(2, 8)}`
  } while (taken.has(id))
  return id
}

/**
 * Every path that belongs to the session, from both engines, newest discovery
 * order preserved but nested paths collapsed: a Codex thread folder contains
 * its own rollout file, and moving the folder already carries the file.
 */
function gatherSessionPaths(sessionId: string, roots: SessionRoots): string[] {
  const all = [
    ...findSessionFiles(sessionId, roots.claude),
    ...findSessionPaths(sessionId, roots.codex),
  ].map(found => path.resolve(found))

  const deduped: string[] = []
  for (const candidate of all) {
    // A path that sits inside another gathered path travels with it.
    if (all.some(other => other !== candidate && isPathInside(other, candidate))) continue
    if (deduped.includes(candidate)) continue
    deduped.push(candidate)
  }
  return deduped
}

/**
 * Move already-moved items back onto their original paths, last moved first.
 * Best effort and logged: a rollback that itself fails must not hide the
 * original refusal.
 */
function rollbackMoves(items: TrashedSessionItem[]): void {
  for (const item of [...items].reverse()) {
    try {
      fs.mkdirSync(path.dirname(item.originalPath), { recursive: true })
      movePath(item.trashedPath, item.originalPath)
    } catch (err) {
      log.error('Could not move a conversation back after a failed delete:', err)
    }
  }
}

/**
 * Move every file of one conversation into the trash and record the entry.
 *
 * All-or-nothing: if any move fails, the ones already moved go back and the
 * result is a failure code. A half-deleted conversation — transcript moved,
 * thread folder left behind — is worse than a refused delete, because the
 * sidebar would still show a row that loads nothing.
 */
export function moveSessionToTrash(
  sessionId: string,
  options: MoveSessionOptions = {},
): SessionTrashSuccess<{ entry: TrashedSessionEntry }> | SessionTrashFailure {
  const now = options.now ?? Date.now()
  const roots = options.roots ?? defaultSessionRoots()
  const move = options.move ?? movePath

  // Without this a "../.." id would resolve outside the session roots.
  if (!isValidSessionId(sessionId)) {
    return failure('invalid_session', 'That is not a valid conversation id')
  }

  let paths: string[]
  try {
    paths = gatherSessionPaths(sessionId, roots)
  } catch (err) {
    log.warn('Could not scan for the conversation:', err)
    return failure('move_failed', String(err))
  }
  if (paths.length === 0) {
    return failure('not_found', 'No conversation with that id is on disk')
  }
  // The readers only return contained paths, but this is the line the trash
  // relies on: never move something a reader might one day return by accident.
  for (const found of paths) {
    if (!isAllowedOriginal(found, roots)) {
      return failure('outside_sessions', `Refusing to move ${found}: outside the session folders`)
    }
  }

  const fromClaude = paths.some(found => isPathInside(roots.claude, found))
  const fromCodex = paths.some(found => roots.codex.some(root => isPathInside(root, found)))
  const engine: TrashedSessionEntry['engine'] = fromClaude && fromCodex
    ? 'both'
    : fromClaude ? 'claude' : 'codex'

  let payloadDir: string
  try {
    payloadDir = uniquePayloadDir(now, path.basename(paths[0]))
    fs.mkdirSync(payloadDir, { recursive: true })
  } catch (err) {
    log.warn('Could not create a trash folder for the conversation:', err)
    return failure('move_failed', String(err))
  }

  const moved: TrashedSessionItem[] = []
  for (let index = 0; index < paths.length; index++) {
    const originalPath = paths[index]
    // Keep the file/folder name so the trash is readable by hand; the index
    // prefix keeps two items with the same base name (from different project
    // slugs) apart.
    const trashedPath = path.join(payloadDir, `${index}-${path.basename(originalPath)}`)
    try {
      move(originalPath, trashedPath)
      moved.push({ originalPath, trashedPath })
    } catch (err) {
      log.warn('Could not move part of the conversation to the trash:', err)
      rollbackMoves(moved)
      try {
        fs.rmSync(payloadDir, { recursive: true, force: true })
      } catch { /* the emptied folder is harmless */ }
      return failure('move_failed', String(err))
    }
  }

  const entries = readManifest()
  const trimmedTitle = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim().slice(0, 200)
    : undefined
  const entry: TrashedSessionEntry = {
    id: uniqueId(entries, now),
    sessionId,
    engine,
    items: moved,
    deletedAt: now,
    ...(trimmedTitle ? { title: trimmedTitle } : {}),
  }
  try {
    writeManifest([...entries, entry])
  } catch (err) {
    // The manifest is what makes a trashed conversation restorable. If it
    // cannot be written, put everything back rather than leave copies the
    // user has no way to recover through the UI.
    log.warn('Could not write session trash manifest:', err)
    rollbackMoves(moved)
    try {
      fs.rmSync(payloadDir, { recursive: true, force: true })
    } catch { /* best effort */ }
    return failure('write_failed', 'The conversation could not be recorded in the trash; it was left in place')
  }

  return { ok: true, entry }
}

/**
 * Read the manifest for the backup export.
 *
 * The backup stores these rows without the payload files, so the restored rows
 * will point at paths that do not exist. That is a fact the restore reports
 * rather than hides; `listTrashedSessions` will mark each one unavailable.
 */
export function readTrashedSessionEntries(trashDir?: string): TrashedSessionEntry[] {
  return readManifest(trashDir)
}

/**
 * Merge rows from a backup into the conversation trash manifest.
 *
 * An existing id wins. The incoming rows are validated by the same per-row
 * validator the delete path uses, so a hand-edited backup cannot make the trash
 * point at arbitrary paths.
 */
export function mergeTrashedSessionEntries(
  incoming: unknown,
  trashDir?: string,
): { added: number; skipped: number; invalid: number } {
  if (!Array.isArray(incoming)) return { added: 0, skipped: 0, invalid: 0 }
  const entries = readManifest(trashDir)
  const existing = new Set(entries.map(entry => entry.id))
  const added: TrashedSessionEntry[] = []
  let skipped = 0
  let invalid = 0
  for (const raw of incoming) {
    const entry = normalizeEntry(raw)
    if (!entry) { invalid += 1; continue }
    if (existing.has(entry.id)) { skipped += 1; continue }
    existing.add(entry.id)
    added.push(entry)
  }
  if (added.length > 0) writeManifest([...entries, ...added], trashDir)
  return { added: added.length, skipped, invalid }
}

/**
 * The trash contents, newest first, with the instant each leaves for good.
 * A row is available only while every payload is still inside the trash folder
 * and on disk — restoring anything else is not something this area can do.
 */
export function listTrashedSessions(_now: number = Date.now()): SessionTrashSuccess<{
  entries: TrashedSessionListEntry[]
  retentionDays: number
}> {
  const root = trashSessionsDir()
  const entries = readManifest()
    .map(entry => ({
      ...entry,
      available: entry.items.every(item => {
        const trashedPath = path.resolve(item.trashedPath)
        return isPathInside(root, trashedPath) && fs.existsSync(trashedPath)
      }),
      purgeAt: entry.deletedAt + SESSION_TRASH_RETENTION_MS,
    }))
    .sort((a, b) => b.deletedAt - a.deletedAt)
  return { ok: true, entries, retentionDays: SESSION_TRASH_RETENTION_DAYS }
}

/** Forget the readers' derived rows for the paths that just came back. */
function forgetCachesFor(filePath: string, roots: SessionRoots): void {
  if (isPathInside(roots.claude, filePath)) forgetClaudeSessionCache(filePath)
  if (roots.codex.some(root => isPathInside(root, filePath))) forgetCodexSessionCache(filePath)
}

/**
 * Move every file of a trashed conversation back where it came from.
 *
 * All-or-nothing: every original path is checked before anything moves, so a
 * refusal leaves both sides untouched rather than restoring half a
 * conversation over something that now occupies the other half's place.
 */
export function restoreTrashedSession(
  id: string,
  options: RestoreSessionOptions = {},
): SessionTrashSuccess<{ entry: TrashedSessionEntry }> | SessionTrashFailure {
  const roots = options.roots ?? defaultSessionRoots()
  const entries = readManifest()
  const entry = entries.find(item => item.id === id)
  if (!entry) return failure('not_found', 'This item is no longer in Recently deleted')

  const trashDir = trashSessionsDir()
  // Resolve every recorded path once, so the check that proved containment is
  // the same string the move uses.
  const items = entry.items.map(item => ({
    originalPath: path.resolve(item.originalPath),
    trashedPath: path.resolve(item.trashedPath),
  }))

  // The manifest is user-editable state; never move anything to a path outside
  // the session roots or from outside the trash because a tampered row asked.
  for (const item of items) {
    if (!isAllowedOriginal(item.originalPath, roots)) {
      return failure('outside_sessions', 'The recorded location is outside the session folders')
    }
    if (!isPathInside(trashDir, item.trashedPath)) {
      return failure('outside_trash', 'The recorded trash location is invalid')
    }
  }
  for (const item of items) {
    if (!fs.existsSync(item.trashedPath)) {
      return failure('folder_missing', 'A deleted part of this conversation is no longer on disk')
    }
  }
  for (const item of items) {
    if (fs.existsSync(item.originalPath)) {
      return failure('target_exists', `Something already exists at ${item.originalPath}`)
    }
  }

  const restored: TrashedSessionItem[] = []
  for (const item of items) {
    try {
      fs.mkdirSync(path.dirname(item.originalPath), { recursive: true })
      movePath(item.trashedPath, item.originalPath)
      restored.push(item)
    } catch (err) {
      log.warn('Could not restore part of the conversation from the trash:', err)
      rollbackMoves(restored)
      return failure('move_failed', String(err))
    }
  }

  for (const item of entry.items) forgetCachesFor(path.resolve(item.originalPath), roots)
  removePayloadDirIfEmpty(entry)

  try {
    writeManifest(entries.filter(item => item.id !== id))
  } catch (err) {
    // The files are already back where the user can see them. A stale row would
    // later read as "gone"; say nothing scary about the restore itself, but
    // log the manifest problem.
    log.warn('Conversation restored but the trash manifest could not be updated:', err)
  }

  return { ok: true, entry }
}

/** Remove the entry's payload folder once nothing is left in it. */
function removePayloadDirIfEmpty(entry: TrashedSessionEntry): void {
  const first = entry.items[0]
  if (!first) return
  const payloadDir = path.dirname(path.resolve(first.trashedPath))
  if (!isPathInside(trashSessionsDir(), payloadDir)) return
  try {
    if (fs.readdirSync(payloadDir).length === 0) fs.rmdirSync(payloadDir)
  } catch { /* a leftover empty folder is harmless */ }
}

/**
 * Delete entries whose retention window has passed. One entry that cannot be
 * removed is kept for a later pass and does not abort the rest.
 */
export function purgeTrashedSessions(now: number = Date.now()): SessionTrashSuccess<{
  removed: number
  failed: number
}> {
  const entries = readManifest()
  const trashDir = trashSessionsDir()
  const kept: TrashedSessionEntry[] = []
  let removed = 0
  let failed = 0

  for (const entry of entries) {
    // Exactly at the window is not yet "older than" it, so it stays for one
    // more pass; only an entry past the window leaves.
    if (entry.deletedAt + SESSION_TRASH_RETENTION_MS >= now) {
      kept.push(entry)
      continue
    }
    // Never delete outside the trash folder, even if a row was tampered with.
    // One bad item keeps the whole entry: part of the conversation is still in
    // the trash and its row is the only way to find it.
    if (!entry.items.every(item => isPathInside(trashDir, item.trashedPath))) {
      kept.push(entry)
      failed += 1
      continue
    }
    try {
      for (const item of entry.items) {
        const trashedPath = path.resolve(item.trashedPath)
        if (fs.existsSync(trashedPath)) {
          fs.rmSync(trashedPath, { recursive: true, force: true })
        }
      }
      removePayloadDirIfEmpty(entry)
      // A payload that was already gone still counts as removed: the entry is
      // expired and has nothing left to restore.
      removed += 1
    } catch (err) {
      log.warn('Could not purge trashed conversation:', err)
      kept.push(entry)
      failed += 1
    }
  }

  try {
    writeManifest(kept)
  } catch (err) {
    log.warn('Could not write session trash manifest after purge:', err)
  }

  return { ok: true, removed, failed }
}

/** Remove one entry (and its payloads) for good. */
export function removeTrashedSession(id: string): SessionTrashSuccess<{
  entry: TrashedSessionEntry
}> | SessionTrashFailure {
  const entries = readManifest()
  const entry = entries.find(item => item.id === id)
  if (!entry) return failure('not_found', 'This item is no longer in Recently deleted')

  const trashDir = trashSessionsDir()
  // Check every item before removing any of them, so a tampered row cannot get
  // half its entry deleted and half left behind.
  if (!entry.items.every(item => isPathInside(trashDir, item.trashedPath))) {
    return failure('outside_trash', 'The recorded trash location is invalid')
  }

  try {
    for (const item of entry.items) {
      const trashedPath = path.resolve(item.trashedPath)
      if (fs.existsSync(trashedPath)) {
        fs.rmSync(trashedPath, { recursive: true, force: true })
      }
    }
    removePayloadDirIfEmpty(entry)
  } catch (err) {
    log.warn('Could not remove trashed conversation:', err)
    return failure('delete_failed', String(err))
  }

  try {
    writeManifest(entries.filter(item => item.id !== id))
  } catch (err) {
    log.warn('Could not write session trash manifest after removal:', err)
    return failure('write_failed', 'The item was removed but its trash record could not be updated')
  }

  return { ok: true, entry }
}
