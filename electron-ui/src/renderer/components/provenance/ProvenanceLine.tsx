// One quiet line saying this skill or workflow was drafted from a conversation.
//
// Shared by the skill detail and the workflow detail so the two cannot word it
// differently. It renders nothing when there is no stored conversation id, says
// so when the conversation is gone, and becomes a link only when the listed row
// carries a directory the engine reported — reopening a conversation must never
// be done from a guessed working directory (see `trustedSessionDirectory`).

import React, { useCallback, useMemo } from 'react'
import { useT } from '../../i18n'
import { useSessionStore } from '../../store'
import { openSessionCore } from '../departments/openSessionCore'
import {
  describeProvenance,
  type ProvenanceVariant,
} from '../../lib/provenance'

const VARIANT_KEYS: Record<ProvenanceVariant, string> = {
  titled: 'provenance.titled',
  titledNoDate: 'provenance.titledNoDate',
  untitled: 'provenance.untitled',
  untitledNoDate: 'provenance.untitledNoDate',
}

const lineStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
  margin: 0,
  padding: 0,
  background: 'none',
  border: 'none',
  fontFamily: 'inherit',
  textAlign: 'left',
  maxWidth: '100%',
}

export interface ProvenanceLineProps {
  /** Stored conversation the artefact was drafted from; nothing renders without it. */
  sessionId?: string | null
  /** The conversation's title at draft time, if it had one. */
  title?: string | null
  /** The local calendar day the draft was saved, if known. */
  date?: string | null
  /**
   * `skill` keeps the `data-skill-provenance` attributes the skill detail has
   * carried since wave 64 (harnesses and styling key on them).
   */
  surface?: 'skill'
  className?: string
}

export function ProvenanceLine({
  sessionId,
  title,
  date,
  surface,
  className,
}: ProvenanceLineProps) {
  const t = useT()
  const sessions = useSessionStore(s => s.sessions)
  const state = useMemo(
    () => describeProvenance({ sessionId, title, date }, sessions),
    [sessionId, title, date, sessions],
  )

  // The row is captured here so the handler never re-reads a list that may have
  // changed between the click and the load.
  const session = state.session
  const directory = state.directory
  const open = useCallback(() => {
    if (!session || !directory) return
    void openSessionCore(session, directory, 'archive').catch(err => {
      console.warn('[AIPA] Failed to open provenance conversation', session.sessionId, err)
    })
  }, [session, directory])

  if (state.kind === 'none' || !state.variant) return null

  const text = t(VARIANT_KEYS[state.variant], state.params)

  // Same attribute the wave-64 skill line exposed, now only on that surface.
  const skillPresence: 'present' | 'missing' | undefined = surface === 'skill'
    ? (state.kind === 'gone' ? 'missing' : 'present')
    : undefined

  if (state.kind === 'live') {
    // `alignSelf` keeps a flex column (the workflow page) from stretching the
    // button across the page: only the words themselves are the target.
    return (
      <button
        type="button"
        onClick={open}
        className={className}
        data-provenance-link="live"
        data-skill-provenance={skillPresence}
        style={{ ...lineStyle, alignSelf: 'flex-start', cursor: 'pointer', textDecoration: 'none' }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.textDecoration = 'underline'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--text-muted)'
          e.currentTarget.style.textDecoration = 'none'
        }}
      >
        {text}
      </button>
    )
  }

  // Gone from the list, or listed without a trustworthy directory: the line is
  // still true, so it stays plain text rather than offering a dead end.
  return (
    <div
      className={className}
      data-provenance-link={state.kind === 'gone' ? 'gone' : undefined}
      data-skill-provenance={skillPresence}
      style={lineStyle}
    >
      {text}
      {state.kind === 'gone' && (
        <span
          data-provenance-gone
          data-skill-provenance-gone={surface === 'skill' ? true : undefined}
        >
          {' · '}{t('provenance.gone')}
        </span>
      )}
    </div>
  )
}

export default ProvenanceLine
