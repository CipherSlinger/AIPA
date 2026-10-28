// One muted line above the transcript that says who started this conversation
// and when. The archive can afford no such line at all, but here — where the
// transcript otherwise reads exactly like something the user typed — silence
// would be a lie. It is a single line on the reading column's axis, with no
// dismiss control and no icon-button row, so it stays quieter than the chat.
import type { CSSProperties } from 'react'
import { Clock, Plug } from 'lucide-react'
import { useChatStore, useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { relativeTime } from './messageUtils'
import { sessionProvenance } from './sessionProvenance'

const lineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  fontSize: 11,
  color: 'var(--text-muted)',
  userSelect: 'none',
}

const labelStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const jobButtonStyle: CSSProperties = {
  flexShrink: 1,
  maxWidth: 200,
  minWidth: 0,
  padding: 0,
  margin: 0,
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: 2,
}

export default function SessionOriginLine() {
  const t = useT()
  // `viewSessionId`, not `currentSessionId`: the latter is overwritten by a
  // live bridge id while a turn streams, which is not a session in the list.
  const viewSessionId = useChatStore(s => s.viewSessionId)
  const sessions = useSessionStore(s => s.sessions)
  const provenance = sessionProvenance(sessions, viewSessionId)
  if (!provenance) return null

  const { origin, startedAt } = provenance
  const when = relativeTime(startedAt, t)

  return (
    <div style={{ flexShrink: 0, padding: '6px 0 0' }}>
      <div className="chat-column" style={lineStyle}>
        {origin.kind === 'automation' ? (
          <>
            <Clock size={11} style={{ flexShrink: 0 }} />
            <span style={{ flexShrink: 0 }}>{t('chat.origin.automationBy')}</span>
            <button
              type="button"
              onClick={() => useUiStore.getState().openSettingsAt('automations')}
              title={t('chat.origin.openAutomation')}
              style={jobButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-muted)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'inherit' }}
            >
              {origin.jobName}
            </button>
            <span style={labelStyle}>{t('chat.origin.automationSuffix', { time: when })}</span>
          </>
        ) : (
          <>
            <Plug size={11} style={{ flexShrink: 0 }} />
            <span style={labelStyle}>{t('chat.origin.pluginStarted', { name: origin.pluginLabel, time: when })}</span>
          </>
        )}
      </div>
    </div>
  )
}
