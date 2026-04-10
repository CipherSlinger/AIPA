// SessionCard — displays a single session as a clickable card in the DepartmentDashboard
import React, { useState } from 'react'
import { MessageSquare, Clock } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'

interface SessionCardProps {
  session: SessionListItem
  onClick: () => void
  isActive?: boolean
}

function formatRelativeTime(timestamp: number, t: (key: string) => string): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('session.justNow')
  if (minutes < 60) return `${minutes}${t('session.minutesAgo')}`
  if (hours < 24) return `${hours}${t('session.hoursAgo')}`
  if (days < 7) return `${days}${t('session.daysAgo')}`
  return new Date(timestamp).toLocaleDateString()
}

export default function SessionCard({ session, onClick, isActive }: SessionCardProps) {
  const t = useT()
  const [hovered, setHovered] = useState(false)

  const title = session.title || session.lastPrompt?.slice(0, 40) || t('session.untitled')
  const preview = session.lastPrompt?.slice(0, 80) || ''
  const timeStr = formatRelativeTime(session.timestamp, t)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 220,
        minHeight: 110,
        borderRadius: 10,
        border: `1.5px solid ${isActive ? 'var(--accent)' : hovered ? 'var(--border-hover, rgba(255,255,255,0.2))' : 'var(--border)'}`,
        background: isActive
          ? 'rgba(99,102,241,0.08)'
          : hovered
          ? 'rgba(255,255,255,0.04)'
          : 'var(--bg-sessionpanel)',
        cursor: 'pointer',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s, background 0.15s, transform 0.12s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.2)' : '0 1px 4px rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}
    >
      {/* Icon + title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <MessageSquare size={14} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {title}
        </span>
      </div>

      {/* Preview text */}
      {preview && (
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          flex: 1,
        }}>
          {preview}
        </span>
      )}

      {/* Footer: time + message count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        <Clock size={10} color="var(--text-muted)" />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeStr}</span>
        {session.messageCount !== undefined && session.messageCount > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 4,
            padding: '1px 5px',
          }}>
            {session.messageCount} {t('session.messages')}
          </span>
        )}
      </div>
    </div>
  )
}
