/**
 * Small session-level questions the composer and sidebar ask: a predicted
 * reply, an away recap, an interruption check, usage stats and the dream
 * lock's mtime.
 */
import { ipcMain } from 'electron'
import { createLogger } from '../../utils/logger'
import { detectTurnInterruption, getDreamConsolidationMtime } from '../../sessions/session-reader'
import { getSessionStats } from '../../sessions/session-stats'
import { clearActiveSession, noteActiveSession } from '../../active-session'
import { generateAwaySummary, generatePromptSuggestion } from './cli/auxiliary-turns'

const log = createLogger('ipc:session')

export function registerSessionAuxiliaryHandlers(): void {
  ipcMain.handle('cli:generateSuggestion', async (_e: Electron.IpcMainInvokeEvent, { context }: { context: string }) => {
    try {
      if (typeof context !== 'string' || !context.trim()) return ''
      return await generatePromptSuggestion(context)
    } catch (err) {
      // Fires after every assistant turn; a warning per failure would drown
      // the log. The empty string is the renderer's "no suggestion" state.
      log.debug('cli:generateSuggestion failed:', String(err))
      return ''
    }
  })

  ipcMain.handle('cli:generateAwaySummary', async (_e: Electron.IpcMainInvokeEvent, { context }: { context: string }) => {
    try {
      if (typeof context !== 'string' || !context.trim()) return ''
      return await generateAwaySummary(context)
    } catch (err) {
      log.debug('cli:generateAwaySummary failed:', String(err))
      return ''
    }
  })
  ipcMain.handle('session:detectInterruption', (_e: Electron.IpcMainInvokeEvent, { sessionId }: { sessionId: string }) => {
    // `openSessionCore` calls this exactly when it has loaded a conversation
    // into the chat view, so it is also the renderer's "the user opened this"
    // signal. `session:load` is deliberately not used: search, comparisons and
    // history preflights load sessions without showing them.
    noteActiveSession(sessionId)
    try {
      return detectTurnInterruption(sessionId)
    } catch (err) {
      log.warn('session:detectInterruption error:', String(err))
      return 'none'
    }
  })

  /**
   * The renderer's direct report of what the chat view is showing. A null id
   * means a new draft. This is the narrow write path the quick command needs
   * for tab switches and New Chat, which had no IPC before; the renderer
   * hook-up is pending (see the report). Main validates the id, so a page
   * cannot pin an arbitrary path as the continuation target.
   */
  ipcMain.on('session:setActive', (_e: Electron.IpcMainEvent, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    if (typeof p.sessionId === 'string' && p.sessionId) noteActiveSession(p.sessionId, p.label)
    else clearActiveSession()
  })

  ipcMain.handle('session:getStats', async () => {
    try {
      return getSessionStats()
    } catch (err) {
      log.warn('session:getStats error:', String(err))
      return null
    }
  })

  // DreamTask detection: returns the mtime of the .consolidate-lock file that
  // the CLI updates whenever an auto-dream (memory consolidation) completes.
  // Renderer compares this against its session-start snapshot to detect dreams.
  ipcMain.handle('session:getDreamMtime', () => getDreamConsolidationMtime())
}
