import React, { useState } from 'react'
import { Zap, ChevronDown, ChevronRight, Terminal, MessageSquare, Globe, Check, X, Loader } from 'lucide-react'

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
      <span style={{ display: 'inline-flex', animation: 'spin 1s linear infinite' }}>
        <Loader size={12} color="var(--accent)" />
      </span>
    )
  }
  if (status === 'success') return <Check size={12} color="#22c55e" />
  return <X size={12} color="#ef4444" />
}

export default function HookProgressCard({ event }: HookProgressCardProps) {
  const [expanded, setExpanded] = useState(false)
  const hasOutput = Boolean(event.output)

  return (
    <div
      role="status"
      aria-label={`Hook ${event.hookEvent} ${event.status}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        background: 'var(--popup-bg)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 8px',
        marginBottom: 4,
        fontSize: 11,
        maxWidth: 340,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Zap size={11} color="var(--accent)" />
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{event.hookEvent}</span>
        <HookTypeIcon hookType={event.hookType} />
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{event.hookType}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <StatusIcon status={event.status} />
        </span>
        {hasOutput && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
            aria-label={expanded ? 'Collapse output' : 'Expand output'}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
      </div>
      {expanded && hasOutput && (
        <pre style={{
          margin: '4px 0 0 0',
          padding: '4px 6px',
          background: 'var(--action-btn-bg)',
          borderRadius: 4,
          fontSize: 10,
          color: 'var(--text-muted)',
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
