// The desktop pet's notification history.
//
// Attention bubbles are transient by design: once the user dismisses one, the
// fact that it ever appeared is gone. That is fine for an approval (the
// request itself is retracted when answered), but not for everything the pet
// says — a scheduled run that finished while the user was away, a boot
// greeting, a context warning. This store is the pet's own memory of what it
// announced, kept beside the other main-process JSON stores rather than in
// renderer prefs because the pet and the attention queue both write it from
// main.
//
// The rules are deliberately boring:
//   - newest first, hard cap 50, no unbounded growth from a chatty night;
//   - a repeated identical notice within a few seconds refreshes one record
//     instead of stacking (the attention queue already coalesces its own
//     kinds; this catches the transient notices that go around it);
//   - records start unread and gain a `readAt` when the notice centre shows
//     them, so the pet menu can carry an unread badge without a second store;
//   - a corrupt file fails open to an empty history and is left on disk for
//     inspection — losing the pet's memory must never stop the pet.
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './utils/logger'

const log = createLogger('clawd-notifications')

const STORE_VERSION = 1
export const MAX_CLAWD_NOTICES = 50
const MAX_TEXT = 600
const DEDUPE_WINDOW_MS = 3_000

/** One thing the pet announced. `kind` mirrors the bubble kind vocabulary. */
export interface ClawdNoticeRecord {
  id: string
  kind: string
  title: string
  message: string
  detail?: string
  /** Epoch ms when it was shown. */
  at: number
  /**
   * Epoch ms when the notice centre first showed it. Absent means unread; the
   * field is only ever added, never cleared, so "read" survives a refresh of a
   * deduped notice and cannot flicker back to unread.
   */
  readAt?: number
  /** Openable AIPA session id, when the notice is about a conversation. */
  sessionId?: string
  /** Plugin that owns the job, for plugin notices. */
  pluginId?: string
  /** Action id the user chose, when they chose one. */
  action?: string
}

interface StoreShape {
  version: number
  notices: ClawdNoticeRecord[]
}

/**
 * Where the history lives, or null when Electron cannot answer yet (the
 * harnesses that load this module with a stub `app`, or a path failure).
 * A missing store must never break the bubble that was about to be shown.
 */
function storePath(): string | null {
  try {
    return path.join(app.getPath('userData'), 'clawd-notifications.json')
  } catch {
    return null
  }
}

function cleanText(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optionalText(value: unknown, max = MAX_TEXT): string | undefined {
  const text = cleanText(value, max)
  return text ? text : undefined
}

function normalizeRecord(value: unknown): ClawdNoticeRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = cleanText(raw.id, 80)
  const title = cleanText(raw.title, 200)
  if (!id || !title) return null
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0
  if (at <= 0) return null
  // Only a positive timestamp counts. Anything else (a hand-edited file, an
  // older version) leaves the notice unread, which is the safe default.
  const readAt = typeof raw.readAt === 'number' && Number.isFinite(raw.readAt) && raw.readAt > 0
    ? raw.readAt
    : undefined
  const detail = optionalText(raw.detail)
  const sessionId = optionalText(raw.sessionId, 200)
  const pluginId = optionalText(raw.pluginId, 200)
  const action = optionalText(raw.action, 40)
  return {
    id,
    kind: cleanText(raw.kind, 40) || 'system',
    title,
    message: cleanText(raw.message),
    at,
    ...(readAt ? { readAt } : {}),
    ...(detail ? { detail } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(pluginId ? { pluginId } : {}),
    ...(action ? { action } : {}),
  }
}

function readStore(file: string): StoreShape {
  if (!fs.existsSync(file)) return { version: STORE_VERSION, notices: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const list = Array.isArray(parsed.notices) ? parsed.notices : []
    return {
      version: STORE_VERSION,
      notices: list
        .map(normalizeRecord)
        .filter((record): record is ClawdNoticeRecord => record !== null)
        .slice(0, MAX_CLAWD_NOTICES),
    }
  } catch (err) {
    log.warn('Could not read clawd-notifications.json:', err)
    return { version: STORE_VERSION, notices: [] }
  }
}

function writeStore(store: StoreShape, file: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(
      tmp,
      JSON.stringify({ version: STORE_VERSION, notices: store.notices.slice(0, MAX_CLAWD_NOTICES) }, null, 2),
      'utf-8',
    )
    fs.renameSync(tmp, file)
  } catch (err) {
    log.warn('Could not write clawd-notifications.json:', err)
  }
}

