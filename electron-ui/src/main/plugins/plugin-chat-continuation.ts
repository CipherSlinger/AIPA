/**
 * Whether a plugin may continue a conversation, and why not.
 *
 * Kept free of Electron and filesystem imports so the rule can be proven with
 * plain objects. The caller supplies the evidence: the plugin-origin ledger
 * entry (ownership) and whether the archive can still open the id (existence
 * and engine). Ownership is never guessed from the id's shape — a Codex thread
 * id and a Claude session id are both UUIDs.
 */

export type PluginChatContinuationRefusalCode =
  | 'session_requires_visible'
  | 'session_not_found'
  | 'session_not_plugin'
  | 'session_owned_by_other_plugin'
  | 'session_engine_unsupported'

export interface PluginChatContinuationEvidence {
  /** The plugin the origin ledger attributes the conversation to, or null. */
  ownerPluginId: string | null
  /** The archive still has an openable transcript for this id. */
  openable: boolean
  /** Engine that owns the transcript; null when it cannot be determined. */
  engine: 'codex' | 'claude' | null
}

export interface PluginChatContinuationRequest {
  pluginId: string
  sessionId: string
  /**
   * A continuation is persisted by definition — it continues a conversation
   * that already exists — so `visible: false` contradicts it.
   */
  visible: boolean
  /** Engine that will serve this ask; null when no engine can authenticate. */
  targetEngine: 'codex' | 'claude' | null
  /** Required for a visible request; only consulted once `visible` is true. */
  evidence?: PluginChatContinuationEvidence
}

export type PluginChatContinuationDecision =
  | { ok: true; sessionId: string }
  | { ok: false; code: PluginChatContinuationRefusalCode; reason: string }

export function decidePluginChatContinuation(
  request: PluginChatContinuationRequest,
): PluginChatContinuationDecision {
  const { pluginId, sessionId, visible, targetEngine, evidence } = request

  // A private turn creates no conversation, so there is nothing to continue.
  // Refusing is the only reading that does not silently drop one of the two
  // contradictory requests.
  if (!visible) {
    return {
      ok: false,
      code: 'session_requires_visible',
      reason: 'sessionId continues a conversation, which requires visible: true; a private turn has no conversation to continue',
    }
  }

  if (!evidence) {
    return {
      ok: false,
      code: 'session_not_found',
      reason: 'The conversation could not be verified in the archive',
    }
  }

  // Ownership first: another plugin's id must never reveal whether the
  // transcript still exists, and "not yours" is the more important refusal.
  if (evidence.ownerPluginId !== null && evidence.ownerPluginId !== pluginId) {
    return {
      ok: false,
      code: 'session_owned_by_other_plugin',
      reason: 'The conversation belongs to a different plugin',
    }
  }

  if (!evidence.openable) {
    return {
      ok: false,
      code: 'session_not_found',
      reason: 'No openable conversation has this session id',
    }
  }

  // The id exists but the origin ledger attributes it to no plugin: it is a
  // user chat or an automation run, not a plugin conversation.
  if (evidence.ownerPluginId === null) {
    return {
      ok: false,
      code: 'session_not_plugin',
      reason: 'The conversation was not started by a plugin',
    }
  }

  if (!targetEngine || evidence.engine !== targetEngine) {
    return {
      ok: false,
      code: 'session_engine_unsupported',
      reason: 'The engine serving this ask cannot resume that conversation',
    }
  }

  return { ok: true, sessionId }
}

/**
 * Only a brand-new visible ask is announced. A continuation already has an
 * archive row; announcing it again would make the renderer treat one
 * conversation as two.
 */
export function shouldAnnouncePluginConversation(
  visible: boolean,
  requestedContinuationId: string | null,
  returnedSessionId: string | null,
): boolean {
  return visible
    && !requestedContinuationId
    && typeof returnedSessionId === 'string'
    && returnedSessionId.length > 0
}
