/**
 * TeamDeleteCard.tsx
 * Renders the TeamDelete tool inline card.
 *
 * Input fields:
 *   teamName?: string  — team name to delete
 *   name?: string      — alternative team name field
 *   teamId?: string    — team ID to delete
 *   id?: string        — alternative team ID field
 *
 * While loading: shows pulsing "Deleting team..." indicator.
 * After result: shows "Team deleted" confirmation badge.
 *
 * Theme: Red — rgba(239,68,68,0.35) left border, #ef4444 icon color.
 */

import React from 'react'
import { UserMinus, Check } from 'lucide-react'

// ── TeamDeleteCard ─────────────────────────────────────────────────────────────

export interface TeamDeleteCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function TeamDeleteCard({ input, result, isLoading }: TeamDeleteCardProps) {
  // Resolve team identifier: prefer name, fall back to ID
  const teamName: string =
    typeof input.teamName === 'string' && input.teamName
      ? input.teamName
      : typeof input.name === 'string' && input.name
      ? input.name
      : ''

  const teamId: string =
    typeof input.teamId === 'string' && input.teamId
      ? input.teamId
      : typeof input.id === 'string' && input.id
      ? input.id
      : ''

  const label = teamName || teamId || '(unknown team)'

  const hasResult = typeof result === 'string' && result.length > 0
  const isDone = !isLoading && hasResult

  const borderColor = isLoading
    ? 'rgba(239,68,68,0.65)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(239,68,68,0.35)'

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
        <UserMinus
          size={13}
          style={{ color: 'rgba(239,68,68,0.85)', flexShrink: 0 }}
        />

        {/* Badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 6px',
          borderRadius: 5,
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.30)',
          color: '#fca5a5',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          Team Delete
        </span>

        {/* Team name/ID */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(252,165,165,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>

        {/* Loading indicator */}
        {isLoading && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(239,68,68,0.75)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Deleting team...
          </span>
        )}

        {/* Done badge */}
        {isDone && (
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
            Team deleted
          </span>
        )}
      </div>
    </div>
  )
}