export interface ClawdNoticeInput {
  kind?: string
  title: string
  message?: string
  detail?: string
  sessionId?: string | null
  pluginId?: string | null
  at?: number
}

/**
 * Append one notice, newest first. An identical notice that is still the most
 * recent one and younger than the dedupe window refreshes its timestamp.
 * Returns the stored record (or null when the input has no usable title).
 */
export function recordClawdNotice(input: ClawdNoticeInput): ClawdNoticeRecord | null {
  const title = cleanText(input?.title, 200)
  if (!title) return null
  const at = typeof input.at === 'number' && Number.isFinite(input.at) ? input.at : Date.now()
  const kind = cleanText(input.kind, 40) || 'system'
  const message = cleanText(input.message)

  const file = storePath()
  if (!file) return null
  const store = readStore(file)
  const newest = store.notices[0]
  if (
    newest &&
    newest.kind === kind &&
    newest.title === title &&
    newest.message === message &&
    at - newest.at <= DEDUPE_WINDOW_MS
  ) {
    newest.at = at
    writeStore(store, file)
    return newest
  }

  const detail = optionalText(input.detail)
  const sessionId = optionalText(input.sessionId, 200)
  const pluginId = optionalText(input.pluginId, 200)
  const record: ClawdNoticeRecord = {
    id: `notice-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title,
    message,
    at,
    ...(detail ? { detail } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(pluginId ? { pluginId } : {}),
  }
  store.notices = [record, ...store.notices].slice(0, MAX_CLAWD_NOTICES)
  writeStore(store, file)
  return record
}

/** Newest-first history. Always a fresh array; callers may not mutate the store. */
export function listClawdNotices(file?: string): ClawdNoticeRecord[] {
  const target = file ?? storePath()
  return target ? readStore(target).notices : []
}

/**
 * Mark notices read. With no argument every unread record is marked; with an
 * id list only those records are touched. Already-read records keep their
 * original timestamp, so opening the centre twice does not rewrite the file or
 * make the "read" moment move. Fail-open: a missing store is a no-op.
 */
export function markClawdNoticesRead(ids?: string[]): void {
  const file = storePath()
  if (!file) return
  // An explicit empty list is "mark nothing", not "mark everything" — the
  // distinction matters for an 'open' action that arrives without an id.
  const wanted = Array.isArray(ids) ? new Set(ids.map(id => cleanText(id, 80)).filter(Boolean)) : null
  if (wanted && wanted.size === 0) return

  const store = readStore(file)
  const now = Date.now()
  let changed = false
  for (const notice of store.notices) {
    if (notice.readAt) continue
    if (wanted && !wanted.has(notice.id)) continue
    notice.readAt = now
    changed = true
  }
  if (changed) writeStore(store, file)
}

/** How many records the user has not opened yet. */
export function getUnreadClawdNoticeCount(): number {
  const file = storePath()
  if (!file) return 0
  return readStore(file).notices.reduce((count, notice) => count + (notice.readAt ? 0 : 1), 0)
}

/**
 * Forget one record by id. Used by the notice centre's per-row dismiss control,
 * which removes a row rather than merely marking it read. Returns false when
 * the id is unknown so the caller can skip a redundant repaint.
 */
export function removeClawdNotice(id: string): boolean {
  const target = cleanText(id, 80)
  if (!target) return false
  const file = storePath()
  if (!file) return false
  const store = readStore(file)
  const notices = store.notices.filter(notice => notice.id !== target)
  if (notices.length === store.notices.length) return false
  writeStore({ version: STORE_VERSION, notices }, file)
  return true
}

/** Remove every record. The file is rewritten empty rather than deleted so a
 *  concurrent reader never sees a half-written or missing store. */
export function clearClawdNotices(file?: string): void {
  const target = file ?? storePath()
  if (!target) return
  writeStore({ version: STORE_VERSION, notices: [] }, target)
}
