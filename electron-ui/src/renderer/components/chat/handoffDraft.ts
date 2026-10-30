// Draft the note that travels with a conversation handed to another department.
//
// The note is built only from verbatim excerpts of the transcript. It names the
// source, never a destination folder: a department is a processor, and the work
// stays in its task directory. There is no
// model call and no summarising: a fabricated summary would read like the
// source department's own words while silently dropping the caveats that made
// them true. Excerpts, provenance and the "you have no context" line are the
// whole honest payload.
//
// This module is deliberately React-free and side-effect-free so a harness can
// bundle and exercise it without Electron or a DOM.

import type { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { isHumanTurn } from '../../lib/sessionReuse'

/** The composer's own limit; the dialog also sets it as the textarea's maxLength. */
export const HANDOFF_MAX_CHARS = 4000

/** Per-excerpt caps. A long turn is quoted, never dumped whole. */
const FIRST_REQUEST_CAP = 800
const LATEST_REQUEST_CAP = 800
const LATEST_REPLY_CAP = 1600

/**
 * Cap for a provenance value (title, folder, path, id) that sits outside the
 * excerpt budgets. Without it a pasted 100 KB title or an absurd folder path
 * could push the fixed part of the note past HANDOFF_MAX_CHARS, and the final
 * truncation would silently cut the "no context" line off the end — the one
 * line the receiver must always see.
 */
const INLINE_FIELD_CAP = 160

export interface HandoffExcerpt {
  text: string
  /** True when this excerpt was shortened to its per-section cap. */
  clipped: boolean
}

export interface HandoffDraft {
  firstRequest: HandoffExcerpt | null
  /** The last request, or null when it repeats `firstRequest` verbatim. */
  latestRequest: HandoffExcerpt | null
  latestReply: HandoffExcerpt | null
  sourceTitle: string | null
  sourceSessionId: string | null
  sourceDirectory: string
  sourceDeptPath: string | null
  targetLabel: string
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  /** True when at least one excerpt hit its cap. */
  clipped: boolean
}

export interface BuildHandoffDraftInput {
  messages: ChatMessage[]
  sourceTitle?: string | null
  sourceSessionId?: string | null
  sourceDirectory?: string
  sourceDeptPath?: string | null
  targetLabel: string
  /** Epoch ms; the harness passes a fixed value so the date is stable. */
  now?: number
}

/**
 * One string per section. The dialog supplies them from `t(...)`; `{{name}}`
 * placeholders are filled here so a translator can reorder the sentence.
 */
export interface HandoffLabels {
  heading: string
  sourceTitle: string
  untitled: string
  sourceSession: string
  sourceDept: string
  unfiled: string
  sourceFolder: string
  folderUnknown: string
  date: string
  firstRequest: string
  latestRequest: string
  latestReply: string
  closing: string
  noContext: string
  cutNote: string
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

/**
 * Cut to at most `max` UTF-16 units, ending with `…` when anything was lost.
 * The budget is measured in UTF-16 units because that is what the composer's
 * maxLength and `String.length` use; a surrogate pair is never split, so a cut
 * emoji disappears whole instead of becoming a lone half.
 */
function truncate(text: string, max: number): { text: string; clipped: boolean } {
  if (max <= 0) return { text: '', clipped: text.length > 0 }
  if (text.length <= max) return { text, clipped: false }
  // One unit is reserved for the ellipsis, so a truncated excerpt still fits
  // the same budget the untruncated one was allowed.
  let cut = max - 1
  if (cut > 0 && isHighSurrogate(text.charCodeAt(cut - 1)) && isLowSurrogate(text.charCodeAt(cut))) {
    cut -= 1
  }
  return { text: `${text.slice(0, cut)}…`, clipped: true }
}

function excerpt(text: string, cap: number): HandoffExcerpt {
  const clipped = truncate(text, cap)
  return { text: clipped.text, clipped: clipped.clipped }
}

/**
 * The text a row contributes, or null when the row is not model output or a
 * human ask. Notices and retrieved history answers are not the conversation;
 * a half-streamed row is not a sentence yet.
 */
function candidateText(message: ChatMessage): string | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null
  const standard = message as StandardChatMessage
  const content = standard.content
  if (typeof content !== 'string' || !content.trim()) return null
  if (standard.hookNotice || standard.historyAsk || standard.isStreaming) return null
  return content
}

function localDate(now: number): string {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

/** A provenance value reduced to the space the fixed part of the note can spare. */
function field(value: string): string {
  return truncate(value, INLINE_FIELD_CAP).text
}

export function buildHandoffDraft(input: BuildHandoffDraftInput): HandoffDraft {
  const userTexts: string[] = []
  const assistantTexts: string[] = []
  let firstUser: string | null = null
  let firstHuman: string | null = null

  for (const message of input.messages) {
    const text = candidateText(message)
    if (text === null) continue
    if (message.role === 'user') {
      userTexts.push(text)
      if (firstUser === null) firstUser = text
      // A harness echo (slash command, shell round-trip) is a `user` row but
      // not something the user asked. Prefer the first real ask; fall back to
      // the first user row because the text is still theirs.
      if (firstHuman === null && isHumanTurn(text)) firstHuman = text
    } else {
      assistantTexts.push(text)
    }
  }

  const firstText = firstHuman ?? firstUser
  const firstRequest = firstText === null ? null : excerpt(firstText, FIRST_REQUEST_CAP)

  // The latest request is useful only when it says something new. Compare
  // trimmed text so trailing whitespace from a stream cannot create a
  // duplicate section. Prefer the last real human turn, exactly as the first
  // request does: a harness echo after the last ask (a slash command, a
  // resumed-session banner) is not where the work stands. Only when every user
  // row is an echo does the fallback quote one — the text is still theirs.
  const lastDistinct = (texts: string[]): string | null => {
    for (let i = texts.length - 1; i >= 0; i--) {
      if (texts[i].trim() !== firstText?.trim()) return texts[i]
    }
    return null
  }
  const latestText = firstText === null
    ? null
    : lastDistinct(userTexts.filter(isHumanTurn)) ?? lastDistinct(userTexts)
  const latestRequest = latestText === null ? null : excerpt(latestText, LATEST_REQUEST_CAP)

  const replyText = assistantTexts.length > 0 ? assistantTexts[assistantTexts.length - 1] : null
  const latestReply = replyText === null ? null : excerpt(replyText, LATEST_REPLY_CAP)

  return {
    firstRequest,
    latestRequest,
    latestReply,
    sourceTitle: clean(input.sourceTitle),
    sourceSessionId: clean(input.sourceSessionId),
    sourceDirectory: input.sourceDirectory ?? '',
    sourceDeptPath: clean(input.sourceDeptPath),
    targetLabel: input.targetLabel,
    date: localDate(input.now ?? Date.now()),
    clipped: !!(
      firstRequest?.clipped ||
      latestRequest?.clipped ||
      latestReply?.clipped
    ),
  }
}

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => params[name] ?? match)
}

