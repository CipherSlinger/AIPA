import React, { useState } from 'react'
import { Zap, ChevronDown, ChevronRight, Terminal, MessageSquare, Globe, Check, X } from 'lucide-react'

interface HookEvent {
  id: string
  hookEvent: string
  hookType: string
  status: 'running' | 'success' | 'error'
  output?: string
  timestamp: number
}

interface HookProgressCardProps {
  event: HookEvent
}

function HookTypeIcon({ hookType }: { hookType: string }) {
  const size = 12
  if (hookType === 'command') return <Terminal size={size} color="var(--text-muted)" />
  if (hookType === 'prompt') return <MessageSquare size={size} color="var(--text-muted)" />
  if (hookType === 'http') return <Globe size={size} color="var(--text-muted)" />
  return <Zap size={size} color="var(--text-muted)" />
}

function StatusIcon({ status }: { status: HookEvent['status'] }) {
  if (status === 'running') {
    return (
      <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(129,140,248,0.3)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    )
  }
  if (status === 'success') return <Check size={12} color="#22c55e" />
  return <X size={12} color="#f87171" />
}

export default function HookProgressCard({ event }: HookProgressCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [chevronHover, setChevronHover] = useState(false)
  const hasOutput = Boolean(event.output)

  const borderLeft =
    event.status === 'running'
      ? '3px solid rgba(99,102,241,0.8)'
      : event.status === 'success'
        ? '3px solid rgba(34,197,94,0.5)'
        : '3px solid rgba(239,68,68,0.5)'

  return (
    <div
      role="status"
      aria-label={`Hook ${event.hookEvent} ${event.status}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(99,102,241,0.12)',
        borderLeft,
        borderRadius: 10,
        padding: '6px 10px',
        marginBottom: 4,
        fontSize: 11,
        maxWidth: 340,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Zap size={11} color="#818cf8" />
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{event.hookEvent}</span>
        <HookTypeIcon hookType={event.hookType} />
        <span style={{
          color: event.status === 'running' ? '#818cf8' : event.status === 'success' ? '#4ade80' : 'var(--text-muted)',
          fontSize: 10,
          fontStyle: event.status === 'running' ? 'italic' : 'normal',
        }}>{event.hookType}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}>
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          <StatusIcon status={event.status} />
        </span>
        {hasOutput && (
          <button
            onClick={() => setExpanded(v => !v)}
            onMouseEnter={() => setChevronHover(true)}
            onMouseLeave={() => setChevronHover(false)}
            style={{
              background: chevronHover ? 'var(--border)' : 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '1px 3px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              color: 'rgba(165,180,252,0.7)',
              transition: 'background 0.15s ease',
            }}
            aria-label={expanded ? 'Collapse output' : 'Expand output'}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
      </div>
      {expanded && hasOutput && (
        <pre style={{
          margin: '4px 0 0 0',
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.30)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#a5b4fc',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 120,
          overflowY: 'auto',
        }}>
          {event.output}
        </pre>
      )}
    </div>
  )
}
