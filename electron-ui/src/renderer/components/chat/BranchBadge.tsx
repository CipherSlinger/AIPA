// BranchBadge — shows a git-branch icon on fork-point messages (Iteration 456)
// Displayed on user messages that were used as a fork point for a new session.
import React, { useState, useRef, useEffect } from 'react'
import { GitBranch } from 'lucide-react'
import { useT } from '../../i18n'

interface ForkEntry {
  sourceSessionId: string
  forkMessageIndex: number
  forkedSessionId: string
  forkedSessionTitle?: string
}

interface BranchBadgeProps {
  forkEntry: ForkEntry
  onCompare?: (sessionA: string, sessionB: string) => void
  onNavigate?: (sessionId: string) => void
}

export function BranchBadge({ forkEntry, onCompare, onNavigate }: BranchBadgeProps) {
  const t = useT()
  const [showTooltip, setShowTooltip] = useState(false)
  const badgeRef = useRef<HTMLDivElement>(null)
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
    }
  }, [])

  const handleMouseEnter = () => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    tooltipTimeout.current = setTimeout(() => setShowTooltip(false), 200)
  }

  const forkedTitle = forkEntry.forkedSessionTitle || forkEntry.forkedSessionId.slice(0, 8)

  return (
    <div
      ref={badgeRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.30)',
          borderRadius: 6,
          color: '#a5b4fc',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'default',
          userSelect: 'none',
          transition: 'all 0.15s ease',
        }}
        aria-label={t('fork.badgeLabel')}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.20)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)' }}
      >
        <GitBranch size={12} style={{ color: '#818cf8' }} />
        <span>{t('fork.badge')}</span>
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="popup-enter"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            width: 220,
            background: 'var(--glass-bg-popup)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 8,
            boxShadow: 'var(--glass-shadow)',
            padding: '8px 0',
            zIndex: 50,
            animation: 'slideUp 0.15s ease',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div style={{ padding: '0 12px 6px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>
            <GitBranch size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {t('fork.forkedTo')}: <strong style={{ color: 'var(--text-primary)' }}>{forkedTitle}</strong>
          </div>
          {onNavigate && (
            <button
              onClick={() => { setShowTooltip(false); onNavigate(forkEntry.forkedSessionId) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: 11,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              {t('fork.openFork')}
            </button>
          )}
          {onCompare && (
            <button
              onClick={() => { setShowTooltip(false); onCompare(forkEntry.sourceSessionId, forkEntry.forkedSessionId) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: 11,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              {t('fork.compareWithFork')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export type { ForkEntry }
