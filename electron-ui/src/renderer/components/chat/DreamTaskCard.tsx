/**
 * DreamTaskCard — visualises completed auto-dream (memory consolidation) events.
 *
 * DreamTask is an in-process sub-agent in the CLI that consolidates memory files
 * in the background after every N sessions.  It runs outside the stream-json
 * event flow and updates ~/.claude/projects/<hash>/.consolidate-lock on completion.
 * AIPA detects this via mtime polling around the cli:result event.
 *
 * This component renders a compact card shown below the chat whenever at least
 * one dream event occurred during the current conversation.
 */
import React, { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

export interface DreamEvent {
  id: string
  timestamp: number
  sessionsReviewed?: number
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
  const [expanded, setExpanded] = useState(false)

  if (events.length === 0) return null

  const latest = events[events.length - 1]
  const label =
    events.length === 1
      ? new Date(latest.timestamp).toLocaleTimeString()
      : `${events.length} consolidations`

  return (
    <div
      role="status"
      aria-label="Memory consolidation completed"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        background: 'rgba(15,12,28,0.88)',
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
          Memory Consolidation
        </span>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            fontStyle: 'italic',
          }}
        >
          auto-dream
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
            aria-label={expanded ? 'Collapse history' : 'Expand history'}
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
        Background memory files updated
      </div>

      {/* Expanded history */}
      {expanded && events.length > 1 && (
        <div
          style={{
            marginTop: 6,
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--glass-border)',
            borderRadius: 6,
          }}
        >
          {events.map(ev => (
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
              {ev.sessionsReviewed != null && (
                <span style={{ color: 'var(--text-faint)' }}>
                  · {ev.sessionsReviewed} session{ev.sessionsReviewed !== 1 ? 's' : ''} reviewed
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
