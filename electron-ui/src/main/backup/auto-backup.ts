/**
 * The policy half of automatic backups — and nothing else.
 *
 * No Electron, no filesystem, no clock read at import time: every function
 * takes the instant it should reason about. That is what lets the harness walk
 * a fake calendar (ten restarts in one day, a week boundary, a clock set back)
 * and prove the rules without touching the user's machine.
 *
 * The rules, in one place:
 *   - a backup file is named `aipa-backup-<local YYYY-MM-DD-HHmm>.json`. A
 *     second backup in the same minute appends `-2`, `-3`, …; the suffix is the
 *     only deviation, and it still parses, so retention can still prove the
 *     file is ours.
 *   - at most one automatic attempt per interval window. The window starts at
 *     local midnight (daily) or local Monday midnight (weekly). The attempt
 *     stamp is persisted by the writer, so restarting the app all day long
 *     cannot produce a second backup — and a failed attempt cannot hammer the
 *     disk every fifteen minutes either.
 *   - retention counts backups, newest first. Only files matching the pattern,
 *     parsing to a real local date, and living in the backups folder may be
 *     deleted. Everything else is reported as left alone, never removed.
 */
import * as path from 'path'

export type AutoBackupInterval = 'daily' | 'weekly'

/** The retention counts the picker offers. Anything else falls back to 7. */
export const AUTO_BACKUP_RETENTION_CHOICES = [3, 7, 14, 30] as const

export const DEFAULT_AUTO_BACKUP_RETENTION = 7
export const DEFAULT_AUTO_BACKUP_INTERVAL: AutoBackupInterval = 'daily'

export interface AutoBackupPolicy {
  enabled: boolean
  interval: AutoBackupInterval
  retention: number
}

export const DEFAULT_AUTO_BACKUP_POLICY: AutoBackupPolicy = {
  enabled: true,
  interval: DEFAULT_AUTO_BACKUP_INTERVAL,
  retention: DEFAULT_AUTO_BACKUP_RETENTION,
}

/**
 * `aipa-backup-2026-10-29-0915.json`, optionally with a `-N` disambiguator for
 * a second backup in the same minute.
 */
const BACKUP_FILE_RE = /^aipa-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-(\d+))?\.json$/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The local wall-clock instant encoded in a file name, or null when the name is
 * not one AIPA could have written. The round trip through `Date` is what
 * rejects 2026-13-40 or 25:99: constructing the date rolls those fields over,
 * and the comparison notices.
 */
export function parseBackupFileName(name: string): {
  at: number
  year: number
  month: number
  day: number
  hour: number
  minute: number
  serial: number
} | null {
  if (typeof name !== 'string') return null
  const match = BACKUP_FILE_RE.exec(name)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const serial = match[6] === undefined ? 1 : Number(match[6])
  if (!Number.isSafeInteger(year) || year < 1970 || year > 2999) return null
  if (!Number.isSafeInteger(serial) || serial < 1) return null
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }
  return { at: date.getTime(), year, month, day, hour, minute, serial }
}

export function isBackupFileName(name: string): boolean {
  return parseBackupFileName(name) !== null
}

/** `aipa-backup-2026-10-29-0915.json`, in the machine's local time. */
export function backupFileName(now: number): string {
  const date = new Date(now)
  return `aipa-backup-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}.json`
}

/**
 * The same name with an explicit serial, for the second backup inside one
 * minute. Serial 1 is the plain name, so callers iterate 1, 2, 3…
 */
export function backupFileNameWithSerial(now: number, serial: number): string {
  const base = backupFileName(now)
  if (serial <= 1) return base
  return base.replace(/\.json$/, `-${serial}.json`)
}

/** Local midnight for a daily window; local Monday midnight for a weekly one. */
export function intervalWindowStart(now: number, interval: AutoBackupInterval): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  if (interval === 'weekly') {
    const weekday = date.getDay() // 0 = Sunday
    const daysSinceMonday = (weekday + 6) % 7
    date.setDate(date.getDate() - daysSinceMonday)
    date.setHours(0, 0, 0, 0)
  }
  return date.getTime()
}

