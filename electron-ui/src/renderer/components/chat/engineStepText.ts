/**
 * Codex item kinds the transcript used to drop.
 *
 * `codex-bridge.ts` translates the item kinds the rich cards understand
 * (commands, edits, MCP calls, plan updates, reasoning, answer text) into the
 * existing `toolUse` / `toolResult` / `textDelta` events. Everything else is
 * forwarded verbatim as `cli:itemStarted` / `cli:itemCompleted`, and until this
 * wave the renderer had no case for those channels — so a `sleep`,
 * `contextCompaction` or sub-agent item left no trace at all.
 *
 * This module is deliberately dependency-free and pure: it classifies one
 * protocol item into a descriptor the transcript can render, groups adjacent
 * descriptors from the same turn, and places the groups between messages. The
 * stateful log and the React binding live in `engineStepLog.ts` /
 * `useEngineSteps.ts`.
 *
 * Truthfulness rules baked into the descriptors:
 *   - a label names only what the item itself says it is doing; status is
 *     never upgraded to success/failure, and result text is never paraphrased
 *     into a claim the payload cannot support;
 *   - fields that are optional on the wire (tool name, result count, duration)
 *     only change the label when they are actually present;
 *   - an unrecognised (future) kind still produces a generic row carrying the
 *     raw kind, so a newer engine can never make a turn look like it did
 *     nothing.
 */

export type EngineStepPhase = 'started' | 'completed'

export interface EngineStep {
  /** Protocol item id. Repeated lifecycle events update the same row. */
  id: string
  /** Raw discriminant, kept for the generic fallback and debugging. */
  kind: string
  /** i18n key for the single-line label. */
  labelKey: string
  /** Parameters for `labelKey` (only values quoted from the payload). */
  labelParams?: Record<string, string | number>
  /** Optional i18n key for the row's `title` (explains protocol terms). */
  hintKey?: string
  /** Only set when `labelKey` is the generic fallback. */
  rawKind?: string
  phase: EngineStepPhase
  /** Turn bucket assigned by the log; grouping never crosses it. */
  turn: number
  timestamp: number
}

export interface EngineStepGroup {
  /** Stable React key: turn + position + first item id. */
  key: string
  turn: number
  startTs: number
  steps: EngineStep[]
}

/** Kinds that already have a dedicated rendered path, so a quiet row would
 *  duplicate visible transcript content (or, for `userMessage`, the user's own
 *  bubble). Keep this list aligned with `_handleItemEvent` in codex-bridge. */
const SKIPPED_KINDS = new Set([
  'userMessage',
  'agentMessage',
  'message',
  'reasoning',
  'agentReasoning',
])

/**
 * Kinds `codex-bridge` normally turns into a rich tool card. They should only
 * reach the item channels if the bridge stops translating them; when they do,
 * the caller checks whether a card with the same item id exists and drops the
 * duplicate quiet row.
 */
export const TOOL_CARD_KINDS = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'webSearch',
  'imageView',
])

const MAX_QUOTED_LENGTH = 48
let anonSeq = 0

/**
 * Shorten a quoted payload value for a single-line row. Newlines/backticks are
 * flattened so a tool name can never break the row's inline formatting.
 */
