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
        width: 240,
        minHeight: 130,
        borderRadius: 12,
        border: `1.5px solid ${
          isActive
            ? 'var(--accent)'
            : hovered
            ? 'rgba(255,255,255,0.14)'
            : 'rgba(255,255,255,0.07)'
        }`,
        background: isActive
          ? 'rgba(99,102,241,0.10)'
          : hovered
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
        padding: '13px 14px 11px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.18s, background 0.18s, transform 0.15s, box-shadow 0.18s',
        transform: hovered && !isActive ? 'translateY(-3px)' : 'none',
        boxShadow: isActive
          ? '0 0 0 1px var(--accent), 0 4px 20px rgba(99,102,241,0.18)'
          : hovered
          ? '0 8px 24px rgba(0,0,0,0.25)'
          : '0 1px 4px rgba(0,0,0,0.1)',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        // Left accent border
        borderLeft: `4px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      {/* Hover top-gradient overlay */}
      {(hovered || isActive) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isActive
              ? 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 60%)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
            borderRadius: 'inherit',
          }}
        />
      )}

      {/* Active glow dot — top right */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 0 2px rgba(99,102,241,0.25), 0 0 8px rgba(99,102,241,0.6)',
          }}
        />
      )}

      {/* Icon + title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <MessageSquare
          size={14}
          color={isActive ? 'var(--accent)' : hovered ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)'}
          style={{ flexShrink: 0, marginTop: 1, transition: 'color 0.15s' }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? 'var(--text-primary)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            transition: 'color 0.15s',
            paddingRight: isActive ? 16 : 0,
          }}
        >
          {title}
        </span>
      </div>

      {/* Preview text */}
      {preview && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.55,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            flex: 1,
            opacity: isActive ? 0.85 : 0.7,
          }}
        >
          {preview}
        </span>
      )}

      {/* Footer: time + message count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          marginTop: 'auto',
          paddingTop: 6,
        }}
      >
        <Clock size={10} color="var(--text-muted)" style={{ opacity: 0.7, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.8 }}>{timeStr}</span>

        {session.messageCount !== undefined && session.messageCount > 0 && (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.4, margin: '0 1px' }}>·</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 500,
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.08)',
                borderRadius: 20,
                padding: '1px 7px',
                lineHeight: '16px',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {session.messageCount} {t('session.messages')}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
