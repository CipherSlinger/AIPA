/**
 * The receipt for one turn's `<memory_context>` block.
 *
 * `useStreamJson` prepends up to five memory tiers to every prompt, but the
 * transcript never showed that this happened. A desktop agent that maintains
 * memory on the user's behalf owes them the disclosure: the user should be
 * able to read, verbatim, what was handed to the model about them.
 *
 * Two rules shape this module:
 *
 * 1. Memory is a bonus, never a precondition. Assembly used to run without a
 *    try/catch at the call site, so one unreadable file aborted the whole send
 *    before it reached the bridge. `assembleTurnMemoryForSend` contains that
 *    failure and reports it on the row instead.
 * 2. The row may only claim what was *given*, never what was *used*. A receipt
 *    is a description of the prompt block, not evidence that the model acted
 *    on it. `summarizeMemoryReceipt` is the single place that decides what the
 *    row is allowed to say — including "nothing at all" for a missing,
 *    malformed, or empty receipt, so a row loaded from disk never turns into
 *    "this turn carried no memory".
 */
import type { MemoryContextResult, MemoryUnreadableEntry } from '../hooks/promptMemory'

/** What one turn was handed as memory context. */
export interface MemoryTurnReceipt {
  /** Tier ids that made it into the block, in the assembler's own order. */
  applied: string[]
  /** Tier ids that existed but were dropped by the budget. */
  omitted: string[]
  /** Characters of content that survived per tier. */
  used: Record<string, number>
  /** Length of the exact block that was prepended, in characters. */
  chars: number
  /** The block itself, so the row can show it verbatim. */
  text: string
  /** Paths that existed but could not be read. Never part of `text`. */
  unreadable: MemoryUnreadableEntry[]
  /** The thrown message when assembly failed; the turn ran without memory. */
  failed?: string
}

/**
 * Assemble this turn's memory block without letting a failure kill the turn.
 *
 * The assembler is injected so the failure path is provable without a DOM or
 * Electron: `assemble: () => { throw new Error('disk on fire') }` is the whole
 * test. Any throw becomes a receipt with `failed` set and empty text — the
 * caller sends the prompt with no memory block rather than not at all.
 *
 * A `null` receipt means "this turn carried no memory block", which is a
 * different statement from "you were told nothing"; the row renders nothing
 * for it rather than an empty disclosure line.
 */
export async function assembleTurnMemoryForSend(input: {
  assemble: () => Promise<MemoryContextResult>
}): Promise<{ text: string; receipt: MemoryTurnReceipt | null }> {
  let result: MemoryContextResult
  try {
    result = await input.assemble()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      text: '',
      receipt: {
        applied: [],
        omitted: [],
        used: {},
        chars: 0,
        text: '',
        unreadable: [],
        // An Error with an empty message would render an empty tooltip; keep
        // the failure truthful rather than blank.
        failed: message || 'memory assembly failed',
      },
    }
  }

  // The assembler is typed, but it can be an injected fake (harness) or a
  // future remote result with missing fields; never let that reach the row as
  // a malformed receipt.
  const text = typeof result?.text === 'string' ? result.text : ''
  const applied = Array.isArray(result?.applied) ? result.applied.map(String) : []
  const omitted = Array.isArray(result?.omitted) ? result.omitted.map(String) : []
  const unreadable = Array.isArray(result?.unreadable) ? result.unreadable : []
  const used: Record<string, number> = {}
  if (result?.used && typeof result.used === 'object') {
    for (const [tier, chars] of Object.entries(result.used)) {
      if (typeof chars === 'number' && Number.isFinite(chars)) used[tier] = chars
    }
  }

  const receipt: MemoryTurnReceipt = {
    applied,
    omitted,
    used,
    chars: text.length,
    text,
    unreadable,
  }

  // Nothing was applied, dropped, read or failed: there is no block, and a
  // receipt would only produce a line that implies one exists.
  const empty = applied.length === 0
    && omitted.length === 0
    && text.trim() === ''
    && unreadable.length === 0
  return { text, receipt: empty ? null : receipt }
}

/** What the row is allowed to say about a receipt. */
export interface MemoryReceiptSummary {
  kind: 'absent' | 'told' | 'failed'
  applied: string[]
  omitted: string[]
  unreadableCount: number
  chars: number
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>)
    .every(item => typeof item === 'number' && Number.isFinite(item))
}

function isUnreadableArray(value: unknown): value is MemoryUnreadableEntry[] {
  return Array.isArray(value) && value.every(entry =>
    Boolean(entry)
    && typeof entry === 'object'
    && typeof (entry as { path?: unknown }).path === 'string',
  )
}

/**
 * Decide what a row may claim from a receipt.
 *
 * Anything that does not have the full expected shape — an older receipt from
 * a build that lacked a field, a hand-edited transcript, a value that is a
 * string where a number belongs — degrades to `absent`. Guessing at a
 * half-known receipt would let the row invent tiers the assembler never
 * applied; silence is the only honest fallback.
 */
export function summarizeMemoryReceipt(
  receipt: MemoryTurnReceipt | null | undefined,
): MemoryReceiptSummary {
  const absent = (): MemoryReceiptSummary => ({
    kind: 'absent',
    applied: [],
    omitted: [],
    unreadableCount: 0,
    chars: 0,
  })

  if (!receipt || typeof receipt !== 'object') return absent()
  const raw = receipt as unknown as Record<string, unknown>

  if (typeof raw.text !== 'string') return absent()
  if (!isStringArray(raw.applied)) return absent()
  if (!isStringArray(raw.omitted)) return absent()
  if (!isNumberRecord(raw.used)) return absent()
  if (!isUnreadableArray(raw.unreadable)) return absent()
  if (typeof raw.chars !== 'number' || !Number.isFinite(raw.chars) || raw.chars < 0) return absent()
  if (raw.failed !== undefined && typeof raw.failed !== 'string') return absent()

  const unreadableCount = raw.unreadable.length

  // A failed assembly applied nothing, whatever the rest of the receipt says.
  // Reporting tiers here would claim memory the model never received.
  if (typeof raw.failed === 'string' && raw.failed.trim() !== '') {
    return {
      kind: 'failed',
      applied: [],
      omitted: [],
      unreadableCount: 0,
      chars: 0,
    }
  }

  const text = raw.text as string
  const applied = raw.applied as string[]
  const omitted = raw.omitted as string[]

  // Nothing was given and nothing failed: a receipt that only remembers tiers
  // dropped by the budget has no disclosure to make. Unreadable paths stay
  // reportable on their own — that is a fact about the user's files, not a
  // claim about the prompt.
  if (applied.length === 0 && text.trim() === '' && unreadableCount === 0) {
    return absent()
  }

  return {
    kind: 'told',
    applied,
    omitted,
    unreadableCount,
    chars: raw.chars as number,
  }
}