export function compactQuote(value: unknown): string {
  if (typeof value !== 'string') return ''
  const flat = value.replace(/\s+/g, ' ').replace(/`/g, "'").trim()
  if (!flat) return ''
  return flat.length > MAX_QUOTED_LENGTH ? `${flat.slice(0, MAX_QUOTED_LENGTH - 1)}…` : flat
}

/** Render a duration the engine reported. No rounding into a new claim: raw
 *  milliseconds are shown below one second, tenths above. */
export function formatStepDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) {
    const secs = Math.round(ms / 100) / 10
    return `${Number.isInteger(secs) ? secs : secs.toFixed(1)}s`
  }
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

type Descriptor = Pick<EngineStep, 'labelKey' | 'labelParams' | 'hintKey' | 'rawKind'>

/**
 * Map one item payload (`{ sessionId, item }`) to a descriptor, or `null` when
 * the payload is malformed or the kind is already rendered elsewhere.
 *
 * Never throws: every field is read through `typeof` checks because item
 * shapes vary between engine builds and older replayed sessions.
 */
export function describeEngineItem(
  phase: EngineStepPhase,
  payload: unknown,
  now: number = Date.now(),
): EngineStep | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const item = (payload as { item?: unknown }).item
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const record = item as Record<string, unknown>

  const kind = typeof record.type === 'string' ? record.type.trim() : ''
  if (!kind) return null
  if (SKIPPED_KINDS.has(kind)) return null

  const id = typeof record.id === 'string' && record.id ? record.id : `anon-${now}-${++anonSeq}`
  const descriptor = describeKind(kind, record)

  return {
    id,
    kind,
    ...descriptor,
    phase,
    // The log overwrites this with the bucket's current turn.
    turn: 0,
    timestamp: now,
  }
}

function describeKind(kind: string, item: Record<string, unknown>): Descriptor {
  switch (kind) {
    case 'hookPrompt':
      return {
        labelKey: 'chat.engineStep.hookPrompt',
        hintKey: 'chat.engineStep.hookPromptHint',
      }

    case 'commandExecution':
      return { labelKey: 'chat.engineStep.command' }

    case 'fileChange': {
      const count = Array.isArray(item.changes) ? item.changes.length : 0
      if (count <= 0) return { labelKey: 'chat.engineStep.fileChangePlain' }
      return {
        labelKey: count === 1
          ? 'chat.engineStep.fileChangeOne'
          : 'chat.engineStep.fileChangeOther',
        labelParams: { count },
      }
    }

    case 'mcpToolCall': {
      const tool = compactQuote(item.tool)
      return tool
        ? {
            labelKey: 'chat.engineStep.mcpTool',
            labelParams: { tool },
            hintKey: 'chat.engineStep.mcpToolHint',
          }
        : { labelKey: 'chat.engineStep.mcpToolPlain', hintKey: 'chat.engineStep.mcpToolHint' }
    }

    case 'dynamicToolCall': {
      const tool = compactQuote(item.tool)
      return tool
        ? { labelKey: 'chat.engineStep.dynamicTool', labelParams: { tool } }
        : { labelKey: 'chat.engineStep.dynamicToolPlain' }
    }

    case 'webSearch': {
      const count = Array.isArray(item.results) ? item.results.length : 0
      return count > 0
        ? {
            labelKey: 'chat.engineStep.webSearchResults',
            labelParams: { count },
          }
        : { labelKey: 'chat.engineStep.webSearch' }
    }

    case 'plan':
      return { labelKey: 'chat.engineStep.plan' }

    case 'imageView':
      return { labelKey: 'chat.engineStep.imageView' }

    case 'collabAgentToolCall': {
      const tool = compactQuote(item.tool)
      return tool
        ? {
            labelKey: 'chat.engineStep.collabAgent',
            labelParams: { tool },
            hintKey: 'chat.engineStep.collabAgentHint',
          }
        : { labelKey: 'chat.engineStep.collabAgentPlain', hintKey: 'chat.engineStep.collabAgentHint' }
    }

    case 'subAgentActivity':
      switch (item.kind) {
        case 'started':
          return { labelKey: 'chat.engineStep.subAgentStarted' }
        case 'interacted':
          return { labelKey: 'chat.engineStep.subAgentInteracted' }
        case 'interrupted':
          return { labelKey: 'chat.engineStep.subAgentInterrupted' }
        default:
          // A future activity kind is still a sub-agent step; say that much
          // without guessing what the new kind means.
          return { labelKey: 'chat.engineStep.subAgentPlain' }
      }

    case 'sleep': {
      const duration = typeof item.durationMs === 'number'
        ? formatStepDuration(item.durationMs)
        : ''
      return duration
        ? { labelKey: 'chat.engineStep.sleep', labelParams: { duration } }
        : { labelKey: 'chat.engineStep.sleepPlain' }
    }

    case 'imageGeneration':
      return { labelKey: 'chat.engineStep.imageGeneration' }

    case 'enteredReviewMode':
      return { labelKey: 'chat.engineStep.enteredReview' }

    case 'exitedReviewMode':
      return { labelKey: 'chat.engineStep.exitedReview' }

    case 'contextCompaction':
      return { labelKey: 'chat.engineStep.contextCompaction' }

    default:
      return {
        labelKey: 'chat.engineStep.generic',
        hintKey: 'chat.engineStep.genericHint',
        rawKind: kind,
      }
  }
}

/**
 * Collapse adjacent steps from the same turn. A group of one renders as its
 * own label; a group of two or more renders under one "N engine steps" row.
 *
 * Two things always split a group:
 *   - a turn boundary, because the transcript may not contain a visible
 *     message that separated them;
 *   - a visible message whose timestamp falls *between* two steps. Without
 *     this, a group would be placed before that message (placement uses the
 *     first step's timestamp) and a later step would appear out of order.
 */
export function groupEngineSteps(
  steps: readonly EngineStep[],
  messageTimestamps: readonly number[] = [],
): EngineStepGroup[] {
  const groups: EngineStepGroup[] = []
  let current: EngineStepGroup | null = null
  let messageCursor = 0
  let previousTs = Number.NEGATIVE_INFINITY

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue
    while (messageCursor < messageTimestamps.length && messageTimestamps[messageCursor] <= previousTs) {
      messageCursor += 1
    }
    const messageBetween =
      messageCursor < messageTimestamps.length && messageTimestamps[messageCursor] < step.timestamp

    if (current && current.turn === step.turn && !messageBetween) {
      current.steps.push(step)
    } else {
      current = {
        key: `engine-${step.turn}-${groups.length}-${step.id}`,
        turn: step.turn,
        startTs: step.timestamp,
        steps: [step],
      }
      groups.push(current)
    }
    previousTs = step.timestamp
  }

  return groups
}

/**
 * Decide where each group belongs in the transcript.
 *
 * A group is inserted before the first visible message whose timestamp is at
 * or after the group's first step. If no such message exists it follows the
 * last message. The result is a sparse map keyed by message index so the list
 * builder can insert rows in the same single pass it already uses.
 */
export function placeEngineStepGroups(
  groups: readonly EngineStepGroup[],
  messageTimestamps: readonly number[],
): Map<number, EngineStepGroup[]> {
  const placements = new Map<number, EngineStepGroup[]>()
  for (const group of groups) {
    let at = messageTimestamps.findIndex(ts => ts >= group.startTs)
    if (at < 0) at = messageTimestamps.length
    const bucket = placements.get(at)
    if (bucket) bucket.push(group)
    else placements.set(at, [group])
  }
  return placements
}
