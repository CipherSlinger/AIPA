// "Schedule this conversation": one click from a chat header to a recurring
// automation prefilled from the first message the user typed.
//
// The button stores nothing itself. It prepares the same inputs Settings ->
// Automations feeds `AutomationDialog` (workflow options + the scheduler's
// limits) and opens the dialog in create mode; saving is the dialog's job, so
// the prompt-vs-workflow choice, validation and error reporting stay in one
// place. Fetching happens on click because none of it is needed to render the
// header.

import React, { useCallback, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatStore, usePrefsStore } from '../../store'
import { isHumanTurn } from '../../lib/sessionReuse'
import { firstMeaningfulLine } from '../../lib/sessionTitle'
import AutomationDialog, { type WorkflowOption } from '../automation/AutomationDialog'
import { workflowProvenance } from '../../lib/provenance'
import { localDateStamp } from '../../lib/sessionReuse'
import type { AutomationLimitsData } from '../../../preload'
import type { ChatMessage, StandardChatMessage } from '../../types/app.types'

/** The dialog's prompt editor refuses more than this. */
const MAX_PROMPT_CHARS = 4000
/** Short enough for a settings row and a menu line. */
const MAX_NAME_CHARS = 48

interface Props {
  sessionTitle: string | null
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

interface Prefill {
  name: string
  prompt: string
  clipped: boolean
  workflows: WorkflowOption[]
  limits: AutomationLimitsData | null
  /**
   * Where this schedule came from, in the same three fields a workflow saved
   * from a chat header records. Empty when the conversation was never stored:
   * there is no id to point back at, and a job with a fabricated origin would
   * be worse than one that simply says nothing.
   */
  provenance: { sourceConversation: string; sourceTitle?: string; sourceDraftedAt?: string } | undefined
}

/**
 * The first message the user typed, preferring prose over harness echoes.
 * Transcripts also record slash commands, shell round-trips and hook output as
 * `user` turns; `isHumanTurn` is the same rule the conversation-reuse drafts
 * use, so the scheduled prompt is usually not a command echo. If every user
 * turn is noise, fall back to the first one rather than opening an empty
 * dialog — the user asked for this conversation, and the text is still theirs.
 */
function firstPromptText(messages: ChatMessage[]): string | null {
  let fallback: string | null = null
  for (const message of messages) {
    if (message.role !== 'user') continue
    const content = (message as StandardChatMessage).content
    if (typeof content !== 'string' || !content.trim()) continue
    if (isHumanTurn(content)) return content
    if (fallback === null) fallback = content
  }
  return fallback
}

/** Session title if one is set, otherwise the opening line of the first message. */
function scheduleName(sessionTitle: string | null, prompt: string): string {
  const stored = sessionTitle?.trim() ?? ''
  const line = stored || firstMeaningfulLine(prompt) || prompt.split('\n')[0]?.trim() || ''
  return line.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS)
}

/**
 * Trim to the editor's limit and report the cut separately. No ellipsis is
 * inserted into the text: it would become part of the instruction the assistant
 * receives and read as if the user had typed it.
 */
function clipPrompt(text: string): { prompt: string; clipped: boolean } {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_PROMPT_CHARS) return { prompt: trimmed, clipped: false }
  return { prompt: trimmed.slice(0, MAX_PROMPT_CHARS).trimEnd(), clipped: true }
}

export default function ScheduleConversationButton({
  sessionTitle,
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: Props) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  // Boolean selector: the button appears with the first user turn and never
  // re-renders the header again as streaming messages arrive. Deliberately a
  // cheap test — the noise rules run once, on click, not per stream chunk.
  const hasUserTurn = useChatStore(s => s.messages.some(message => {
    if (message.role !== 'user') return false
    const content = (message as StandardChatMessage).content
    return typeof content === 'string' && content.trim().length > 0
  }))

  const open = useCallback(async () => {
    if (busy) return
    const prompt = firstPromptText(useChatStore.getState().messages)
    if (!prompt) return
    setBusy(true)
    try {
      // Limits ride on the list call, as they do in Settings. A failed read
      // leaves them null; the dialog's fallbacks cover the gap, and the save
      // path will report any real scheduler failure verbatim.
      let limits: AutomationLimitsData | null = null
      try {
        const state = await window.electronAPI.automationList()
        limits = state?.limits ?? null
      } catch (err) {
        console.error('[AIPA] Could not load automation limits', err)
      }
      // Read at click time rather than subscribing: the header does not need to
      // re-render when a workflow is renamed elsewhere.
      const workflows = (usePrefsStore.getState().prefs.workflows ?? []) as WorkflowOption[]
      const clipped = clipPrompt(prompt)
      // Read at click time like everything else here: the id changes when the
      // user switches conversations, and the header never re-renders for it.
      // `viewSessionId`, not `currentSessionId` — a streaming turn overwrites
      // the latter with a bridge id that is not a conversation.
      const fields = workflowProvenance(
        useChatStore.getState().viewSessionId,
        sessionTitle,
        localDateStamp(),
      )
      setPrefill({
        name: scheduleName(sessionTitle, prompt),
        prompt: clipped.prompt,
        clipped: clipped.clipped,
        workflows,
        limits,
        provenance: fields.sourceConversation ? fields as {
          sourceConversation: string
          sourceTitle?: string
          sourceDraftedAt?: string
        } : undefined,
      })
    } finally {
      setBusy(false)
    }
  }, [busy, sessionTitle])

  if (!hasUserTurn) return null

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        title={busy ? t('chat.scheduleConversationPreparing') : t('chat.scheduleConversationHint')}
        aria-label={t('chat.scheduleConversation')}
        data-schedule-conversation
        style={{
          ...headerBtnStyle,
          cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
        onMouseEnter={e => hoverIn(e)}
        onMouseLeave={e => hoverOut(e)}
      >
        <CalendarPlus size={15} />
      </button>

      {prefill && (
        <AutomationDialog
          job={null}
          workflows={prefill.workflows}
          limits={prefill.limits}
          initialName={prefill.name}
          initialPrompt={prefill.prompt}
          initialPromptClipped={prefill.clipped}
          initialProvenance={prefill.provenance}
          onClose={() => setPrefill(null)}
        />
      )}
    </>
  )
}
