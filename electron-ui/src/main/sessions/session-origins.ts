/**
 * Who started a conversation, when it was not the user.
 *
 * A transcript says nothing about how it began: a scheduled automation run and
 * a plugin's visible `chat.ask` leave the same ordinary session row as a chat
 * the user typed into. This module answers that question for the ids a view is
 * about to render, for the archive's and the sidebar's session rows to share.
 *
 * Two very different sources feed it:
 *
 *  - Automation origins are derived, not stored. `readAutomationJobs()` keeps
 *    only each job's *most recent* `lastSessionId`, so this can name the latest
 *    run of every job and no earlier one. That is an honest limit of the job
 *    store, not a gap this module can fill: an older run of the same job is
 *    reported as user-started.
 *  - Plugin origins cannot be derived at all. A visible turn leaves no marker
 *    in the transcript and no job record, so the IPC layer records the openable
 *    session id when it hands that id back. The record is metadata about who
 *    started the conversation, not a copy of it.
 *
 * The module is Electron-free: the caller injects the userData directory and
 * the automation job list, so the resolver can be tested with plain objects.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'

const log = createLogger('session-origins')

const ORIGINS_FILE = 'session-origins.json'
const STORE_VERSION = 1

/**
 * How many plugin-started conversations to remember. The ledger only serves
 * the visible archive; older sessions falling back to "started by me" is
 * preferable to an unbounded file growing with plugin traffic.
 */
export const PLUGIN_ORIGIN_CAP = 500

const MAX_SESSION_ID_LENGTH = 256
const MAX_PLUGIN_ID_LENGTH = 128
const MAX_LABEL_LENGTH = 200

export type SessionOrigin =
  | { kind: 'automation'; jobId: string; jobName: string }
  | { kind: 'plugin'; pluginId: string; pluginLabel: string }

/** The subset of an automation job the resolver needs. */
export interface AutomationOriginJob {
  id: string
  name: string
  lastSessionId: string | null
}

export interface PluginSessionOrigin {
  sessionId: string
  pluginId: string
  pluginLabel: string
  createdAt: number
}

export interface PluginSessionOriginInput {
  sessionId: string
  pluginId: string
  pluginLabel: string
  /** Defaults to now; the harness can pin it to test duplicate resolution. */
  createdAt?: number
}

/**
 * Only the Electron-owned userData path and this fixed filename reach the
 * filesystem. Plugin-supplied ids and labels are stored as data, never used to
 * build a path.
 */
function originFilePath(userDataDir: string): string {
  return path.join(userDataDir, ORIGINS_FILE)
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

function normalizeOrigin(raw: unknown): PluginSessionOrigin | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const sessionId = text(value.sessionId, MAX_SESSION_ID_LENGTH)
  const pluginId = text(value.pluginId, MAX_PLUGIN_ID_LENGTH)
  if (!sessionId || !pluginId) return null
  // A missing label is cosmetic: the id is still a usable, if less friendly,
  // name. A missing timestamp sorts oldest without dropping the record.
  const pluginLabel = text(value.pluginLabel, MAX_LABEL_LENGTH) ?? pluginId
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
    ? value.createdAt
    : 0
  return { sessionId, pluginId, pluginLabel, createdAt }
}

/** One record per session; the newest wins, and a later entry wins a tie. */
function collapse(records: readonly PluginSessionOrigin[]): PluginSessionOrigin[] {
  const byId = new Map<string, PluginSessionOrigin>()
  for (const record of records) {
    const current = byId.get(record.sessionId)
    if (!current || record.createdAt >= current.createdAt) byId.set(record.sessionId, record)
  }
  return [...byId.values()]
}

/**
 * Reads the plugin-origin ledger. A missing or corrupt file yields an empty
 * list so that badge rendering degrades to "started by me" instead of breaking
 * the session list that called us.
 */
export function readPluginSessionOrigins(userDataDir: string): PluginSessionOrigin[] {
  const file = originFilePath(userDataDir)
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const records = Array.isArray(parsed.records) ? parsed.records : []
    return collapse(records
      .map(normalizeOrigin)
      .filter((record): record is PluginSessionOrigin => record !== null))
  } catch (err) {
    // Keep the corrupt file on disk for inspection; the next successful write
    // replaces it. Losing badges is preferable to losing the archive.
    log.warn('Could not read session-origins.json:', err)
    return []
  }
}

/**
 * Appends one plugin-started conversation. Recording is best-effort: a failed
 * write must not fail the plugin's `chat.ask`.
 */
export function recordPluginSessionOrigin(userDataDir: string, input: PluginSessionOriginInput): void {
  const record = normalizeOrigin({ ...input, createdAt: input.createdAt ?? Date.now() })
  if (!record) {
    log.warn('Ignored an invalid plugin session origin')
    return
  }

  try {
    const existing = readPluginSessionOrigins(userDataDir)
    // Newest first, one row per session: repeated asks inside one conversation
    // refresh their single record, and the cap evicts the oldest conversations.
    const next = [record, ...existing.filter(r => r.sessionId !== record.sessionId)]
      .slice(0, PLUGIN_ORIGIN_CAP)
    const file = originFilePath(userDataDir)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ version: STORE_VERSION, records: next }, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
  } catch (err) {
    log.warn('Could not write session-origins.json:', err)
  }
}

/**
 * Resolves origins for exactly the session ids a view is showing. Work is
 * proportional to the number of jobs and records, not to transcripts.
 *
 * Automation is checked before the plugin ledger: a session cannot normally be
 * both, but if the two ever disagree the more specific scheduler record wins.
 */
export function resolveSessionOrigins(
  sessionIds: readonly string[],
  jobs: readonly AutomationOriginJob[],
  pluginRecords: readonly PluginSessionOrigin[],
): Record<string, SessionOrigin> {
  const wanted = new Set(sessionIds)
  const origins: Record<string, SessionOrigin> = {}

  for (const job of jobs) {
    const sessionId = job.lastSessionId
    if (!sessionId || !job.id || !job.name || !wanted.has(sessionId)) continue
    if (origins[sessionId]) continue
    origins[sessionId] = { kind: 'automation', jobId: job.id, jobName: job.name }
  }

  for (const record of collapse(pluginRecords)) {
    if (!wanted.has(record.sessionId) || origins[record.sessionId]) continue
    origins[record.sessionId] = {
      kind: 'plugin',
      pluginId: record.pluginId,
      pluginLabel: record.pluginLabel,
    }
  }

  return origins
}
