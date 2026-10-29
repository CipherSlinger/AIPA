/**
 * Pure helpers for the "generalize this conversation" mode of the skill
 * dialog.
 *
 * The model returns a *draft*, and a draft is only ever a proposal: these
 * helpers clamp it to what the dialog's own inputs accept and turn the
 * model's honesty fields (`assumptions`, `inputs`) into something the dialog
 * can show. None of them installs anything, and none of them invents content
 * the model did not return.
 *
 * The clamps are the dialog's limits, not the main process's: the name input
 * slices and stops at 60 characters and the description at 120, so a value the
 * inputs would refuse to let the user retype must not appear in them either.
 * That also makes the applied name exactly the name that gets installed.
 */

import type { SessionSkillDraftData } from '../../preload'
import { draftNotes } from './generalizeDraft'

/** Matches the name input's slice and `maxLength` in the skill dialog. */
export const SKILL_DIALOG_NAME_MAX = 60
/** Matches the description input's slice and `maxLength` in the skill dialog. */
export const SKILL_DIALOG_DESC_MAX = 120
/**
 * The instructions textarea has no editor cap of its own. This is a runaway
 * guard rather than a creator limit: a skill body far beyond this is a
 * runbook, and a larger model answer would only make the textarea unwieldy.
 */
export const SKILL_DIALOG_BODY_MAX = 20_000

export interface EditorSkill {
  name: string
  description: string
  body: string
}

export interface AppliedSkillDraft extends EditorSkill {
  /** Set when the model's body had to be cut to fit the editor. */
  bodyTruncated: boolean
}

export interface SkillDraftNotes {
  assumptions: string[]
  inputs: string[]
}

function clampText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

/**
 * Apply a model draft to the dialog's fields.
 *
 * An empty field in the draft keeps the deterministic draft already in the
 * editor rather than blanking it: a model that omits a name should not cost
 * the user the name they were about to install. The body is only ever cut when
 * the model returned more than the editor can hold, and `bodyTruncated` makes
 * that cut visible instead of silent.
 */
export function applySkillDraft(
  current: EditorSkill,
  draft: SessionSkillDraftData,
): AppliedSkillDraft {
  const rawBody = typeof draft?.body === 'string' ? draft.body.trim() : ''
  return {
    name:
      clampText(draft?.name, SKILL_DIALOG_NAME_MAX)
      || clampText(current.name, SKILL_DIALOG_NAME_MAX),
    description:
      clampText(draft?.description, SKILL_DIALOG_DESC_MAX)
      || clampText(current.description, SKILL_DIALOG_DESC_MAX),
    body: rawBody
      ? rawBody.slice(0, SKILL_DIALOG_BODY_MAX)
      : clampText(current.body, SKILL_DIALOG_BODY_MAX),
    bodyTruncated: rawBody.length > SKILL_DIALOG_BODY_MAX,
  }
}

/**
 * The model's two honesty lists, cleaned the same way the workflow dialog
 * cleans them. `draftNotes` already owns the trim/dedupe/cap rules; only its
 * step-derived counts do not apply to a skill, so the shape passed here has no
 * steps.
 */
export function skillDraftNotes(draft: SessionSkillDraftData): SkillDraftNotes {
  const notes = draftNotes({
    name: '',
    description: '',
    icon: '',
    summary: '',
    steps: [],
    assumptions: draft?.assumptions,
    inputs: draft?.inputs,
  })
  return { assumptions: notes.assumptions, inputs: notes.inputs }
}
