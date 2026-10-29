/**
 * Where a scheduled job was drafted from, when it was drafted from a
 * conversation.
 *
 * The three fields mirror the ones a workflow carries (`Workflow` in the
 * renderer's prefs): `sourceConversation`, `sourceTitle`, `sourceDraftedAt`.
 * They exist so a settings row can say which conversation a schedule came from
 * even after that conversation was closed — and, deliberately, so it can say
 * nothing at all when the job was typed in Settings or predates the field.
 *
 * Absent means "not drafted from a conversation", never "drafted from an
 * unknown one". That is why every field is optional and why a malformed value
 * is dropped instead of coerced: an id of '' would turn "hand-made" into a
 * provenance line pointing at nothing.
 */

/** Longest stored conversation id. Ids are short; this only bounds a corrupt file. */
export const MAX_SOURCE_CONVERSATION_CHARS = 200
/** Longest title snapshot. The title is display text, not an identifier. */
export const MAX_SOURCE_TITLE_CHARS = 200
/** `YYYY-MM-DD` is ten characters; the bound leaves room for a future stamp shape. */
export const MAX_SOURCE_DRAFTED_AT_CHARS = 32

/** The provenance fields as they live on an `AutomationJob`. */
export interface AutomationJobProvenance {
  /** Stored conversation id; absent for a hand-made job. */
  sourceConversation?: string
  /** The conversation's title at drafting time — a snapshot, not a live lookup. */
  sourceTitle?: string
  /** Local calendar day (`YYYY-MM-DD`) the draft was created. */
  sourceDraftedAt?: string
}

/**
 * One provenance string, or `undefined` when it is unusable.
 *
 * Only strings are accepted — a number or an object is not trimmed into text.
 * Over-length is refused rather than sliced: a truncated id would point at a
 * different conversation, and a truncated title is a fact the reader cannot
 * tell from the real one. Both are worse than no line at all.
 */
function provenanceText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text || text.length > maxChars) return undefined
  return text
}

/**
 * The provenance a create request may store, and the provenance a stored job
 * may keep after a hand edit.
 *
 * One function for both paths so a value that survives a save cannot be
 * rejected on the next launch (or vice versa). Everything is independent: a
 * malformed title drops the title and keeps the id, because a partial origin is
 * still a true one.
 */
export function normalizeJobProvenance(value: unknown): AutomationJobProvenance {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const sourceConversation = provenanceText(raw.sourceConversation, MAX_SOURCE_CONVERSATION_CHARS)
  const sourceTitle = provenanceText(raw.sourceTitle, MAX_SOURCE_TITLE_CHARS)
  // The stamp is a local calendar day, written by `localDateStamp()`. Checking
  // its shape here is what keeps a hand-edited "sometime in October" from being
  // rendered next to a conversation as if it were the day it was drafted.
  const dated = provenanceText(raw.sourceDraftedAt, MAX_SOURCE_DRAFTED_AT_CHARS)
  const sourceDraftedAt = dated && /^\d{4}-\d{2}-\d{2}$/.test(dated) ? dated : undefined
  return {
    ...(sourceConversation ? { sourceConversation } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(sourceDraftedAt ? { sourceDraftedAt } : {}),
  }
}
