// Pick a stored conversation to turn into a skill.
//
// The chat header can only generalise the conversation open beside it. From
// the Skills section no conversation is open, so this picker is the way in: it
// lists saved conversations, filters them, and hands the chosen row's own
// session id to the skill dialog. It never reads a transcript itself and never
// installs anything.

import React, { useMemo, useState } from 'react'
import { MessageSquare, Search, Sparkles, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useSessionStore } from '../../store'
import { displayTitle, firstMeaningfulLine } from '../../lib/sessionTitle'
import {
  SKILL_DRAFT_SOURCE_VISIBLE,
  deriveSkillDraftSources,
} from '../../lib/skillDraftSources'
import { formatDateTimeShort } from '../../utils/formatDate'
import SessionReuseDialogShell from '../chat/SessionReuseDialogShell'

interface Props {
  onClose: () => void
  onSelect: (sessionId: string, sessionTitle: string | null) => void
}

const rowStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '9px 10px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 9,
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--text-secondary)',
  transition: 'background 0.15s ease, border-color 0.15s ease',
}

export default function SkillDraftSourceDialog({ onClose, onSelect }: Props) {
  const { t, resolvedLocale } = useI18n()
  const sessions = useSessionStore(s => s.sessions)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)

  // `Infinity` is the expanded state; while collapsed the list keeps the cap
  // so a very old store does not turn the picker into a wall of rows.
  const { rows, hidden } = useMemo(
    () => deriveSkillDraftSources(
      sessions,
      query,
      expanded ? Number.POSITIVE_INFINITY : SKILL_DRAFT_SOURCE_VISIBLE,
    ),
    [sessions, query, expanded],
  )

  const searching = query.trim().length > 0
  const storeEmpty = sessions.length === 0

  return (
    <SessionReuseDialogShell
      title={t('skills.draftSource.dialogTitle')}
      subtitle={t('skills.draftSource.dialogSubtitle')}
      icon={<Sparkles size={16} />}
      width={560}
      onClose={onClose}
      testId="skill-source"
      footer={(
        <button
          onClick={onClose}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
            color: 'var(--text-secondary)', fontWeight: 500,
          }}
        >
          {t('common.cancel')}
        </button>
      )}
    >
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search
          size={13}
          style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }}
        />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setExpanded(false) }}
          placeholder={t('skills.draftSource.searchPlaceholder')}
          aria-label={t('skills.draftSource.searchPlaceholder')}
          data-skill-source-search
          style={{
            width: '100%', height: 30, paddingLeft: 29, paddingRight: query ? 28 : 10,
            boxSizing: 'border-box',
            background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
            borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setExpanded(false) }}
            title={t('canvas.clearSearchLabel')}
            aria-label={t('canvas.clearSearchLabel')}
            style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 2, display: 'flex',
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '28px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {searching
              ? t('skills.draftSource.noResults')
              : storeEmpty
                ? t('skills.draftSource.emptyTitle')
                : t('skills.draftSource.noEligible')}
          </div>
          {!searching && storeEmpty && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              {t('skills.draftSource.noSessionsHint')}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map(row => {
            const title = displayTitle(
              { title: row.title, lastPrompt: row.lastPrompt },
              t('session.untitled'),
            )
            const preview = firstMeaningfulLine(row.lastPrompt)
            return (
              <button
                key={row.sessionId}
                data-skill-source-row={row.sessionId}
                onClick={() => onSelect(row.sessionId, row.title ?? null)}
                style={rowStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'transparent'
                }}
              >
                <span style={{ color: '#818cf8', marginTop: 2, flexShrink: 0 }}>
                  <MessageSquare size={14} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 12, fontWeight: 600,
                    color: 'var(--text-primary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {title}
                  </span>
                  {preview && (
                    <span style={{
                      display: 'block', fontSize: 10.5, color: 'var(--text-muted)',
                      marginTop: 2, lineHeight: 1.4, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {preview}
                    </span>
                  )}
                </span>
                {row.timestamp > 0 && (
                  <span style={{
                    fontSize: 10, color: 'var(--text-faint)', flexShrink: 0,
                    marginTop: 1, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatDateTimeShort(resolvedLocale, row.timestamp)}
                  </span>
                )}
              </button>
            )
          })}

          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              data-skill-source-more
              style={{
                alignSelf: 'center', marginTop: 8, padding: '5px 12px',
                borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--accent-text)',
              }}
            >
              {t('skills.draftSource.showMore', { count: hidden })}
            </button>
          )}
        </div>
      )}
    </SessionReuseDialogShell>
  )
}
