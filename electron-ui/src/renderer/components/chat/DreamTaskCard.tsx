/**
 * DreamTaskCard — visualises completed memory consolidation events.
 *
 * Two sources feed this card:
 *  - the CLI's own in-process "auto-dream", detected by AIPA polling
 *    `~/.claude/projects/<hash>/.consolidate-lock` around `cli:result`; it
 *    reports only that a run happened (`sessionsReviewed` when known);
 *  - AIPA's background consolidation pass (`source: 'dream'`), which reports
 *    how many memory entries it wrote and to which file.
 *
 * Shown below the chat while at least one event happened in this conversation.
 */
import React, { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { useT } from '../../i18n'

export interface DreamEvent {
  id: string
  timestamp: number
  sessionsReviewed?: number
  source?: 'cli' | 'dream'
  entries?: number
  file?: string
}

interface DreamTaskCardProps {
  events: DreamEvent[]
}

// Inject keyframes once
function ensureSpinKeyframe() {
  if (document.getElementById('dream-task-kf')) return
  const style = document.createElement('style')
  style.id = 'dream-task-kf'
  style.textContent = `
    @keyframes dream-pulse {
      0%, 100% { opacity: 0.82; }
      50%       { opacity: 0.45; }
    }
  `
  document.head.appendChild(style)
}

export default function DreamTaskCard({ events }: DreamTaskCardProps) {
  ensureSpinKeyframe()
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (events.length === 0) return null

  const latest = events[events.length - 1]
  const written = latest.source === 'dream'
  const label =
    events.length === 1
      ? new Date(latest.timestamp).toLocaleTimeString()
      : `${events.length} ${t('dream.cardCountSuffix')}`

  const detailOf = (ev: DreamEvent): string | null => {
    if (ev.entries != null && ev.entries > 0) {
      return t('dream.cardEntries', { count: ev.entries })
    }
    if (ev.sessionsReviewed != null) {
      return t('dream.cardSessions', { count: ev.sessionsReviewed })
    }
    return null
  }

  const latestDetail = detailOf(latest)

  return (
    <div
      role="status"
      aria-label={t('dream.cardAria')}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        background: 'var(--glass-bg-card)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        borderLeft: '3px solid rgba(139,92,246,0.60)',
        borderRadius: 10,
        padding: '6px 10px',
        marginBottom: 4,
        fontSize: 11,
        maxWidth: 340,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Brain size={12} color="rgba(167,139,250,0.82)" />
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {t('dream.cardTitle')}
        </span>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            fontStyle: 'italic',
          }}
        >
          {written ? t('dream.cardSourceDream') : t('dream.cardSourceCli')}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'var(--text-faint)',
            fontSize: 10,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}
        >
          {label}
        </span>
        {events.length > 1 && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '1px 3px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              color: 'rgba(167,139,250,0.60)',
              transition: 'all 0.15s ease',
            }}
            aria-label={expanded ? t('dream.cardCollapse') : t('dream.cardExpand')}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
      </div>

      {/* Status line */}
      <div
        style={{
          marginTop: 3,
          color: 'var(--text-secondary)',
          fontSize: 10,
        }}
      >
        {latestDetail || t('dream.cardSubtitle')}
      </div>

      {/* Expanded history */}
      {expanded && events.length > 1 && (
        <div
          style={{
            marginTop: 6,
            padding: '4px 8px',
            background: 'var(--code-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 6,
          }}
        >
          {events.map(ev => {
            const detail = detailOf(ev)
            return (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 0',
                  color: 'var(--text-secondary)',
                  fontSize: 10,
                }}
              >
                <Brain size={9} color="rgba(139,92,246,0.60)" />
                <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                {detail && <span style={{ color: 'var(--text-faint)' }}>· {detail}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
