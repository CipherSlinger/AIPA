/**
 * Read-only IPC for the usage ledger.
 *
 * There is deliberately no mutation channel: spend is recorded from the
 * engine's own turn events in the main process, and the renderer may only ask
 * what is already there. The store validates the request (array, string ids,
 * dedupe, bounded count), so this handler is only the transport.
 */
import { safeHandle } from './register/safe-handle'
import { getUsageForSessions } from '../usage/usage-store'
import { createLogger } from '../utils/logger'

const log = createLogger('ipc:usage')

export function registerUsageHandlers(): void {
  safeHandle('usage:getForSessions', (_event, sessionIds: unknown) => {
    try {
      return getUsageForSessions(sessionIds)
    } catch (err) {
      // A reporting page must render; an unreadable ledger is "unknown spend",
      // not a failed invoke the renderer has to explain.
      log.warn('usage:getForSessions failed:', String(err))
      return []
    }
  })
}
