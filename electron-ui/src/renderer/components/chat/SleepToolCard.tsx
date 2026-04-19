import React from 'react'
import { Moon, Check } from 'lucide-react'

function formatDuration(input: Record<string, unknown>): string {
  if (typeof input.duration_ms === 'number') {
    const ms = input.duration_ms
    if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} seconds`
    return `${ms} ms`
  }
  if (typeof input.seconds === 'number') {
    return `${input.seconds} seconds`
  }
  return ''
}

export interface SleepToolCardProps {
  input: Record<string, unknown>
  result?: string | null
}

export function SleepToolCard({ input, result }: SleepToolCardProps) {
  const hasResult = typeof result === 'string' && result.length > 0
  const duration = formatDuration(input)
  const reason = typeof input.reason === 'string' ? input.reason : ''

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '2px solid rgba(139,92,246,0.5)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <Moon size={13} style={{ color: 'rgba(167,139,250,0.80)', flexShrink: 0 }} />

        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(167,139,250,0.70)',
          flexShrink: 0,
        }}>
          Sleep
        </span>

        {duration && (
          <span style={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'rgba(167,139,250,0.85)',
            fontWeight: 600,
          }}>
            {duration}
          </span>
        )}

        {reason && (
          <span style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {reason}
          </span>
        )}

        {hasResult ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.28)',
            color: '#4ade80',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            <Check size={9} />
            Woke up
          </span>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.28)',
            color: '#a78bfa',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            Sleeping...
          </span>
        )}
      </div>
    </div>
  )
}
