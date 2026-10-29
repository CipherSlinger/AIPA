// One quiet line under the session header: the workflows and skills that were
// drafted from the conversation on screen.
//
// The detail pages say which conversation an artefact came from; this is the
// same fact read backwards. It sits among the chat's chrome rather than above
// the answer, so it must stay quieter than the transcript: one muted line, no
// card, no border, and nothing at all when there is nothing to report.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Workflow as WorkflowIcon, Puzzle } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { SkillInfo } from '../skills/skillsShared'
import { MADE_FROM_ROWS, deriveMadeFrom, type MadeFromRow } from '../../lib/madeFrom'

type SkillsStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SkillsRead {
  /** The conversation this read belongs to; another session's list is ignored. */
  sessionId: string | null
  status: SkillsStatus
  items: readonly SkillInfo[]
}

/** Shared so a render without a read for the current session keeps one identity. */
const EMPTY_READ: SkillsRead = { sessionId: null, status: 'idle', items: [] }

const lineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
  minWidth: 0,
  fontSize: 11,
  color: 'var(--text-muted)',
  userSelect: 'none',
}

const leadStyle: CSSProperties = {
  flexShrink: 0,
}

const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  maxWidth: 200,
  padding: '1px 6px',
  margin: 0,
  background: 'none',
  border: 'none',
  borderRadius: 8,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
}

const pillNameStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const noteStyle: CSSProperties = {
  flexShrink: 0,
  padding: 0,
  margin: 0,
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: 2,
}

function hoverOn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.color = 'var(--text-secondary)'
  if (e.currentTarget.dataset.madeFrom !== undefined) {
    e.currentTarget.style.background = 'var(--bg-hover)'
  }
}

function hoverOff(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.color = 'var(--text-muted)'
  e.currentTarget.style.background = 'none'
}

export function MadeFromConversation() {
  const t = useT()
  // `viewSessionId`, not `currentSessionId`: a streaming turn overwrites the
  // latter with its bridge id, which is not a conversation anything was
  // drafted from. Null means a brand-new chat with no stored id yet.
  const sessionId = useChatStore(s => s.viewSessionId)
  const workflows = usePrefsStore(s => s.prefs.workflows)

  const [read, setRead] = useState<SkillsRead>(EMPTY_READ)
  // Retrying a failed read is the only thing that may re-run the effect for the
  // same conversation.
  const [attempt, setAttempt] = useState(0)
  // "+N more" expands here rather than pointing at another surface: the rows
  // are already known, so a count that cannot be opened would only taunt.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    const api = window.electronAPI
    if (!api?.skillsList) {
      setRead({ sessionId, status: 'error', items: [] })
      return
    }
    let cancelled = false
    setRead({ sessionId, status: 'loading', items: [] })
    // The working directory is read once, at fetch time, and deliberately not
    // subscribed to: changing a preference is not a reason to re-read skills,
    // and neither is a streamed token.
    const workingDir = useChatStore.getState().workingDir || undefined
    api.skillsList(workingDir).then(
      list => {
        if (cancelled) return
        setRead({ sessionId, status: 'ready', items: Array.isArray(list) ? list : [] })
      },
      err => {
        if (cancelled) return
        console.warn('[AIPA] Failed to read skills for the made-from strip', sessionId, err)
        setRead({ sessionId, status: 'error', items: [] })
      },
    )
    return () => { cancelled = true }
  }, [sessionId, attempt])

  // Only a read that belongs to the conversation on screen may speak for it.
  // A read still in flight is not evidence either way, so it is treated as
  // nothing to say yet — never as "no skills".
  const current = read.sessionId === sessionId ? read : EMPTY_READ

  const result = useMemo(
    () => deriveMadeFrom({
      skills: current.status === 'ready' ? current.items : null,
      workflows,
      sessionId,
    }, expanded ? Number.POSITIVE_INFINITY : MADE_FROM_ROWS),
    [current, workflows, sessionId, expanded],
  )

  const open = useCallback((row: MadeFromRow) => {
    const ui = useUiStore.getState()
    if (row.kind === 'workflow') ui.openWorkflowDetail(row.id)
    else ui.openSkillDetail(row.id)
  }, [])

  const retry = useCallback(() => setAttempt(n => n + 1), [])

  // An unsaved conversation cannot be a source: nothing could have recorded it.
  if (!sessionId) return null
  if (current.status === 'idle' || current.status === 'loading') return null
  // Nothing known was made here. A failed skills read is not a finding to
  // announce on its own: with no artefact to show, the strip stays away rather
  // than putting "skills couldn't be read" under every header. The note below
  // only ever qualifies a list of artefacts that is actually being shown.
  if (result.total === 0) return null

  const remaining = result.total - result.rows.length
  const retryTitle = t('chat.madeFrom.retry')

  return (
    <div style={{ flexShrink: 0, padding: '4px 0 0' }}>
      <div className="chat-column" style={lineStyle} data-made-from-strip>
        <span style={leadStyle}>{t('chat.madeFrom.lead')}</span>
        {result.rows.map(row => {
          const label = t(
            row.kind === 'workflow' ? 'chat.madeFrom.openWorkflow' : 'chat.madeFrom.openSkill',
            { name: row.name },
          )
          return (
            <button
              key={`${row.kind}:${row.id}`}
              type="button"
              onClick={() => open(row)}
              title={label}
              aria-label={label}
              data-made-from={row.kind}
              data-made-from-id={row.id}
              style={pillStyle}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              {row.kind === 'workflow'
                ? <WorkflowIcon size={10} style={{ flexShrink: 0 }} />
                : <Puzzle size={10} style={{ flexShrink: 0 }} />}
              <span style={pillNameStyle}>{row.name}</span>
            </button>
          )
        })}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title={t('chat.madeFrom.moreTitle', { count: String(remaining) })}
            style={noteStyle}
            data-made-from-more={remaining}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
          >
            {t('chat.madeFrom.more', { count: String(remaining) })}
          </button>
        )}
        {result.skillsUnknown && (
          // Not "no skills": the list was never read or the read failed, and
          // the two are indistinguishable from here. Clicking tries again.
          <button
            type="button"
            onClick={retry}
            title={retryTitle}
            aria-label={retryTitle}
            data-made-from-retry
            style={noteStyle}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
          >
            {t('chat.madeFrom.skillsUnknown')}
          </button>
        )}
      </div>
    </div>
  )
}

export default MadeFromConversation
