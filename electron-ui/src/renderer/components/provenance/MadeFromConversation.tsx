// One quiet line under the session header: the workflows, skills and scheduled
// jobs that were drafted from the conversation on screen.
//
// The detail pages say which conversation an artefact came from; this is the
// same fact read backwards. It sits among the chat's chrome rather than above
// the answer, so it must stay quieter than the transcript: one muted line, no
// card, no border, and nothing at all when there is nothing to report.
//
// The skills and jobs lists are fetched separately, each with its own status
// and its own retry, so a broken probe of one cannot make the other look
// unreadable — or make its rows vanish.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { CalendarClock, Workflow as WorkflowIcon, Puzzle } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { SkillInfo } from '../skills/skillsShared'
import {
  MADE_FROM_ROWS,
  deriveMadeFrom,
  type MadeFromJob,
  type MadeFromRow,
} from '../../lib/madeFrom'

/**
 * How one probe stands. `error` and "never ran" both mean "not checked"; only
 * `ready` is evidence that a list is complete.
 */
type SourceStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SkillsRead {
  /** The conversation this read belongs to; another session's list is ignored. */
  sessionId: string | null
  status: SourceStatus
  items: readonly SkillInfo[]
}

interface JobsRead {
  sessionId: string | null
  status: SourceStatus
  items: readonly MadeFromJob[]
}

