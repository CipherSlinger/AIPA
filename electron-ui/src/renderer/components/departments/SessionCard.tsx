// SessionCard — displays a single session as a clickable card in the DepartmentDashboard
import React, { useState, useEffect } from 'react'
import { MessageSquare, Clock, Trash2, ArrowRight } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'

// Stable fallback — avoids new {} on every Zustand selector call (which causes infinite re-renders)
const EMPTY_COLOR_LABELS: Record<string, string> = {}

/** Format a duration in ms to a compact human string: "2m", "1h 4m", "3d" */
function formatDuration(ms: number): string {
  if (ms < 60000) return '<1m'
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days}d`
  if (hours >= 1) {
    const remainMins = minutes % 60
    return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`
  }
  return `${minutes}m`
}

interface SessionCardProps {
  session: SessionListItem
  onClick: () => void
  isActive?: boolean
  isLoading?: boolean
  onDelete?: () => void
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

export default function SessionCard({ session, onClick, isActive, isLoading, onDelete }: SessionCardProps) {
  const t = useT()
  const sessionColorLabels = usePrefsStore(s => s.prefs?.sessionColorLabels ?? EMPTY_COLOR_LABELS)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const currentLabel = sessionColorLabels[session.sessionId] ?? null
  const LABEL_COLORS = ['#f87171', '#f97316', '#fbbf24', '#22c55e', '#6366f1', '#a78bfa', '#ec4899']
  const pinKey = `aipa:session-pin:${session.sessionId}`
  const [pinned, setPinned] = useState(() => localStorage.getItem(pinKey) === '1')
  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !pinned
    setPinned(next)
    if (next) localStorage.setItem(pinKey, '1')
    else localStorage.removeItem(pinKey)
  }
  const [hovered, setHovered] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const previewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!showDeleteConfirm) return
    const handleClick = () => setShowDeleteConfirm(false)
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDeleteConfirm])

  const title = session.title || session.lastPrompt?.slice(0, 60) || t('session.untitled')
  const preview = session.lastPrompt?.slice(0, 80) || ''
  const wordCount = preview ? preview.trim().split(/\s+/).filter(Boolean).length : 0
  const timeStr = formatRelativeTime(session.timestamp, t)
  const isToday = (() => {
    const d = new Date(session.timestamp)
    const now = new Date()
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })()

  // Derive session duration from firstTimestamp → timestamp (if available and meaningful)
  const sessionDuration = (() => {
    if (!session.firstTimestamp) return null
    const diff = session.timestamp - session.firstTimestamp
    if (diff < 60000) return null  // Less than 1 min — not worth showing
    return formatDuration(diff)
  })()

  // Derive status from props for the status pill
  const statusPill: { label: string; color: string; bg: string; dot: string } | null = isLoading
    ? { label: 'Running', color: '#818cf8', bg: 'rgba(99,102,241,0.14)', dot: '#6366f1' }
    : isActive
    ? { label: 'Active', color: '#4ade80', bg: 'rgba(34,197,94,0.13)', dot: 'rgba(34,197,94,0.85)' }
    : isToday
    ? { label: 'Idle', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', dot: 'rgba(251,191,36,0.75)' }
    : null

  return (
    <div
      onClick={(e) => {
        if (e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          const currentIdx = currentLabel ? LABEL_COLORS.indexOf(currentLabel) : -1
          const nextIdx = (currentIdx + 1) % (LABEL_COLORS.length + 1) // +1 for "clear"
          const nextColor = nextIdx < LABEL_COLORS.length ? LABEL_COLORS[nextIdx] : null
          const newLabels = { ...sessionColorLabels }
          if (nextColor) newLabels[session.sessionId] = nextColor
          else delete newLabels[session.sessionId]
          setPrefs({ sessionColorLabels: newLabels })
          window.electronAPI.prefsSet('sessionColorLabels', newLabels)
        } else {
          onClick()
        }
      }}
      onMouseEnter={() => {
        setHovered(true)
        previewTimerRef.current = setTimeout(() => setShowPreview(true), 800)
      }}
      onMouseLeave={() => {
        setHovered(false)
        setShowPreview(false)
        if (previewTimerRef.current) {
          clearTimeout(previewTimerRef.current)
          previewTimerRef.current = null
        }
        // 不要在这里 setShowDeleteConfirm(false)，让用户操作完再关
      }}
      onFocus={() => setHovered(true)}
      onBlur={() => {
        setHovered(false)
        setShowPreview(false)
        if (previewTimerRef.current) {
          clearTimeout(previewTimerRef.current)
          previewTimerRef.current = null
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
        if (e.key === 'Delete' && onDelete && !showDeleteConfirm) {
          e.preventDefault()
          setShowDeleteConfirm(true)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={title}
      style={{
          width: '100%',
          minHeight: 130,
          borderRadius: 10,
          border: `1px solid ${
            isActive
              ? 'rgba(99,102,241,0.35)'
              : hovered
              ? 'var(--glass-border-md)'
              : 'var(--glass-border)'
          }`,
          background: isActive
            ? 'rgba(99,102,241,0.10)'
            : hovered
            ? 'var(--glass-bg-low)'
            : 'var(--glass-bg-low)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          cursor: 'pointer',
          padding: '12px 14px 11px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          transition: 'all 0.15s ease',
          transform: hovered && !isActive ? 'translateY(-1px)' : 'none',
          boxShadow: isActive
            ? '0 2px 8px rgba(0,0,0,0.3)'
            : hovered
            ? 'var(--glass-shadow)'
            : '0 2px 8px rgba(0,0,0,0.3)',
          flexShrink: 0,
          position: 'relative',
          overflow: 'visible',
          // Active state: left accent
          borderLeft: isActive
            ? '3px solid rgba(99,102,241,0.6)'
            : hovered
            ? `3px solid rgba(99,102,241,0.35)`
            : currentLabel
            ? `3px solid ${currentLabel}55`
            : '1px solid rgba(255,255,255,0.08)',
          borderTop: pinned ? '2px solid #fbbf24' : undefined,
          opacity: isLoading ? 0.4 : 1,
          pointerEvents: isLoading ? 'none' : undefined,
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

      {/* Status pill — top right (active or running) */}
      {statusPill && !isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: statusPill.bg,
            borderRadius: 6,
            padding: '2px 7px 2px 5px',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusPill.dot,
            boxShadow: `0 0 0 2px ${statusPill.dot}33, 0 0 6px ${statusPill.dot}88`,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: statusPill.color,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}>
            {statusPill.label}
          </span>
        </div>
      )}

      {/* Active glow dot — top right (shown only when no status pill or loading) */}
      {isActive && isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#6366f1',
            boxShadow: '0 0 0 2px rgba(99,102,241,0.25), 0 0 8px rgba(99,102,241,0.6)',
          }}
        />
      )}

      {/* Color label dot — top left */}
      {currentLabel && (
        <div style={{
          position: 'absolute',
          top: 6,
          left: 6,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: currentLabel,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.2)`,
          zIndex: 2,
          pointerEvents: 'none',
        }} />
      )}

      {/* Loading spinner — top right */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.15)',
          borderTopColor: '#6366f1',
          animation: 'sc-spin 0.8s linear infinite',
        }} />
      )}

      {/* Delete confirm — top right */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'absolute',
            top: 8, right: 8,
            display: 'flex',
            gap: 4,
            zIndex: 5,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={e => {
              e.stopPropagation()
              onDelete?.()
              setShowDeleteConfirm(false)
            }}
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              border: 'none',
              background: 'rgba(239,68,68,0.85)',
              color: 'var(--text-primary)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.85)' }}
          >
            {t('dept.deleteConfirm')}
          </button>
          <button
            onClick={e => { e.stopPropagation(); setShowDeleteConfirm(false) }}
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.4)',
              color: 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {t('dept.cancel')}
          </button>
        </div>
      )}

      {/* Delete icon — top right, shown on hover */}
      {hovered && !isActive && !isLoading && !showDeleteConfirm && onDelete && (
        <button
          onClick={e => {
            e.stopPropagation()
            setShowDeleteConfirm(true)
          }}
          style={{
            position: 'absolute',
            top: 8, right: 8,
            background: 'rgba(239,68,68,0)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 3,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(252,165,165,0.12)'
            e.currentTarget.style.color = '#fca5a5'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          title={t('dept.deleteSession')}
        >
          <Trash2 size={12} />
        </button>
      )}

      {/* Pin button — shown on hover, left of delete */}
      {hovered && !isActive && !isLoading && !showDeleteConfirm && (
        <button
          onClick={togglePin}
          title={pinned ? 'Unpin session' : 'Pin session to top'}
          style={{
            position: 'absolute',
            top: 8,
            right: onDelete ? 30 : 8,
            background: pinned ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0)',
            border: 'none',
            cursor: 'pointer',
            color: pinned ? '#fbbf24' : 'var(--text-muted)',
            padding: 3,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            fontSize: 12,
            lineHeight: 1,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(251,191,36,0.15)'
            e.currentTarget.style.color = '#fbbf24'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = pinned ? 'rgba(251,191,36,0.15)' : 'transparent'
            e.currentTarget.style.color = pinned ? '#fbbf24' : 'var(--text-muted)'
          }}
        >
          📌
        </button>
      )}

      {/* Pin indicator — visible when pinned and not hovered */}
      {pinned && !hovered && (
        <div style={{
          position: 'absolute',
          top: 5,
          right: 6,
          fontSize: 10,
          opacity: 0.75,
          pointerEvents: 'none',
        }}>
          📌
        </div>
      )}

      {/* Icon + title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <MessageSquare
          size={14}
          color={isActive ? '#818cf8' : hovered ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)'}
          style={{ flexShrink: 0, marginTop: 1, transition: 'all 0.15s ease' }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            transition: 'all 0.15s ease',
            paddingRight: statusPill || isActive ? 72 : 0,
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
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            flex: 1,
            marginTop: 4,
          }}
        >
          {preview}
        </span>
      )}

      {/* Hover "Open" indicator — bottom-right, above footer */}
      {hovered && !isActive && !isLoading && (
        <div style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 10,
          fontWeight: 600,
          color: '#818cf8',
          opacity: 0.85,
          pointerEvents: 'none',
          transition: 'all 0.15s ease',
        }}>
          <span>Open</span>
          <ArrowRight size={10} />
          {currentLabel && (
            <span style={{ fontSize: 9, color: currentLabel, opacity: 0.8 }}>●</span>
          )}
        </div>
      )}

      {/* Footer: time + message count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 'auto',
          paddingTop: 6,
        }}
      >
        <Clock size={10} color="var(--text-muted)" style={{ opacity: 0.7, flexShrink: 0 }} />
        {isToday && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            color: '#818cf8',
            background: 'rgba(99,102,241,0.12)',
            borderRadius: 8,
            padding: '1px 5px',
            lineHeight: '14px',
            flexShrink: 0,
          }}>
            {t('session.today')}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }} title={new Date(session.timestamp).toLocaleString()}>{timeStr}</span>

        {wordCount > 0 && (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.4, margin: '0 1px' }}>·</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.65 }}>
              {wordCount}w
            </span>
          </>
        )}

        {/* Session duration (time from first to last message) */}
        {sessionDuration && (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.4, margin: '0 1px' }}>·</span>
            <span style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              opacity: 0.7,
            }} title="Session duration">
              {sessionDuration}
            </span>
          </>
        )}

        {session.messageCount !== undefined && session.messageCount > 0 && (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.4, margin: '0 1px' }}>·</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 600,
                color: isActive ? '#818cf8' : hovered ? 'var(--text-secondary)' : 'var(--text-muted)',
                background: isActive
                  ? 'rgba(99,102,241,0.18)'
                  : hovered
                  ? 'var(--glass-border-md)'
                  : 'rgba(255,255,255,0.06)',
                borderRadius: 20,
                padding: '1px 7px',
                lineHeight: '16px',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              {session.messageCount} {t('session.messages')}
            </span>
          </>
        )}
      </div>

      {showPreview && session.lastPrompt && session.lastPrompt.length > 80 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 6,
            zIndex: 50,
            background: 'rgba(8,8,16,1)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: '10px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', gap: 8 }}>
            <span>{new Date(session.timestamp).toLocaleString()}</span>
            {session.messageCount !== undefined && (
              <span style={{ marginLeft: 'auto' }}>{session.messageCount} messages</span>
            )}
          </div>
          <p style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 120,
            overflow: 'hidden',
          }}>
            {session.lastPrompt}
          </p>
        </div>
      )}
    </div>
  )
}
