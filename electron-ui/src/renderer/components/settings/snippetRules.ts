// Pure validation for text snippets (wave 83A).
//
// The chat composer expands `::keyword` with the regex in useInputPopups.ts:
// `::(\w*)$`. Everything a user can create must be reachable through that
// regex, so this module is the one place that decides what a keyword may be.
// Keeping it out of React means the Settings form, the popup and any future
// importer (backup restore, preset packs) can share the same answer.

import type { TextSnippet } from '../../types/app.types'

/** Mirrors the `textSnippets (max 50)` note on AppPrefs — one cap, not two. */
export const SNIPPET_LIMIT = 50

/** `\w{1,32}`: the trigger can only carry word characters, and 32 keeps the
 *  popup header and the ::badge from wrapping into the content line. */
export const SNIPPET_KEYWORD_MAX = 32

/** Long enough for a paragraph or a signature; short enough that expanding a
 *  snippet by accident is recoverable with one undo rather than a scroll. */
export const SNIPPET_CONTENT_MAX = 4000

/** The composer's own trigger shape. Kept exported so callers that only need
 *  "is this reachable?" do not have to run the full form validation. */
export const SNIPPET_KEYWORD_PATTERN = /^\w{1,32}$/

export type SnippetRefusalCode =
  | 'keyword_empty'
  | 'keyword_too_long'
  | 'keyword_invalid'
  | 'keyword_duplicate'
  | 'content_empty'
  | 'content_too_long'
  | 'limit_reached'

export interface SnippetValidationInput {
  keyword: string
  content: string
  /** Every snippet already stored, including the one being edited. */
  existing: readonly TextSnippet[]
  /** Set when editing: that row is not its own duplicate and may save at cap. */
  editingId?: string | null
}

export type SnippetValidation =
  | { ok: true; keyword: string; content: string }
  | {
      ok: false
      code: SnippetRefusalCode
      /** The normalized keyword, so a preview can show what was rejected. */
      keyword: string
      /** The trimmed content, for the same reason. */
      content: string
      /** Present for keyword_too_long / content_too_long / limit_reached. */
      max?: number
      /** Present for keyword_duplicate: the stored spelling of the owner. */
      existingKeyword?: string
    }

/**
 * Trim and drop every whitespace character.
 *
 * The composer trigger cannot contain whitespace — `::(\w*)$` stops at the
 * first space — so a keyword typed with a space would be creatable in Settings
 * but unreachable in chat. Removing the whitespace is the one normalization
 * that makes the same input work in both places; everything else about the
 * value is left alone for the shape check to accept or refuse.
 */
export function normalizeSnippetKeyword(raw: string): string {
  return raw.replace(/\s+/g, '').trim()
}

/**
 * Validate one snippet without touching storage. Returns a discriminated
 * result rather than throwing so the caller renders a message; no refusal is
 * ever silent (the old component returned early, which is the bug this
 * replaces).
 *
 * Cap is checked here, not only in the UI, so an import path that builds a
 * list cannot walk past 50 entries.
 */
export function validateSnippet(input: SnippetValidationInput): SnippetValidation {
  const keyword = normalizeSnippetKeyword(input.keyword)
  const content = input.content.trim()

  if (!keyword) {
    return { ok: false, code: 'keyword_empty', keyword, content }
  }
  if (keyword.length > SNIPPET_KEYWORD_MAX) {
    return { ok: false, code: 'keyword_too_long', keyword, content, max: SNIPPET_KEYWORD_MAX }
  }
  if (!SNIPPET_KEYWORD_PATTERN.test(keyword)) {
    return { ok: false, code: 'keyword_invalid', keyword, content }
  }

  // Case-insensitive: `::Sig` and `::sig` are the same trigger as far as the
  // composer filter is concerned, so two rows would be two identical rows.
  const owner = input.existing.find(
    s => s.keyword.toLowerCase() === keyword.toLowerCase() && s.id !== (input.editingId ?? null),
  )
  if (owner) {
    return {
      ok: false,
      code: 'keyword_duplicate',
      keyword,
      content,
      existingKeyword: owner.keyword,
    }
  }

  if (!input.editingId && input.existing.length >= SNIPPET_LIMIT) {
    return { ok: false, code: 'limit_reached', keyword, content, max: SNIPPET_LIMIT }
  }

  if (!content) {
    return { ok: false, code: 'content_empty', keyword, content }
  }
  if (content.length > SNIPPET_CONTENT_MAX) {
    return { ok: false, code: 'content_too_long', keyword, content, max: SNIPPET_CONTENT_MAX }
  }

  // Only leading/trailing whitespace is trimmed; internal spaces, tabs and
  // newlines are exactly what the user typed and are what gets inserted.
  return { ok: true, keyword, content }
}
