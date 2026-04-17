/**
 * SleepToolCard.tsx
 * Renders the SleepTool inline card.
 *
 * Input fields:
 *   duration_ms?: number  — sleep duration in milliseconds
 *   seconds?: number      — sleep duration in seconds (alternative)
 *
 * While loading: shows pulsing "Pausing..." indicator.
 * After result: shows "Wait complete" badge.
 */

import React from 'react'
import { Timer, Check } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format milliseconds into a human-readable duration string */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (Number.isInteger(seconds)) return `${seconds}s`
  return `${seconds.toFixed(1)}s`
}

// ── SleepToolCard ─────────────────────────────────────────────────────────────

export interface SleepToolCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function SleepToolCard({ input, result, isLoading }: SleepToolCardProps) {
  const durationMs: number =
    typeof input.duration_ms === 'number'
      ? input.duration_ms
      : typeof input.seconds === 'number'
      ? input.seconds * 1000
      : 0

  const durationLabel = durationMs > 0 ? formatDuration(durationMs) : '...'
  const isDone = !isLoading && result !== undefined && result !== null

  const borderColor = isLoading
    ? 'rgba(139,92,246,0.60)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(139,92,246,0.35)'

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'border-color 0.2s ease',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <Timer
          size={13}
          style={{ color: 'rgba(167,139,250,0.85)', flexShrink: 0 }}
        />

        {/* Duration label */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(167,139,250,0.90)',
          fontWeight: 600,
        }}>
          {`Waiting ${durationLabel}`}
        </span>

        {/* Status badge */}
        {isLoading ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(167,139,250,0.80)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            Pausing...
          </span>
        ) : isDone ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.28)',
            color: '#4ade80',
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}>
            <Check size={9} style={{ flexShrink: 0 }} />
            Wait complete
          </span>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(167,139,250,0.60)',
            flexShrink: 0,
          }}>
            Scheduling...
          </span>
        )}
      </div>
    </div>
  )
}
