/**
 * Session list, load, rename, fork, rewind and the trash.
 *
 * The trash handlers live here because they answer the same sidebar actions:
 * a delete moves a conversation aside and the sidebar can put it back.
 */
import { ipcMain, app } from 'electron'
import { createLogger } from '../../utils/logger'
import {
  listSessions as listClaudeSessions,
  loadSession as loadClaudeSession,
  forkSession as forkClaudeSession,
  renameSession,
  rewindSession,
} from '../../sessions/session-reader'
import type { SessionListItem as ClaudeSessionListItem } from '../../sessions/session-reader'
import {
  listSessions as listCodexSessions,
  loadSession as loadCodexSession,
  forkSession as forkCodexSession,
  isCodexSession,
} from '../../codex/codex-session-reader'
import {
  listTrashedSessions,
  moveSessionToTrash,
  purgeTrashedSessions,
  removeTrashedSession,
  restoreTrashedSession,
  type SessionTrashErrorCode,
} from '../../trash/session-trash'
import { readAutomationJobs } from '../../automation/job-store'
import {
  readPluginSessionOrigins,
  resolveSessionOrigins,
  type SessionOrigin,
} from '../../sessions/session-origins'
import { renameCodexThread } from '../../codex/codex-bridge'
import { getCliPath } from '../../utils/cli-path'
import { deriveSessionTitle } from '../../llm/auxiliary-engine'
import { isValidSessionId } from '../../utils/validate'

const log = createLogger('ipc:session')

// ----------------------------------------
// Session handlers
// ----------------------------------------

/** A `session:list` row plus the origin derived for the renderer. */
type SessionListRow = ClaudeSessionListItem & { origin?: SessionOrigin }

