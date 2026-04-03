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
          gap: 3,
          padding: '1px 6px',
          background: 'rgba(139, 92, 246, 0.12)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: 10,
          color: 'rgb(139, 92, 246)',
          fontSize: 10,
          cursor: 'default',
          userSelect: 'none',
        }}
        aria-label={t('fork.badgeLabel')}
      >
        <GitBranch size={10} />
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
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: '8px 0',
            zIndex: 50,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div style={{ padding: '0 12px 6px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
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
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
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
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
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
