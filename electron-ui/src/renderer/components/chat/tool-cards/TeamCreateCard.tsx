/**
 * TeamCreateCard.tsx
 * Renders the TeamCreate tool inline card.
 *
 * Input fields:
 *   teamName?: string   — team name (also checked as input.name)
 *   name?: string       — alternative team name field
 *   members?: string[]  — list of member names/IDs shown as badges
 *   description?: string — optional team description
 *
 * While loading: shows pulsing "Creating team..." indicator.
 * After result: shows "Team created" success badge + collapsible JSON preview.
 *
 * Theme: Emerald/teal — rgba(16,185,129,0.35) left border, #10b981 icon color.
 */

import React, { useState, useCallback } from 'react'
import { Users, Check, Clipboard, ChevronDown, ChevronUp } from 'lucide-react'

// ── CopyBtn ───────────────────────────────────────────────────────────────────

interface CopyBtnProps {
  text: string
}

function CopyBtn({ text }: CopyBtnProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [text])

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy result'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 6,
        color: copied ? '#4ade80' : 'var(--text-muted)',
        fontSize: 10,
        transition: 'color 0.15s ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#10b981' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── TeamCreateCard ─────────────────────────────────────────────────────────────

export interface TeamCreateCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function TeamCreateCard({ input, result, isLoading }: TeamCreateCardProps) {
  const [resultExpanded, setResultExpanded] = useState(false)

  const teamName: string =
    typeof input.teamName === 'string' && input.teamName
      ? input.teamName
      : typeof input.name === 'string' && input.name
      ? input.name
      : '(unnamed team)'

  const members: string[] = Array.isArray(input.members)
    ? (input.members as unknown[]).map((m) => String(m))
    : []

  const description: string | null =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null

  const hasResult = typeof result === 'string' && result.length > 0
  const isDone = !isLoading && hasResult

  const borderColor = isLoading
    ? 'rgba(16,185,129,0.65)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(16,185,129,0.35)'

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
        <Users
          size={13}
          style={{ color: 'rgba(16,185,129,0.85)', flexShrink: 0 }}
        />

        {/* Badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 6px',
          borderRadius: 5,
          background: 'rgba(16,185,129,0.15)',
          border: '1px solid rgba(16,185,129,0.30)',
          color: '#6ee7b7',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          Team Create
        </span>

        {/* Team name */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(110,231,183,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {teamName}
        </span>

        {/* Loading indicator */}
        {isLoading && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(16,185,129,0.75)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Creating team...
          </span>
        )}

        {/* Success badge */}
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
            Team created
          </span>
        )}
      </div>

      {/* Input details: description + members */}
      {(description || members.length > 0) && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '6px 10px', background: 'var(--section-bg)' }}>
            {description && (
              <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                marginBottom: members.length > 0 ? 6 : 0,
                lineHeight: 1.45,
                fontStyle: 'italic',
              }}>
                {description}
              </div>
            )}
            {members.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {members.map((member, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 7px',
                      borderRadius: 5,
                      background: 'rgba(16,185,129,0.10)',
                      border: '1px solid rgba(16,185,129,0.25)',
                      color: 'rgba(110,231,183,0.85)',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {member}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Result section — collapsible JSON preview */}
      {hasResult && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '6px 10px', background: 'var(--section-bg)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: resultExpanded ? 6 : 0,
            }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                Result
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <CopyBtn text={result!} />
                <button
                  onClick={() => setResultExpanded(!resultExpanded)}
                  title={resultExpanded ? 'Collapse' : 'Expand result'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    color: 'var(--text-muted)',
                    borderRadius: 4,
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#10b981' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  {resultExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>

            {resultExpanded && (
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
                background: 'var(--code-bg)',
                border: '1px solid var(--bg-hover)',
                borderRadius: 4,
                padding: '8px 10px',
                overflow: 'auto',
                maxHeight: 240,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {result}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
