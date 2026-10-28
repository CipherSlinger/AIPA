// steerDecision — what pressing send means right now.
//
// Codex accepts guidance while a turn is still running (`turn/steer`), so the
// composer must not treat "streaming" as "locked". Every other engine has no
// such channel: the legacy Claude bridge can only start another turn, and
// starting one under a live turn is exactly what a steer must avoid. Keeping
// the decision pure makes the edge cases (turn id not announced yet, turn that
// ended between the keypress and the dispatch) testable without a renderer.

/** Which engine owns the turn the composer is about to talk to. */
export type SteerEngine = 'codex' | 'other' | 'unknown'

export type SteerBlockReason =
  /** Nothing to send. */
  | 'empty'
  /** This engine cannot take guidance mid-turn; the draft stays in the box. */
  | 'engine-unsupported'
  /**
   * The turn is live but the engine has not announced its id yet. Steering
   * needs that id, and a normal send would race a second turn into the thread.
   */
  | 'turn-not-identified'

export type SteerDecision =
  | { action: 'send' }
  | { action: 'steer'; turnId: string }
  | { action: 'blocked'; reason: SteerBlockReason }

export interface SteerDecisionInput {
  engine: SteerEngine
  isStreaming: boolean
  /** Live Codex turn id, or null while it is still unknown / already ended. */
  turnId: string | null
  text: string
}

/**
 * `engine:getActive` speaks in engine kinds; the decision only cares whether
 * steering exists. `none` is still "some other path", never Codex.
 */
export function engineFromActiveEngine(
  kind: 'codex' | 'claude' | 'none' | null | undefined,
): SteerEngine {
  if (kind === 'codex') return 'codex'
  if (kind === 'claude') return 'other'
  return 'unknown'
}

/**
 * Decide between a normal send, a steer of the live turn, or leaving the
 * composer alone.
 *
 * Order matters: `isStreaming` is checked before the turn id, so a turn that
 * ended while the user was typing falls back to a normal send even though a
 * stale turn id is still in hand. A turn id that is present but belongs to a
 * finished turn must never be steered — the engine would reject it and the
 * guidance would be lost.
 */
export function decideSend(input: SteerDecisionInput): SteerDecision {
  if (!input.text.trim()) return { action: 'blocked', reason: 'empty' }
  if (!input.isStreaming) return { action: 'send' }
  if (input.engine !== 'codex') return { action: 'blocked', reason: 'engine-unsupported' }
  if (!input.turnId) return { action: 'blocked', reason: 'turn-not-identified' }
  return { action: 'steer', turnId: input.turnId }
}
