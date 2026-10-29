/**
 * Pure helpers for the "generalize this conversation" mode of the workflow
 * dialog.
 *
 * The model returns a *draft*, and a draft is only ever a proposal: these
 * helpers clamp it to the editor's own limits and turn its honesty fields
 * (`basis`, `assumptions`, `inputs`) into something the dialog can show. None
 * of them saves anything, and none of them invents content the model did not
 * return — an empty input list stays empty rather than being padded.
 */

import type {
  SessionGeneralizeError,
  SessionWorkflowDraftData,
  SessionWorkflowDraftMetaData,
} from '../../preload'
import {
  MAX_DESC_LENGTH,
  MAX_NAME_LENGTH,
  MAX_STEPS,
  MAX_STEP_PROMPT,
} from '../components/workflows/workflowConstants'

/** How many of the model's notes the panel shows; more than this is noise. */
export const MAX_ASSUMPTIONS = 6
export const MAX_INPUTS = 8

export interface EditorStep {
  id: string
  title: string
  prompt: string
  /** Set when the step text had to be cut to fit the editor's step limit. */
  promptTruncated?: boolean
  /**
   * Present only on generalised drafts. Absent means the step came from the
   * literal replay, where every step is something the user actually typed.
   */
  basis?: 'observed' | 'inferred'
}

export interface EditorWorkflow {
  name: string
  description: string
  icon: string
  steps: EditorStep[]
}

export interface AppliedWorkflowDraft {
  name: string
  description: string
  icon: string
  steps: EditorStep[]
  /** Steps the model returned beyond the editor's MAX_STEPS cap. */
  stepsDropped: number
}

export interface DraftNotes {
  assumptions: string[]
  inputs: string[]
  inferredCount: number
  observedCount: number
}

export interface MetaNote {
  key: 'full' | 'truncated'
  params: { count: number }
}

export type GeneralizeBlockReason = 'no_session' | 'streaming'

export interface GeneralizeAvailability {
  ok: boolean
  /** Why the mode is unavailable; absent when `ok` is true. */
  reason?: GeneralizeBlockReason
}

function clampText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

/**
 * Apply a model draft to the editor's fields.
 *
 * Step ids are derived from the position, not from the model, so React keys
 * stay stable and a dropped step never leaves a dangling id behind. A draft
 * with no name falls back to the name already in the editor; an empty
 * description is kept empty rather than filled with prose the model did not
 * write.
 */
export function applyDraft(
  current: EditorWorkflow,
  draft: SessionWorkflowDraftData,
): AppliedWorkflowDraft {
  const rawSteps = Array.isArray(draft?.steps) ? draft.steps : []
  const kept = rawSteps.slice(0, MAX_STEPS)
  const steps: EditorStep[] = kept.map((step, index) => {
    const rawPrompt = typeof step?.prompt === 'string' ? step.prompt.trim() : ''
    const promptTruncated = rawPrompt.length > MAX_STEP_PROMPT
    return {
      id: `gen-step-${index + 1}`,
      title: clampText(step?.title, MAX_NAME_LENGTH),
      prompt: rawPrompt.slice(0, MAX_STEP_PROMPT),
      basis: step?.basis === 'inferred' ? 'inferred' : 'observed',
      ...(promptTruncated ? { promptTruncated: true } : {}),
    }
  })

  const name = clampText(draft?.name, MAX_NAME_LENGTH) || clampText(current.name, MAX_NAME_LENGTH)
  const icon = (typeof draft?.icon === 'string' ? draft.icon.trim() : '') || current.icon || '🔄'
  return {
    name,
    description: clampText(draft?.description, MAX_DESC_LENGTH),
    icon,
    steps,
    stepsDropped: Math.max(0, rawSteps.length - kept.length),
  }
}

function cleanList(values: unknown, limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  if (!Array.isArray(values)) return out
  for (const value of values) {
    if (typeof value !== 'string') continue
    const text = value.replace(/\s+/g, ' ').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

/**
 * What the panel says *around* the steps: the model's choices, the values a
 * future run must supply, and how many steps were observed versus inferred.
 * Counts cover the whole draft, including steps the editor cap drops, because
 * the band describes what was inferred — not what survived the cap.
 */
export function draftNotes(draft: SessionWorkflowDraftData): DraftNotes {
  const steps = Array.isArray(draft?.steps) ? draft.steps : []
  let inferredCount = 0
  let observedCount = 0
  for (const step of steps) {
    if (step?.basis === 'inferred') inferredCount += 1
    else if (step?.basis === 'observed') observedCount += 1
  }
  return {
    assumptions: cleanList(draft?.assumptions, MAX_ASSUMPTIONS),
    inputs: cleanList(draft?.inputs, MAX_INPUTS),
    inferredCount,
    observedCount,
  }
}

/**
 * Which honest line to put under a failed generalisation. `not_procedural`
 * with a reason shows the model's own words verbatim; every other code has
 * fixed copy so a network failure is never dressed up as a judgement about
 * the conversation.
 */
export function generalizeErrorKey(error: SessionGeneralizeError, hasReason: boolean): string {
  switch (error) {
    case 'not_procedural':
      return hasReason
        ? 'chat.reuse.generalize.notProcedural'
        : 'chat.reuse.generalize.notProceduralGeneric'
    case 'missing_session':
      return 'chat.reuse.generalize.errorMissing'
    case 'empty_transcript':
      return 'chat.reuse.generalize.errorEmpty'
    case 'invalid_draft':
      return 'chat.reuse.generalize.errorInvalid'
    case 'timeout':
      return 'chat.reuse.generalize.errorTimeout'
    case 'aborted':
      return 'chat.reuse.generalize.errorAborted'
    case 'failed':
      return 'chat.reuse.generalize.errorFailed'
    default:
      // Unreachable for the current union, but a future code must still show
      // an honest failure line instead of throwing in the render path.
      return 'chat.reuse.generalize.errorFailed'
  }
}

/** The note that says how much of a long transcript the draft actually read. */
export function metaNote(meta: SessionWorkflowDraftMetaData): MetaNote {
  const raw = meta?.messagesRead
  const count = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
  return {
    key: meta?.truncated ? 'truncated' : 'full',
    params: { count },
  }
}

/**
 * Whether generalisation can run at all.
 *
 * Main reads a stored transcript, so both a missing session id and an
 * in-flight reply are hard blocks: the first has no file to read, the second
 * would generalise a conversation whose latest turn is still arriving.
 */
export function canGeneralize(
  sessionId: string | null | undefined,
  streaming: boolean,
): GeneralizeAvailability {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!id) return { ok: false, reason: 'no_session' }
  if (streaming) return { ok: false, reason: 'streaming' }
  return { ok: true }
}
