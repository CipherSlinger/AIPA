/**
 * Small JSON store for dream passes.
 *
 * It sits in the app's userData directory, not in a memory tier: the tier files
 * are the product, this file only remembers which turns were already
 * consolidated and which passes the console can show/delete.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import {
  DREAM_PASS_RETENTION,
  DREAM_SUPPRESSED_RETENTION,
} from './dream-types'
import type {
  DreamPassRecord,
  DreamPassStatus,
  DreamSessionState,
  DreamStoreData,
} from './dream-types'

const log = createLogger('dream-store')

const STATUSES: DreamPassStatus[] = ['written', 'empty', 'junk', 'unavailable', 'error']

function emptyStore(): DreamStoreData {
  return { version: 1, sessions: {}, passes: [], suppressed: [] }
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeSession(value: unknown): DreamSessionState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
  if (!sessionId) return null
  return {
    sessionId,
    engine: raw.engine === 'codex' || raw.engine === 'claude' ? raw.engine : undefined,
    cwd: typeof raw.cwd === 'string' && raw.cwd ? raw.cwd : undefined,
    projectSlug: typeof raw.projectSlug === 'string' ? raw.projectSlug : '',
    turnsSeen: Math.max(0, Math.floor(finiteNumber(raw.turnsSeen))),
    turnsConsolidated: Math.max(0, Math.floor(finiteNumber(raw.turnsConsolidated))),
    lastActivity: finiteNumber(raw.lastActivity),
    lastAttemptAt: raw.lastAttemptAt === undefined ? undefined : finiteNumber(raw.lastAttemptAt),
  }
}

function sanitizePass(value: unknown): DreamPassRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id : ''
  const status = typeof raw.status === 'string' && STATUSES.includes(raw.status as DreamPassStatus)
    ? raw.status as DreamPassStatus
    : null
  if (!id || !status) return null
  return {
    id,
    status,
    createdAt: finiteNumber(raw.createdAt),
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : '',
    projectSlug: typeof raw.projectSlug === 'string' ? raw.projectSlug : '',
    filePath: typeof raw.filePath === 'string' ? raw.filePath : '',
    entryCount: Math.max(0, Math.floor(finiteNumber(raw.entryCount))),
    statements: Array.isArray(raw.statements)
      ? raw.statements.filter((s): s is string => typeof s === 'string')
      : [],
    trigger: raw.trigger === 'manual' ? 'manual' : 'idle',
    note: typeof raw.note === 'string' ? raw.note : undefined,
  }
}

/** Never trust the file: a hand-edited state must not crash the app. */
export function sanitizeDreamStore(value: unknown): DreamStoreData {
  if (!value || typeof value !== 'object') return emptyStore()
  const raw = value as Record<string, unknown>
  const store = emptyStore()

  if (raw.sessions && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)) {
    for (const entry of Object.values(raw.sessions as Record<string, unknown>)) {
      const session = sanitizeSession(entry)
      if (session) store.sessions[session.sessionId] = session
    }
  }

  if (Array.isArray(raw.passes)) {
    store.passes = raw.passes
      .map(sanitizePass)
      .filter((pass): pass is DreamPassRecord => pass !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, DREAM_PASS_RETENTION)
  }

  if (Array.isArray(raw.suppressed)) {
    store.suppressed = raw.suppressed
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .slice(-DREAM_SUPPRESSED_RETENTION)
  }

  store.unavailableNotifiedAt = raw.unavailableNotifiedAt === undefined
    ? undefined
    : finiteNumber(raw.unavailableNotifiedAt)

  return store
}

export function loadDreamStore(storePath: string): DreamStoreData {
  try {
    if (!fs.existsSync(storePath)) return emptyStore()
    return sanitizeDreamStore(JSON.parse(fs.readFileSync(storePath, 'utf-8')))
  } catch (err) {
    // A corrupt file should cost the history, not the app. Keep the bad file
    // beside it for post-mortem instead of silently overwriting the only copy.
    log.warn('Could not read dream store; starting empty:', String(err))
    try {
      fs.renameSync(storePath, `${storePath}.corrupt-${Date.now()}`)
    } catch { /* best effort */ }
    return emptyStore()
  }
}

export function saveDreamStore(storePath: string, data: DreamStoreData): void {
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true })
    const tmp = `${storePath}.tmp.${process.pid}.${Date.now()}`
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8')
    fs.renameSync(tmp, storePath)
  } catch (err) {
    log.warn('Could not write dream store:', String(err))
    // A stale state file only means a repeated pass attempt, never corruption
    // of a memory tier; surface the failure in logs and continue.
  }
}
