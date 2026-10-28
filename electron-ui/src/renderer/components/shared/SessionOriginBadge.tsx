// A session row's origin: a scheduled automation or the plugin that opened the
// conversation. Deliberately quiet — the row's title is still the conversation,
// not who started it — and absent for anything the user started themselves.
import type { CSSProperties } from 'react'
import { Clock, Plug } from 'lucide-react'
import type { SessionOrigin } from '../../types/app.types'
import { useT } from '../../i18n'

export default function SessionOriginBadge({
  origin,
  style,
}: {
  origin?: SessionOrigin
  style?: CSSProperties
}) {
  const t = useT()
  if (!origin) return null

  const automation = origin.kind === 'automation'
  const label = automation ? origin.jobName : origin.pluginLabel
  const title = t(automation ? 'sessionOrigin.automationTitle' : 'sessionOrigin.pluginTitle', { name: label })

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        flexShrink: 0, maxWidth: 150, boxSizing: 'border-box',
        padding: '0 6px', borderRadius: 999, lineHeight: '15px',
        fontSize: 9, color: 'var(--text-muted)',
        background: 'var(--bg-hover)', border: '1px solid var(--border)',
        overflow: 'hidden', whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {automation
        ? <Clock size={9} style={{ flexShrink: 0 }} />
        : <Plug size={9} style={{ flexShrink: 0 }} />}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  )
}
