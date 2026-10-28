/**
 * Open a cross-session search hit on its evidence.
 *
 * Opening goes through `openSessionCore` — the same path the department
 * roster and archive use — so transcript parsing, persona restore and the
 * working-directory switch stay in one place. The search result carries the
 * matched entry's timestamp rather than a snippet, because a snippet cannot be
 * located in the parsed message array; the index is resolved here, against the
 * messages `openSessionCore` has just written to the store.
 */
import { useChatStore, useUiStore } from '../../store'
import type { ChatMessage, SessionListItem, StandardChatMessage } from '../../types/app.types'
import type { SessionSearchResultData } from '../../../preload/index'
import { openSessionCore } from '../departments/openSessionCore'

/**
 * A search hit may only carry a directory into `openSessionCore` when the main
 * process got it from the transcript rather than by decoding a slug.
 *
 * Claude's `project` is `decodeProjectSlug(projectSlug)`, which turns every
 * hyphen into a separator: `D:\work\my-app` becomes `D:\work\my\app`. Persisting
 * that as `workingDir` breaks the next message and survives a restart. Codex
 * hits carry the rollout's real `cwd`, so only those are safe to use — and only
 * when they are still an absolute path.
 *
 * Follow-up for the main-process owner: `session:search` should expose the
 * transcript's real cwd for Claude sessions too, at which point this can stop
 * special-casing the engine.
 */
function trustworthyDirectory(hit: SessionSearchResultData): string {
  if (hit.engine !== 'codex') return ''
  const project = hit.project
  if (/^[a-zA-Z]:[\\/]/.test(project)) return project
  if (project.startsWith('\\\\') || project.startsWith('//')) return project
  if (project.startsWith('/')) return project
  return ''
}

export function findMessageIndex(
  messages: ChatMessage[],
  timestamp: number | undefined,
  role: 'user' | 'assistant' | undefined,
): number {
  if (!timestamp) return -1
  let fallback = -1
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    if ((message as StandardChatMessage).timestamp !== timestamp) continue
    if (message.role === role) return i
    // Duplicate timestamps are rare; a same-instant message of another role is
    // still far closer evidence than jumping to the top.
    if (fallback === -1 && (message.role === 'user' || message.role === 'assistant')) fallback = i
  }
  return fallback
}

/**
 * @returns false only when the session could not be opened at all. A title
 * match, or a match whose row the parser dropped, still counts as opened.
 */
export async function revealSessionEvidence(
  hit: SessionSearchResultData,
  query: string,
): Promise<boolean> {
  const session: SessionListItem = {
    sessionId: hit.sessionId,
    lastPrompt: hit.title ?? '',
    timestamp: hit.timestamp,
    project: hit.project,
    projectSlug: '',
  }

  try {
    // An empty directory leaves the current `workingDir` untouched; landing on
    // the matched message does not depend on it.
    await openSessionCore(session, trustworthyDirectory(hit), 'archive')
  } catch (err) {
    console.warn('[AIPA] Failed to open search hit', hit.sessionId, err)
    return false
  }

  if (hit.matchType !== 'content' || !hit.messageTimestamp) return true

  // openSessionCore applies loadHistory synchronously after its await, so the
  // parsed transcript is in the store before this line runs.
  const state = useChatStore.getState()
  if (state.currentSessionId !== hit.sessionId) return true
  const index = findMessageIndex(state.messages, hit.messageTimestamp, hit.messageRole)
  if (index < 0) return true

  useUiStore.getState().requestReveal({
    sessionId: hit.sessionId,
    messageIndex: index,
    query,
  })
  return true
}
