/**
 * "This was drafted from a conversation" — one derivation shared by the skill
 * detail and the workflow detail.
 *
 * A stored conversation id is the only thing that makes a provenance line
 * meaningful: without one there is nothing to point back to, so both surfaces
 * render nothing rather than an "unknown source". Title and date stay optional
 * because older or partially edited artefacts may carry only some of it.
 */

import type { SessionListItem } from '../types/app.types'

export type ProvenanceVariant = 'titled' | 'titledNoDate' | 'untitled' | 'untitledNoDate'

/**
 * - `none` — no stored conversation id: render nothing.
 * - `gone` — the id is not in the current session list: say so, text only.
 * - `live` — the id is listed and its row carries a trustworthy directory:
 *   the line becomes a link back to the conversation.
 * - `unlinked` — the id is listed but no directory may be trusted: the line is
 *   still true, but opening would have to guess a working directory, so it
 *   stays plain text.
 */
export type ProvenanceKind = 'none' | 'gone' | 'live' | 'unlinked'

export interface ProvenanceFields {
  sessionId?: string | null
  title?: string | null
  date?: string | null
}

export interface ProvenanceState {
  kind: ProvenanceKind
  /** Which of the four wording cases the line is in; null only for `none`. */
  variant: ProvenanceVariant | null
  /** Values for the wording's `{{placeholders}}`; empty for `untitledNoDate`. */
  params: Record<string, string>
  /** The listed row to reopen, when the conversation is still there. */
  session: SessionListItem | null
  /** Directory safe to pass to `openSessionCore`; '' when none is trustworthy. */
  directory: string
}

/**
 * The directory a stored conversation may be reopened in, or '' when there is
 * none worth trusting.
 *
 * This is `revealSessionEvidence.ts`'s rule applied to a list row. A search hit
 * exposes the engine, so only a Codex hit's `project` is trusted: Claude's
 * `project` is a decoded slug (`D:\work\my-app` -> `D:\work\my\app`), and
 * writing that back as `workingDir` breaks the next message and survives a
 * restart. A list row carries the same distinction as `cwd` — only the engine
 * that reports a real directory fills it in (Codex does), while Claude rows
 * leave it empty and keep the slug in `project`. So the rule stays "trust the
 * engine-reported directory, never the slug", and only while it is absolute.
 */
/**
 * Provenance fields cross a JSON boundary — prefs for workflows, a parsed
 * frontmatter for skills — so a hand-edited file can put a number where a
 * string belongs. Reading only strings keeps one such field from throwing a
 * detail page; a malformed value is treated as absent, as everywhere else.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function trustedSessionDirectory(session: SessionListItem): string {
  const cwd = asText(session.cwd)
  if (!cwd) return ''
  if (/^[a-zA-Z]:[\\/]/.test(cwd)) return cwd
  if (cwd.startsWith('\\\\') || cwd.startsWith('//')) return cwd
  if (cwd.startsWith('/')) return cwd
  return ''
}

const NONE: ProvenanceState = {
  kind: 'none',
  variant: null,
  params: {},
  session: null,
  directory: '',
}

/**
 * Turn provenance fields plus the current session list into what the line
 * should say and whether it may be clicked.
 *
 * Pure so both surfaces cannot drift apart, and so the four wording cases and
 * the "no longer in your history" case are testable without a DOM.
 */
export function describeProvenance(
  fields: ProvenanceFields,
  sessions: readonly SessionListItem[],
): ProvenanceState {
  const sessionId = asText(fields.sessionId)
  if (!sessionId) return NONE

  const title = asText(fields.title)
  const date = asText(fields.date)
  const variant: ProvenanceVariant = title
    ? (date ? 'titled' : 'titledNoDate')
    : (date ? 'untitled' : 'untitledNoDate')
  const params: Record<string, string> = title
    ? (date ? { title, date } : { title })
    : (date ? { date } : {})

  const session = sessions.find(row => row.sessionId === sessionId) ?? null
  if (!session) {
    return { kind: 'gone', variant, params, session: null, directory: '' }
  }

  const directory = trustedSessionDirectory(session)
  return { kind: directory ? 'live' : 'unlinked', variant, params, session, directory }
}

/**
 * Where a workflow drafted from a conversation came from.
 *
 * Mirrors the skill rule: a conversation that was never stored has no id, so
 * nothing is recorded — a dead id would be worse than an empty line. An
 * optional title is omitted rather than guessed, and the date is the local
 * calendar day the draft was saved (`localDateStamp`), not an instant.
 */
export interface WorkflowProvenanceFields {
  sourceConversation?: string
  sourceTitle?: string
  sourceDraftedAt?: string
}

export function workflowProvenance(
  sessionId: string | null | undefined,
  title: string | null | undefined,
  draftedAt: string,
): WorkflowProvenanceFields {
  const id = sessionId?.trim() ?? ''
  if (!id) return {}
  const cleanTitle = title?.trim() ?? ''
  const date = draftedAt.trim()
  return {
    // The id is a bare scalar, not free text: collapsing whitespace keeps a
    // malformed id from being mistaken for a title or a second field.
    sourceConversation: id.replace(/\s+/g, ' '),
    ...(cleanTitle ? { sourceTitle: cleanTitle } : {}),
    ...(date ? { sourceDraftedAt: date } : {}),
  }
}
