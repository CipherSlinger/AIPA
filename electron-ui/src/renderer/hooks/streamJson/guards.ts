// Ownership and protocol-shape guards used by the cli:* listeners.
//
// Moved verbatim (wave 75C) from useStreamJson.ts, where these sat above the
// hook. Nothing changed but the exports.
import { useChatStore } from '../../store'
import type { StandardChatMessage } from '../../types/app.types'

/**
 * Background turns (memory extraction, away summary) carry an `internal-`
 * bridge id and are never published on the cli:* channels. The tag is still
 * checked here: the listener subscribes to every bridge, so a leak in the main
 * process must not be able to write into the open conversation.
 */
const INTERNAL_SESSION_PREFIX = 'internal-'
export function isInternalCliEvent(data: unknown): boolean {
  const d = data as { internal?: unknown; sessionId?: unknown } | null
  if (!d) return false
  if (d.internal === true) return true
  return typeof d.sessionId === 'string' && d.sessionId.startsWith(INTERNAL_SESSION_PREFIX)
}

/**
 * Invariant: a cli:result may mutate the open conversation only when it is
 * (a) the bridge this hook started, (b) carries the engine session id that is
 * already on screen, or (c) belongs to a conversation that has no real id yet
 * (a new chat, or the sidebar's `pending-` placeholder waiting for its first
 * result). Anything else is another tab's or a background job's turn: it must
 * not switch currentSessionId, append messages, or set usage/cost.
 */
export function isResultForActiveConversation(data: unknown, activeBridgeId: string | null): boolean {
  const d = data as { sessionId?: unknown; claudeSessionId?: unknown } | null
  if (!d) return false
  const bridgeSessionId = typeof d.sessionId === 'string' ? d.sessionId : ''
  const store = useChatStore.getState()
  // A bridge the user walked away from mid-turn. Its result reports on its own
  // conversation, never on whatever is on screen now: applying it would relabel
  // this view with the other session id and re-visible the orphan, letting the
  // rest of that turn land in this transcript.
  const orphan = store.orphanedStream
  if (orphan && bridgeSessionId === orphan.bridgeId) return orphan.visible
  if (activeBridgeId && bridgeSessionId === activeBridgeId) return true
  const engineSessionId = typeof d.claudeSessionId === 'string' ? d.claudeSessionId : ''
  const current = store.currentSessionId
  if (!current || current.startsWith('pending-')) return true
  return engineSessionId === current || bridgeSessionId === current
}

/**
 * Some Codex item kinds are normally translated by the main process into rich
 * tool cards. If a future bridge stops translating one but still forwards its
 * lifecycle events, the quiet row must not duplicate the card that is already
 * on screen. The item id is the same id the card carries.
 */
export function hasToolCardForItem(itemId: string): boolean {
  if (!itemId) return false
  return useChatStore.getState().messages.some(message => {
    const toolUses = (message as StandardChatMessage).toolUses
    return Array.isArray(toolUses) && toolUses.some(tool => tool.id === itemId)
  })
}

/**
 * A multi-file Codex patch opens one card per file (`itemId:0`, `itemId:1`).
 * A live patch names only the parent item id, so accept the family. Patches for
 * an item the transcript does not show are ignored rather than parked in the
 * live store.
 */
export function hasToolCardForItemFamily(itemId: string): boolean {
  if (!itemId) return false
  const prefix = `${itemId}:`
  return useChatStore.getState().messages.some(message => {
    const toolUses = (message as StandardChatMessage).toolUses
    return Array.isArray(toolUses)
      && toolUses.some(tool => tool.id === itemId || tool.id.startsWith(prefix))
  })
}

/**
 * Thread-level Codex reports (`thread/settings/updated`) describe the whole
 * conversation, not a turn: they can arrive right after `thread/start`, before
 * any delta exists, so the turn-scoped ownership rule below would drop them.
 * They must still never be applied to another conversation's view: accept only
 * the bridge this composer started, or — when no bridge is live — an event that
 * names the conversation already on screen.
 */
/**
 * Engine notices (warnings / reroutes) are thread-level like the settings
 * report, but they can also arrive during `initialize`, before the send reply
 * has told this hook the bridge id. Accept a thread report, or a bridge the
 * store already considers the owner of the in-flight turn (which covers the
 * brand-new-conversation window). A notice from a turn the user walked away
 * from stays out.
 */
export function isNoticeForActiveConversation(data: unknown, activeBridgeId: string | null): boolean {
  if (isThreadReportForActiveConversation(data, activeBridgeId)) return true
  const d = data as { sessionId?: unknown } | null
  const sid = typeof d?.sessionId === 'string' ? d.sessionId : ''
  return !!sid && useChatStore.getState().isOwnedStreamEvent(sid)
}

export function isThreadReportForActiveConversation(data: unknown, activeBridgeId: string | null): boolean {
  const d = data as { sessionId?: unknown } | null
  const sid = typeof d?.sessionId === 'string' ? d.sessionId : ''
  if (!sid) return false
  const store = useChatStore.getState()
  const orphan = store.orphanedStream
  if (orphan && sid === orphan.bridgeId) return orphan.visible
  if (activeBridgeId && sid === activeBridgeId) return true
  const current = store.currentSessionId
  // No open conversation: this report belongs to nobody on screen.
  if (!current) return false
  // A brand-new conversation has no session id yet, and `thread/start`'s
  // settings report can arrive before `cliSendMessage` returns the bridge id.
  // The read-only settings are safe to accept in that window; an older
  // conversation's report is not.
  if (current.startsWith('pending-')) return true
  return sid === current
}

/**
 * `sandboxPolicy` is an object in current Codex builds and a plain string in
 * older ones. Keep a short label; the store must never hold protocol internals
 * that the renderer would be tempted to print raw.
 */
export function compactSandboxPolicy(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const kind = record.type ?? record.kind ?? record.mode
    if (typeof kind === 'string' && kind) return kind
  }
  return null
}

export function compactString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}