/** Shared so a render without a read for the current session keeps one identity. */
const EMPTY_SKILLS_READ: SkillsRead = { sessionId: null, status: 'idle', items: [] }
const EMPTY_JOBS_READ: JobsRead = { sessionId: null, status: 'idle', items: [] }

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

  const [skillsRead, setSkillsRead] = useState<SkillsRead>(EMPTY_SKILLS_READ)
  // Retrying one failed probe is the only thing that may re-run that probe for
  // the same conversation. Two counters, not one: retrying skills must not
  // re-read the job list and risk replacing a good answer with a failure.
  const [skillsAttempt, setSkillsAttempt] = useState(0)
  const [jobsRead, setJobsRead] = useState<JobsRead>(EMPTY_JOBS_READ)
  const [jobsAttempt, setJobsAttempt] = useState(0)
  // "+N more" expands here rather than pointing at another surface: the rows
  // are already known, so a count that cannot be opened would only taunt.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    const api = window.electronAPI
    if (!api?.skillsList) {
      setSkillsRead({ sessionId, status: 'error', items: [] })
      return
    }
    let cancelled = false
    setSkillsRead({ sessionId, status: 'loading', items: [] })
    // The working directory is read once, at fetch time, and deliberately not
    // subscribed to: changing a preference is not a reason to re-read skills,
    // and neither is a streamed token.
    const workingDir = useChatStore.getState().workingDir || undefined
    api.skillsList(workingDir).then(
      list => {
        if (cancelled) return
        setSkillsRead({ sessionId, status: 'ready', items: Array.isArray(list) ? list : [] })
      },
      err => {
        if (cancelled) return
        console.warn('[AIPA] Failed to read skills for the made-from strip', sessionId, err)
        setSkillsRead({ sessionId, status: 'error', items: [] })
      },
    )
    return () => { cancelled = true }
  }, [sessionId, skillsAttempt])

  useEffect(() => {
    if (!sessionId) return
    const api = window.electronAPI
    if (!api?.automationList) {
      setJobsRead({ sessionId, status: 'error', items: [] })
      return
    }
    let cancelled = false
    setJobsRead({ sessionId, status: 'loading', items: [] })
    // Read at conversation-change time only, and deliberately not subscribed to
    // `automation:changed`: a job finishing, being paused or being renamed is
    // not a change to where it was drafted from, and re-reading on every run
    // would make this line blink for a fact that did not move.
    api.automationList().then(
      state => {
        if (cancelled) return
        const jobs = state && Array.isArray(state.jobs) ? state.jobs : null
        if (!jobs) {
          // A payload without a list is a read we could not trust. Calling it an
          // empty list would quietly claim "nothing was scheduled from here".
          console.warn('[AIPA] Unreadable automation list for the made-from strip', sessionId, state)
          setJobsRead({ sessionId, status: 'error', items: [] })
          return
        }
        setJobsRead({ sessionId, status: 'ready', items: jobs })
      },
      err => {
        if (cancelled) return
        console.warn('[AIPA] Failed to read scheduled jobs for the made-from strip', sessionId, err)
        setJobsRead({ sessionId, status: 'error', items: [] })
      },
    )
    return () => { cancelled = true }
  }, [sessionId, jobsAttempt])

  // Only a read that belongs to the conversation on screen may speak for it.
  // A read still in flight is not evidence either way, so it is treated as
  // nothing to say yet — never as "no skills" or "no jobs".
  const skillsCurrent = skillsRead.sessionId === sessionId ? skillsRead : EMPTY_SKILLS_READ
  const jobsCurrent = jobsRead.sessionId === sessionId ? jobsRead : EMPTY_JOBS_READ

  const result = useMemo(
    () => deriveMadeFrom({
      skills: skillsCurrent.status === 'ready' ? skillsCurrent.items : null,
      workflows,
      jobs: jobsCurrent.status === 'ready' ? jobsCurrent.items : null,
      sessionId,
    }, expanded ? Number.POSITIVE_INFINITY : MADE_FROM_ROWS),
    [skillsCurrent, jobsCurrent, workflows, sessionId, expanded],
  )

  const open = useCallback((row: MadeFromRow) => {
    const ui = useUiStore.getState()
    if (row.kind === 'workflow') ui.openWorkflowDetail(row.id)
    else if (row.kind === 'skill') ui.openSkillDetail(row.id)
    // Same entry point the palette and search use: Settings → Automations, with
    // the row revealed. A pill that only switched tabs and left the user to
    // hunt through the list would be a dead end dressed as a link.
    else ui.focusAutomationJob(row.id)
  }, [])

  const retrySkills = useCallback(() => setSkillsAttempt(n => n + 1), [])
  const retryJobs = useCallback(() => setJobsAttempt(n => n + 1), [])

  // An unsaved conversation cannot be a source: nothing could have recorded it.
  if (!sessionId) return null
  // Nothing known was made here. A failed read is not a finding to announce on
  // its own: with no artefact to show, the strip stays away rather than putting
  // "skills couldn't be read" under every header. The notes below only ever
  // qualify a list of artefacts that is actually being shown.
  if (result.total === 0) return null

  // "Not checked" is true while a probe is still running too, but "couldn't be
  // read" is a claim about a finished attempt. Suppressing the note mid-flight
  // keeps a slow read from being reported as a failure it has not become.
  const skillsPending = skillsCurrent.status === 'idle' || skillsCurrent.status === 'loading'
  const jobsPending = jobsCurrent.status === 'idle' || jobsCurrent.status === 'loading'
  const showSkillsUnknown = result.skillsUnknown && !skillsPending
  const showJobsUnknown = result.jobsUnknown && !jobsPending

  const remaining = result.total - result.rows.length
  const retrySkillsTitle = t('chat.madeFrom.retry')
  // Wave 68a ships no separate "retry reading jobs" label. Labelling this button
  // with the skills wording would tell the reader it retries a list it does not
  // touch, so the note's own text is the honest accessible name here.
  const jobsUnknownTitle = t('chat.madeFrom.jobsUnknown')

  return (
    <div style={{ flexShrink: 0, padding: '4px 0 0' }}>
      <div className="chat-column" style={lineStyle} data-made-from-strip>
        <span style={leadStyle}>{t('chat.madeFrom.lead')}</span>
        {result.rows.map(row => {
          const label = t(
            row.kind === 'workflow'
              ? 'chat.madeFrom.openWorkflow'
              : row.kind === 'skill'
                ? 'chat.madeFrom.openSkill'
                : 'chat.madeFrom.openJob',
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
              {/* A clock for a job: a recurring schedule is a different kind of
                  thing to open, and the icon is the only at-a-glance cue
                  before the name is read. */}
              {row.kind === 'workflow'
                ? <WorkflowIcon size={10} style={{ flexShrink: 0 }} />
                : row.kind === 'skill'
                  ? <Puzzle size={10} style={{ flexShrink: 0 }} />
                  : <CalendarClock size={10} style={{ flexShrink: 0 }} />}
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
        {showSkillsUnknown && (
          // Not "no skills": the list was never read or the read failed, and
          // the two are indistinguishable from here. Clicking tries again, and
          // only this probe.
          <button
            type="button"
            onClick={retrySkills}
            title={retrySkillsTitle}
            aria-label={retrySkillsTitle}
            data-made-from-retry
            style={noteStyle}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
          >
            {t('chat.madeFrom.skillsUnknown')}
          </button>
        )}
        {showJobsUnknown && (
          // The same honesty for the third kind: the strip may not answer "no
          // scheduled jobs" for a list it never managed to read. Its retry is
          // separate from the skills one — one failed probe must not be able to
          // re-run, and possibly break, the other.
          <button
            type="button"
            onClick={retryJobs}
            title={jobsUnknownTitle}
            aria-label={jobsUnknownTitle}
            data-made-from-jobs-retry
            style={noteStyle}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
          >
            {t('chat.madeFrom.jobsUnknown')}
          </button>
        )}
      </div>
    </div>
  )
}

export default MadeFromConversation
