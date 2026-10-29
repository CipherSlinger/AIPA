/**
 * The state machine behind the skill editor.
 *
 * Kept free of React and of `window` so a headless harness can drive it: the
 * page dispatches actions, and the tricky promises ("Cancel asks once before
 * throwing work away", "a failed save keeps the draft", "Reload really
 * discards") are decided here rather than in JSX conditionals.
 *
 * The state deliberately holds the token the edit started from. A conflicting
 * save never replaces it: after `changed_on_disk` the next ordinary Save must
 * still fail, otherwise the guard would dissolve after the first refusal. The
 * only ways past it are Reload (new base + new token) or Overwrite (force).
 */
import type { SkillFileTokenData } from '../../../preload'

export interface SkillEditDraft {
  /** Not shown as a field; kept so a save never renames the skill. */
  name: string
  description: string
  body: string
}

export type SkillEditStatus = 'idle' | 'saving' | 'conflict' | 'unparsable' | 'error'

export interface SkillEditState {
  mode: 'view' | 'editing'
  /** What the fields currently show. */
  draft: SkillEditDraft
  /** What was last read from disk (or last saved). Dirty = draft differs. */
  base: SkillEditDraft
  /** The token `base` came from; null only before the first edit starts. */
  token: SkillFileTokenData | null
  status: SkillEditStatus
  message: string | null
  /** Set on `changed_on_disk`, for the "modified at …" line. */
  conflictMtimeMs: number | null
  /** Cancel was pressed with unsaved work; the inline prompt is showing. */
  confirmCancel: boolean
  /** The in-flight save is a deliberate overwrite. */
  forcing: boolean
  /** The most recent successful save, so the page can toast without guessing. */
  lastSavedToken: SkillFileTokenData | null
}

export type SkillEditAction =
  | { type: 'start'; draft: SkillEditDraft; token: SkillFileTokenData }
  | { type: 'change'; field: keyof SkillEditDraft; value: string }
  | { type: 'cancel' }
  | { type: 'cancelConfirmed' }
  | { type: 'cancelKept' }
  | { type: 'saveStart'; force?: boolean }
  | { type: 'saveSuccess'; token: SkillFileTokenData }
  | {
      type: 'saveFailure'
      code: string
      message: string
      currentMtimeMs?: number
      token?: SkillFileTokenData
    }
  | { type: 'reload'; draft: SkillEditDraft; token: SkillFileTokenData }

function emptyDraft(): SkillEditDraft {
  return { name: '', description: '', body: '' }
}

export function createSkillEditState(): SkillEditState {
  return {
    mode: 'view',
    draft: emptyDraft(),
    base: emptyDraft(),
    token: null,
    status: 'idle',
    message: null,
    conflictMtimeMs: null,
    confirmCancel: false,
    forcing: false,
    lastSavedToken: null,
  }
}

export function isSkillEditDirty(state: SkillEditState): boolean {
  return state.mode === 'editing'
    && (state.draft.name !== state.base.name
      || state.draft.description !== state.base.description
      || state.draft.body !== state.base.body)
}

/** Leaving edit mode resets the fields but keeps the last-save receipt. */
function toView(state: SkillEditState): SkillEditState {
  return { ...createSkillEditState(), lastSavedToken: state.lastSavedToken }
}

export function skillEditReducer(state: SkillEditState, action: SkillEditAction): SkillEditState {
  switch (action.type) {
    case 'start':
      return {
        ...createSkillEditState(),
        mode: 'editing',
        draft: action.draft,
        base: action.draft,
        token: action.token,
        lastSavedToken: state.lastSavedToken,
      }

    case 'change':
      // A save is in flight; ignoring the keystroke is better than letting the
      // textarea agree with a file that is about to be different.
      if (state.status === 'saving') return state
      return { ...state, draft: { ...state.draft, [action.field]: action.value } }

    case 'cancel':
      if (isSkillEditDirty(state)) return { ...state, confirmCancel: true }
      return toView(state)

    case 'cancelKept':
      return { ...state, confirmCancel: false }

    case 'cancelConfirmed':
      return toView(state)

    case 'saveStart':
      return {
        ...state,
        status: 'saving',
        message: null,
        confirmCancel: false,
        forcing: action.force === true,
      }

    case 'saveSuccess':
      // Stay in the editor with the new token: the user can keep typing
      // without a re-read, and the dirty flag is truthful again.
      return {
        ...state,
        status: 'idle',
        message: null,
        forcing: false,
        base: state.draft,
        token: action.token,
        lastSavedToken: action.token,
        conflictMtimeMs: null,
      }

    case 'saveFailure':
      if (action.code === 'changed_on_disk') {
        return {
          ...state,
          status: 'conflict',
          message: action.message,
          forcing: false,
          conflictMtimeMs: action.currentMtimeMs ?? null,
          // `state.token` is intentionally unchanged — see the file comment.
        }
      }
      if (action.code === 'unparsable') {
        return { ...state, status: 'unparsable', message: action.message, forcing: false }
      }
      return { ...state, status: 'error', message: action.message, forcing: false }

    case 'reload':
      return {
        ...state,
        mode: 'editing',
        draft: action.draft,
        base: action.draft,
        token: action.token,
        status: 'idle',
        message: null,
        conflictMtimeMs: null,
        confirmCancel: false,
        forcing: false,
      }

    default:
      return state
  }
}