export function registerSessionCoreHandlers(): void {
  // Session listing: merge Codex + Claude sessions (Codex primary, Claude for migration period)
  ipcMain.handle('session:list', () => {
    try {
      const codexSessions = listCodexSessions()
      const claudeSessions = listClaudeSessions()
      // Deduplicate by sessionId, preferring Codex sessions
      const seen = new Set(codexSessions.map(s => s.sessionId))
      const merged: SessionListRow[] = [...codexSessions]
      for (const s of claudeSessions) {
        if (!seen.has(s.sessionId)) merged.push(s)
      }
      merged.sort((a, b) => b.timestamp - a.timestamp)

      // Origins ride along with the list instead of a second IPC round trip.
      // The list already scans transcripts; this adds two small metadata reads
      // (jobs + the plugin ledger), so rows render with the right badge on the
      // first paint rather than flickering from "started by me" to the truth.
      // A broken origin source must leave the list intact, never empty it:
      // both readers already swallow their own errors, and this guard covers
      // anything else (e.g. an unreadable userData path).
      try {
        const origins = resolveSessionOrigins(
          merged.map(session => session.sessionId),
          readAutomationJobs(),
          readPluginSessionOrigins(app.getPath('userData')),
        )
        for (const session of merged) {
          const origin = origins[session.sessionId]
          if (origin) session.origin = origin
        }
      } catch (originErr) {
        log.warn('session:list origins error:', String(originErr))
      }

      return merged
    } catch (err) {
      log.warn('session:list error:', String(err))
      return []
    }
  })

  // Session loading: try Codex first, then Claude
  ipcMain.handle('session:load', (_e, id) => {
    try {
      const codexResult = loadCodexSession(id)
      if (codexResult.length > 0) return codexResult
      return loadClaudeSession(id)
    } catch (err) {
      log.warn('session:load error:', String(err))
      return []
    }
  })

  // Session deletion moves the conversation into the trash instead of erasing
  // it, so a misclick stays restorable for the retention window. Both engines
  // are still tried — a session id may exist in either — but the answer is a
  // result object the renderer can act on ("nothing matched" is a reason, not
  // a boolean), and a refusal never reaches the renderer as a rejected invoke.
  ipcMain.handle('session:delete', (_e, payload: { sessionId?: string; title?: string } | string) => {
    try {
      const sessionId = typeof payload === 'string' ? payload : payload?.sessionId
      const title = typeof payload === 'string' ? undefined : payload?.title
      if (typeof sessionId !== 'string' || !sessionId) {
        return {
          success: false,
          error: 'No conversation was given',
          code: 'not_found' satisfies SessionTrashErrorCode,
        }
      }
      const result = moveSessionToTrash(sessionId, { title })
      if (!result.ok) {
        log.warn('session:delete refused:', result.code, result.error)
        return { success: false, error: result.error, code: result.code }
      }
      return { success: true, entry: result.entry }
    } catch (err) {
      log.warn('session:delete error:', String(err))
      return { success: false, error: String(err), code: 'move_failed' satisfies SessionTrashErrorCode }
    }
  })

  ipcMain.handle('session:trash:list', () => {
    try {
      return listTrashedSessions()
    } catch (err) {
      log.warn('session:trash:list error:', String(err))
      return { ok: false, code: 'delete_failed' satisfies SessionTrashErrorCode, error: String(err) }
    }
  })

  ipcMain.handle('session:trash:restore', (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id) {
        return { ok: false, code: 'not_found' satisfies SessionTrashErrorCode, error: 'No item was given' }
      }
      const result = restoreTrashedSession(id)
      if (!result.ok) log.warn('session:trash:restore refused:', result.code, result.error)
      return result
    } catch (err) {
      log.warn('session:trash:restore error:', String(err))
      return { ok: false, code: 'move_failed' satisfies SessionTrashErrorCode, error: String(err) }
    }
  })

  ipcMain.handle('session:trash:purge', () => {
    try {
      return purgeTrashedSessions()
    } catch (err) {
      log.warn('session:trash:purge error:', String(err))
      return { ok: false, code: 'delete_failed' satisfies SessionTrashErrorCode, error: String(err) }
    }
  })

  ipcMain.handle('session:trash:remove', (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id) {
        return { ok: false, code: 'not_found' satisfies SessionTrashErrorCode, error: 'No item was given' }
      }
      const result = removeTrashedSession(id)
      if (!result.ok) log.warn('session:trash:remove refused:', result.code, result.error)
      return result
    } catch (err) {
      log.warn('session:trash:remove error:', String(err))
      return { ok: false, code: 'delete_failed' satisfies SessionTrashErrorCode, error: String(err) }
    }
  })

  // Session fork: use Codex fork
  ipcMain.handle('session:fork', (_e, { sessionId, upToMessageIndex }) => {
    try {
      const codexResult = forkCodexSession(sessionId, upToMessageIndex)
      if (codexResult) return codexResult
      return forkClaudeSession(sessionId, upToMessageIndex)
    } catch (err) {
      log.warn('session:fork error:', String(err))
      return null
    }
  })
  ipcMain.handle('session:rename', async (_e, { sessionId, title }) => {
    try {
      if (typeof sessionId !== 'string' || !isValidSessionId(sessionId)) return false
      const name = String(title ?? '').trim()
      if (!name) return false
      // Codex titles live in Codex's own index; appending a Claude
      // `session-title` line would never surface in the sidebar. Ask the
      // protocol first, but only for ids the Codex reader can actually see.
      if (isCodexSession(sessionId)) {
        return await renameCodexThread(sessionId, name)
      }
      return renameSession(sessionId, title)
    } catch (err) {
      log.warn('session:rename error:', String(err))
      return false
    }
  })
  ipcMain.handle('session:generateTitle', (_e: Electron.IpcMainInvokeEvent, { description }: { description: string }) => {
    try {
      if (typeof description !== 'string') return ''
      // Local derivation: the legacy CLI never shipped a working
      // `generate-session-title` subcommand, so spawning it only added a
      // process start on the path to the same fallback.
      return deriveSessionTitle(description)
    } catch (err) {
      log.debug('session:generateTitle failed:', String(err))
      return ''
    }
  })

  ipcMain.handle('session:rewind', async (_e: Electron.IpcMainInvokeEvent, { sessionId, beforeTimestamp }: { sessionId: string; beforeTimestamp: string }) => {
    try {
      const cliPath = getCliPath()
      return await rewindSession(sessionId, beforeTimestamp, cliPath)
    } catch (err) {
      log.warn('session:rewind error:', String(err))
      return { success: false, error: String(err) }
    }
  })
}
