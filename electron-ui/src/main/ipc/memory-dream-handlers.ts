/**
 * IPC for the background memory consolidation pass and its review log.
 *
 * Passes are addressed by record id, never by a renderer-supplied path: the
 * delete handler asks the service to look up the file it itself wrote.
 */
import { ipcMain } from 'electron'
import type { DreamService } from '../memory/dream-service'

function safeHandle(channel: string, handler: (...args: any[]) => any): void {
  try { ipcMain.removeHandler(channel) } catch { /* no previous handler */ }
  ipcMain.handle(channel, handler)
}

export function registerDreamHandlers(getService: () => DreamService | null): void {
  safeHandle('memory:dream:list', () => {
    try {
      return getService()?.listPasses() ?? []
    } catch (err) {
      return { error: String(err) }
    }
  })

  safeHandle('memory:dream:status', () => {
    try {
      return getService()?.getStatus() ?? {
        enabled: false,
        running: false,
        pendingSessions: 0,
        passes: 0,
      }
    } catch (err) {
      return { error: String(err) }
    }
  })

  safeHandle('memory:dream:runNow', async (_event, args?: { sessionId?: string }) => {
    try {
      const sessionId = typeof args?.sessionId === 'string' && args.sessionId
        ? args.sessionId
        : undefined
      return await getService()?.runNow(sessionId) ?? { ok: false, error: 'not-initialized' }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  safeHandle('memory:dream:delete', (_event, args?: { passId?: string }) => {
    try {
      const service = getService()
      if (!service) return { ok: false, error: 'not-initialized' }
      return service.deletePass(String(args?.passId ?? ''))
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
