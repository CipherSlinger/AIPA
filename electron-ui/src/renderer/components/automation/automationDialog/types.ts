// Types and constants the automation dialog and its sections share.
//
// The dialog's public surface (`WorkflowOption`, `ASSISTANT_PERSONA_ID`,
// `AutomationDialogProps`) used to be declared in `AutomationDialog.tsx`; it is
// defined here so each section can name the same facts without importing the
// coordinator back. `AutomationDialog.tsx` re-exports every public name, so
// Settings, a workflow page, the chat header and a skill page keep their import
// path unchanged.

import type { AutomationJobData, AutomationLimitsData } from '../../../../preload'
import type { InitialSkill } from '../skillSelection'

export interface WorkflowOption {
  id: string
  name: string
  icon?: string
  personaId?: string
}

/**
 * Mirrors `ASSISTANT_PERSONA_ID` in src/main/automation/persona-plan.ts: the
 * reserved choice meaning "plain assistant". It is distinct from the empty
 * selection, which follows the workflow's expert.
 */
export const ASSISTANT_PERSONA_ID = '__assistant__'

/**
 * The effort select's "no override" value. Not a level and never sent: main
 * stores an absent field, which reads the app preference when a run starts.
 */
export const FOLLOW_APP_EFFORT = 'default'

export type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron' | 'watch'

/** The quiet-period bounds the main process enforces, kept in the input too. */
export const WATCH_DEBOUNCE_MIN = 1
export const WATCH_DEBOUNCE_MAX = 1440

/** How long the dialog waits after the last schedule edit before asking main. */
export const PREVIEW_DEBOUNCE_MS = 250

/**
 * The "next runs" line under the schedule fields.
 *
 * `pending` is deliberately a state of its own: a preview that describes the
 * previous trigger must not stay visible under an edited form, so an edit clears
 * the line at once rather than leaving a stale time there. `unavailable` is an
 * IPC outage, which is not a verdict on the schedule — it shows no time and does
 * not block Save, because main validates again on save.
 */
export type SchedulePreviewState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'runs'; runs: number[] }
  | { kind: 'invalid'; error: string }
  | { kind: 'unavailable' }

export interface AutomationDialogProps {
  /** null = create a new automation. */
  job: AutomationJobData | null
  workflows: WorkflowOption[]
  limits: AutomationLimitsData | null
  /**
   * Create mode only: open pre-filled with this workflow as the action.
   * Name and trigger keep their defaults; the user can still change anything.
   */
  initialWorkflowId?: string
  /**
   * Create mode only: open pre-filled with this skill as the action. The
   * caller (a skill page) already knows the identity; the dialog still asks
   * for a name and a schedule, and saves nothing until the user does.
   */
  initialSkill?: InitialSkill
  /**
   * Create mode only: open with action "send a prompt" and this text. An empty
   * string still selects the prompt action, so the caller can prefill a
   * conversation whose first message the user has yet to write. Absence keeps
   * today's default (a workflow when one exists).
   */
  initialPrompt?: string
  /** Create mode only: prefill the name. Absent leaves the field empty. */
  initialName?: string
  /**
   * Only meaningful with `initialPrompt`: the caller had to cut the text to
   * the editor's limit. The dialog then says so rather than presenting the
   * shortened text as the user's whole message.
   */
  initialPromptClipped?: boolean
  /**
   * Create mode only: the conversation this job is being drafted from. Sent
   * with the create request so the settings row can say where the job came
   * from. Ignored when editing — an edit must never rewrite a creation fact,
   * and the edit form does not know these fields exist.
   */
  initialProvenance?: {
    sourceConversation: string
    sourceTitle?: string
    sourceDraftedAt?: string
  }
  onClose: () => void
}
