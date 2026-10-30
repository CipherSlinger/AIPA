/**
 * active-session — the one conversation the chat view is showing, as far as the
 * main process can honestly know it.
 *
 * This is deliberately a single pointer, not a second session store. The
 * bridge-state map knows which thread a live bridge owns, but it forgets the
 * mapping when the process exits and says nothing about what is rendered. The
 * pet's quick command needs exactly one fact — "if the user asks from the pet
 * now, which conversation should CONTINUE mean?" — so that fact lives here,
 * and only explicit renderer/main signals write it:
 *
 *   - `session:detectInterruption` — `openSessionCore` opened this conversation
 *     into the chat view. It is the renderer's one "load into the chat view"
 *     path; `session:load` is not (search, comparisons and history preflights
 *     use it too).
 *   - `session:setActive` — the renderer reports the view directly (tab switch,
 *     new draft). Added for the renderer hook-up; see the report.
 *   - a non-internal `cli:sendMessage` / Codex `threadStarted` — the user sent a
 *     turn, so they are in that conversation even before the session index
 *     lists it.
 *   - `menu:newSession` — main asked the renderer for a new draft, so nothing
 *     is current until one of the signals above names it.
 *   - a renderer reload — the view becomes unknown; a restored conversation
 *     re-reports itself through the signals above. Keeping the old pointer
 *     would label a fresh draft with the previous conversation.
 */

import { codexBridgeManager } from './codex/codex-bridge'
import { codexSessionTarget } from './codex/codex-session-reader'
import { isValidSessionId } from './utils/validate'

export interface ActiveSession {
  id: string
  /** A label a writer already knew; otherwise resolved lazily by the bar. */
  label: string
}

export interface QuickCommandTarget {
  id: string
  /** Human line for the chip; may be empty when the store has no name yet. */
  label: string
}

let active: ActiveSession | null = null

/** Remember the conversation the user is in. Invalid or empty ids are ignored. */
export function noteActiveSession(sessionId: unknown, label?: unknown): void {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!isValidSessionId(id)) return
  const cleanLabel = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim() : ''
  active = { id, label: cleanLabel }
}

/** The view became unknown (new draft, renderer reload, app reset). */
export function clearActiveSession(): void {
  active = null
}

export function getActiveSessionId(): string | null {
  return active?.id ?? null
}

/**
 * The conversation a quick ask may continue, or null when there is none the bar
 * could honestly name.
 *
 * A live bridge proves the thread still exists; otherwise the Codex store must
 * still know it. A Claude conversation is deliberately not offered: the quick
 * bar runs on Codex, so continuing it would fail by construction. A target that
 * no longer exists is forgotten so the next ask does not repeat the dead id.
 */
export function resolveQuickCommandTarget(): QuickCommandTarget | null {
  const id = active?.id
  if (!id) return null
  const live = codexBridgeManager.findByThreadId(id)
  const found = codexSessionTarget(id)
  if (!live && !found.exists) {
    clearActiveSession()
    return null
  }
  // The store's current name wins over a label a writer remembered earlier: a
  // rename since then must not leave the chip on the old title.
  const label = (found.label || active?.label || '').trim()
  if (label && active) active = { id, label }
  return { id, label }
}