export type BackupDueReason = 'disabled' | 'never' | 'new_window' | 'already_in_window'

/**
 * Whether the automatic run should write a backup now.
 *
 * `lastAttemptAt` — not `lastSuccessAt` — is the gate: a failed attempt marks
 * the window as used, so a broken backup cannot retry every timer tick. A
 * `null` stamp means no attempt has ever been recorded, which is due.
 */
export function isBackupDue(params: {
  now: number
  lastAttemptAt: number | null
  policy: AutoBackupPolicy
}): { due: boolean; reason: BackupDueReason } {
  const { now, lastAttemptAt, policy } = params
  if (!policy.enabled) return { due: false, reason: 'disabled' }
  if (lastAttemptAt === null || !Number.isFinite(lastAttemptAt)) {
    return { due: true, reason: 'never' }
  }
  const windowStart = intervalWindowStart(now, policy.interval)
  // A stamp in the future (the clock was set back) also counts as "this
  // window has been used": writing another backup because the clock moved is
  // the duplicate this rule exists to prevent.
  if (lastAttemptAt >= windowStart) return { due: false, reason: 'already_in_window' }
  return { due: true, reason: 'new_window' }
}

export interface RetentionCandidate {
  name: string
  /** False for a directory, symlink or anything that is not a readable file. */
  isFile: boolean
}

export interface RetentionPlan {
  /** Recognised names to keep, newest first. */
  keep: string[]
  /** Recognised names beyond the retention limit, oldest first (safe to delete). */
  prune: string[]
  /** Names AIPA cannot prove it wrote. Never deleted. */
  foreign: string[]
}

/**
 * Split the folder into "ours, keep", "ours, prune" and "not provably ours".
 *
 * Ordering is by the timestamp inside the name, not by mtime: copying a file
 * changes its mtime but not what it contains, and the name is the record of
 * when the backup was taken. Equal minutes (same-minute `-N` backups) break by
 * serial, so the plain name is kept ahead of its suffixed siblings.
 */
export function planRetention(entries: RetentionCandidate[], retention: number): RetentionPlan {
  const keepCount = Number.isFinite(retention) && retention >= 1 ? Math.floor(retention) : DEFAULT_AUTO_BACKUP_RETENTION
  const ours: { name: string; at: number; serial: number }[] = []
  const foreign: string[] = []

  for (const entry of entries) {
    const parsed = entry.isFile ? parseBackupFileName(entry.name) : null
    if (!parsed) {
      foreign.push(entry.name)
      continue
    }
    ours.push({ name: entry.name, at: parsed.at, serial: parsed.serial })
  }

  ours.sort((a, b) => (b.at - a.at) || (b.serial - a.serial))
  const keep = ours.slice(0, keepCount).map(item => item.name)
  const prune = ours.slice(keepCount).sort((a, b) => (a.at - b.at) || (a.serial - b.serial)).map(item => item.name)
  foreign.sort()
  return { keep, prune, foreign }
}

/**
 * Turn whatever was on disk (a hand-edited state file, an older shape, a
 * string) into a policy the rest of the code can trust.
 */
export function normalizeAutoBackupPolicy(raw: unknown): AutoBackupPolicy {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const enabled = typeof value.enabled === 'boolean'
    ? value.enabled
    : DEFAULT_AUTO_BACKUP_POLICY.enabled
  const interval: AutoBackupInterval = value.interval === 'weekly' ? 'weekly' : 'daily'
  const retentionValue = typeof value.retention === 'number' ? value.retention : Number(value.retention)
  const retention = (AUTO_BACKUP_RETENTION_CHOICES as readonly number[]).includes(retentionValue)
    ? retentionValue
    : DEFAULT_AUTO_BACKUP_RETENTION
  return { enabled, interval, retention }
}

/** Only a single path segment is ever a backup name; anything else is refused. */
export function isSinglePathSegment(name: string): boolean {
  return typeof name === 'string' &&
    name.length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    path.basename(name) === name
}
