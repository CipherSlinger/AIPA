// Branching a Codex conversation from an earlier user message.
//
// React-free decision + text logic so the rules can be tested without a
// renderer. The wire facts this encodes were verified against Codex 0.145:
//
//   * `thread/fork` takes `{ threadId, beforeTurnId? }`, and `beforeTurnId` is
//     EXCLUSIVE — the branch keeps every turn before the named one.
//   * The only turn id the renderer can name is the one the engine echoed on
//     the `userMessage` item (`params.turnId`). A message loaded from disk has
//     no turn id, so no honest branch point exists and the action is hidden.
//   * Forking while a turn streams is refused here, with the reason shown in
//     the action's tooltip. A half-written turn is not a settled branch point,
//     and the engine may not have persisted it yet.

import type { StandardChatMessage } from '../../types/app.types'

/** Why a user message cannot be branched from. */
export type ForkBlockReason =
  | 'not-user-message'
  | 'no-turn-id'
  | 'steer-guidance'
  | 'no-session'
  | 'streaming'

/** The subset of a message this module reads. */
export interface ForkMessageLike {
  role?: string
  turnId?: string | null
  guidance?: unknown
}

export interface ForkContext {
  /** A Codex turn is streaming in the visible conversation. */
  isStreaming: boolean
  /** Codex thread id (`session:list` / `session:load` id), not a bridge id. */
  sessionId?: string | null
}

export interface BranchAvailability {
  /** Render the action at all. A message with no turn id must not offer it. */
  visible: boolean
  /** Invoke the action now. */
  enabled: boolean
  reason: ForkBlockReason | null
}

export type ForkDecision =
  | { allowed: true; beforeTurnId: string }
  | { allowed: false; reason: ForkBlockReason }

/** Locale keys for the reasons, kept here so every surface words them alike. */
export const FORK_BLOCKED_KEYS: Record<ForkBlockReason, string> = {
  'not-user-message': 'branch.blocked.notUser',
  'no-turn-id': 'branch.blocked.noTurnId',
  'steer-guidance': 'branch.blocked.guidance',
  'no-session': 'branch.blocked.noSession',
  'streaming': 'branch.blocked.streaming',
}

export function forkBlockedKey(reason: ForkBlockReason): string {
  return FORK_BLOCKED_KEYS[reason] ?? FORK_BLOCKED_KEYS['no-turn-id']
}

function blockReason(message: ForkMessageLike | null | undefined, ctx: ForkContext): ForkBlockReason | null {
  if (!message || message.role !== 'user') return 'not-user-message'
  // Guidance was delivered into a turn that was already running; it did not
  // start one, so it is not a branch point (its turn id lives in the receipt).
  if (message.guidance) return 'steer-guidance'
  const turnId = typeof message.turnId === 'string' ? message.turnId.trim() : ''
  if (!turnId) return 'no-turn-id'
  if (!ctx.sessionId) return 'no-session'
  if (ctx.isStreaming) return 'streaming'
  return null
}

/**
 * Whether the action should be rendered and whether it can run.
 *
 * `streaming` is the one reason that keeps the action visible but disabled:
 * the row itself is branchable, only the moment is wrong, and the tooltip has
 * to say so. Every other reason hides the action (notably a disk-loaded row,
 * which must never offer a branch it cannot name).
 */
export function branchAvailability(
  message: ForkMessageLike | null | undefined,
  ctx: ForkContext,
): BranchAvailability {
  const reason = blockReason(message, ctx)
  if (reason === null) return { visible: true, enabled: true, reason: null }
  if (reason === 'streaming') return { visible: true, enabled: false, reason }
  return { visible: false, enabled: false, reason }
}

/** The value to send to `threadFork`, or the honest reason it cannot run. */
export function decideFork(
  message: ForkMessageLike | null | undefined,
  ctx: ForkContext,
): ForkDecision {
  const availability = branchAvailability(message, ctx)
  if (!availability.enabled) {
    return { allowed: false, reason: availability.reason ?? 'no-turn-id' }
  }
  const beforeTurnId = typeof message?.turnId === 'string' ? message.turnId.trim() : ''
  if (!beforeTurnId) return { allowed: false, reason: 'no-turn-id' }
  return { allowed: true, beforeTurnId }
}

export interface BranchLabel {
  /** The source conversation's title, trimmed, or null when it has none. */
  source: string | null
  /** A one-line excerpt of the branch point, capped at `maxExcerpt` chars. */
  excerpt: string
}

/**
 * Derive the label for the new branch.
 *
 * Pure data, not a sentence: the caller localizes it (`branch.created`). The
 * excerpt describes the selected message, while the branch itself keeps the
 * history *before* it — the toast says both rather than implying the message
 * was copied.
 */
export function deriveBranchLabel(
  sourceTitle: string | null | undefined,
  messageText: string | null | undefined,
  maxExcerpt = 48,
): BranchLabel {
  const source = typeof sourceTitle === 'string' && sourceTitle.trim() ? sourceTitle.trim() : null
  const flat = typeof messageText === 'string' ? messageText.replace(/\s+/g, ' ').trim() : ''
  const limit = Math.max(1, Math.floor(maxExcerpt))
  const excerpt = flat.length > limit ? `${flat.slice(0, limit).trimEnd()}…` : flat
  return { source, excerpt }
}

export type ForkOutcome =
  /**
   * `turnCount` is how much history the branch kept: `0` means the branch
   * point was the first message, so the new thread has no transcript to load;
   * `null` means the engine's reply did not say, which must not be read as
   * "empty".
   */
  | { ok: true; threadId: string; turnCount: number | null }
  | { ok: false; threadId: null; error: string | null }

/**
 * Normalize the IPC reply. Success requires `success === true` *and* a real
 * thread id; the engine's rejection text is returned verbatim so the UI can
 * show its own words, with no invented sentence. `error` is null when the
 * reply carried none (a localized fallback is then the caller's decision).
 */
export function readForkResult(result: unknown): ForkOutcome {
  const reply = (result && typeof result === 'object' ? result : {}) as {
    success?: unknown
    threadId?: unknown
    turnCount?: unknown
    error?: unknown
  }
  const threadId = typeof reply.threadId === 'string' ? reply.threadId.trim() : ''
  const turnCount = typeof reply.turnCount === 'number'
    && Number.isInteger(reply.turnCount)
    && reply.turnCount >= 0
    ? reply.turnCount
    : null
  if (reply.success === true && threadId) return { ok: true, threadId, turnCount }
  const error = typeof reply.error === 'string' && reply.error.trim() ? reply.error : null
  return { ok: false, threadId: null, error }
}

/**
 * Whether the branch the engine reported needs a direct adoption rather than
 * the normal "open session" path.
 *
 * A branch with zero turns is a real Codex thread whose rollout holds only
 * metadata, so `session:load` finds no messages and the archive path would
 * report it missing. The window adopts the id instead, and the first message
 * starts turn one in it. `null` (unknown) keeps the normal path: guessing
 * "empty" would replace a conversation that actually has history.
 */
export function isEmptyBranch(turnCount: number | null): boolean {
  return turnCount === 0
}

/** The label params consumed by `branch.created`. */
export function branchToastParams(label: BranchLabel): Record<string, string> {
  return {
    source: label.source ?? '',
    excerpt: label.excerpt,
  }
}

/** A message is branchable only while it still carries the engine's turn id. */
export type BranchableMessage = StandardChatMessage & { turnId: string }