/** Render one excerpt section, honouring a shrinking budget. */
function section(label: string, excerptValue: HandoffExcerpt | null, budget: number): string | null {
  if (!excerptValue || budget <= 0) return null
  const body = truncate(excerptValue.text, budget).text
  return body ? `${label}\n${body}` : null
}

/**
 * Assemble the note. `budgets` are UTF-16 unit allowances for the three
 * excerpts; when the full note is too long they are reduced in priority order
 * (reply, then latest request, then first request) until it fits.
 */
function compose(
  draft: HandoffDraft,
  labels: HandoffLabels,
  budgets: { first: number; latest: number; reply: number },
): { text: string; cut: boolean } {
  const targetLabel = field(draft.targetLabel)
  // Deliberately no target folder: a department is a processor, and a handoff
  // moves attribution, not work. Naming a directory here would tell the receiver
  // to run somewhere the task does not own.
  const blocks: string[] = [
    fill(labels.heading, { target: targetLabel }),
  ]

  const provenance: string[] = [
    fill(labels.sourceTitle, {
      title: draft.sourceTitle ? field(draft.sourceTitle) : labels.untitled,
    }),
  ]
  if (draft.sourceSessionId) {
    provenance.push(fill(labels.sourceSession, { id: field(draft.sourceSessionId) }))
  }
  provenance.push(
    draft.sourceDeptPath
      ? fill(labels.sourceDept, { path: field(draft.sourceDeptPath) })
      // The listing is the only authority on filing. A conversation absent
      // from it must say so rather than imply a department it might not have.
      : labels.unfiled,
  )
  provenance.push(
    fill(labels.sourceFolder, {
      path: draft.sourceDirectory ? field(draft.sourceDirectory) : labels.folderUnknown,
    }),
  )
  provenance.push(fill(labels.date, { date: draft.date }))
  blocks.push(provenance.join('\n'))

  const firstSection = section(labels.firstRequest, draft.firstRequest, budgets.first)
  if (firstSection) blocks.push(firstSection)
  const latestSection = section(labels.latestRequest, draft.latestRequest, budgets.latest)
  if (latestSection) blocks.push(latestSection)
  const replySection = section(labels.latestReply, draft.latestReply, budgets.reply)
  if (replySection) blocks.push(replySection)

  blocks.push(fill(labels.closing, { target: targetLabel }))
  // Never optional: this is the line that keeps the receiver from pretending
  // to remember a conversation it never saw.
  blocks.push(labels.noContext)

  const firstCut = !!draft.firstRequest && budgets.first < draft.firstRequest.text.length
  const latestCut = !!draft.latestRequest && budgets.latest < draft.latestRequest.text.length
  const replyCut = !!draft.latestReply && budgets.reply < draft.latestReply.text.length
  const cut = draft.clipped || firstCut || latestCut || replyCut
  if (cut) blocks.push(labels.cutNote)

  return { text: blocks.join('\n\n'), cut }
}

/**
 * The exact text the dialog prefills. Guaranteed to be no longer than
 * HANDOFF_MAX_CHARS, labels included.
 */
export function renderHandoffText(draft: HandoffDraft, labels: HandoffLabels): string {
  const budgets = {
    first: draft.firstRequest?.text.length ?? 0,
    latest: draft.latestRequest?.text.length ?? 0,
    reply: draft.latestReply?.text.length ?? 0,
  }

  let rendered = compose(draft, labels, budgets)
  // Shrink in the order the receiver can most afford to lose: the reply is
  // supporting evidence, the requests are what the work was actually asked to
  // be. Stop as soon as the note fits.
  while (rendered.text.length > HANDOFF_MAX_CHARS) {
    const excess = rendered.text.length - HANDOFF_MAX_CHARS
    if (budgets.reply > 0) {
      budgets.reply = Math.max(0, budgets.reply - excess)
    } else if (budgets.latest > 0) {
      budgets.latest = Math.max(0, budgets.latest - excess)
    } else if (budgets.first > 0) {
      budgets.first = Math.max(0, budgets.first - excess)
    } else {
      break
    }
    rendered = compose(draft, labels, budgets)
  }

  // Labels are normally short, but the cap is unconditional: a translated
  // string or an absurd folder path must not be able to overflow the composer.
  return truncate(rendered.text, HANDOFF_MAX_CHARS).text
}
