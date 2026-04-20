/**
 * AdvisorToolCard.tsx
 * Renders the advisor tool call inline — secondary reviewer model.
 *
 * The advisor is a stronger model that reviews the conversation and provides
 * feedback before the agent declares a task complete.
 *
 * States:
 *   Running — "Reviewing..." pulse indicator
 *   Done    — "Advisor reviewed" green badge
 *   Error   — "Advisor unavailable (error_code)" red badge
 *
 * Theme: Violet/purple — rgba(139,92,246,0.5) left border.
 */

import React, { useState } from 'react'
import { Eye, Check, AlertCircle } from 'lucide-react'

export interface AdvisorToolCardProps {
  input: Record<string, unknown>
  result?: unknown
  isLoading?: boolean
  error?: boolean
}

export function AdvisorToolCard({ input, result, isLoading, error }: AdvisorToolCardProps) {
  const [expanded, setExpanded] = useState(false)

  const PREVIEW_CHARS = 300

  // Parse advisor result content — may be object (from tool_result) or string (serialized JSON)
  let resultText: string | null = null
  let errorCode: string | null = null

  if (result !== null && result !== undefined && result !== '') {
    // If result is already an object (tool_result passes content directly)
    if (typeof result !== 'string') {
      const obj = result as Record<string, unknown>
      if (obj.type === 'advisor_tool_result_error') {
        errorCode = (obj.error_code as string) || 'unknown'
      } else if (obj.type === 'advisor_result') {
        resultText = (obj.text as string) || ''
      } else if (obj.type === 'advisor_redacted_result') {
        resultText = '(encrypted — advisor reviewed the conversation)'
      } else if (typeof obj.text === 'string') {
        resultText = obj.text
      } else {
        resultText = JSON.stringify(obj, null, 2)
      }
    } else {
      // String: try parsing as JSON
      try {
        const parsed = JSON.parse(result)
        if (parsed.type === 'advisor_tool_result_error') {
          errorCode = parsed.error_code || 'unknown'
        } else if (parsed.type === 'advisor_result') {
          resultText = parsed.text || ''
        } else if (parsed.type === 'advisor_redacted_result') {
          resultText = '(encrypted — advisor reviewed the conversation)'
        } else if (typeof parsed.text === 'string') {
          resultText = parsed.text
        } else {
          resultText = result
        }
      } catch {
        resultText = result
      }
    }
  }

  const isDone = !isLoading && (resultText !== null || errorCode !== null)
  const hasError = error || errorCode !== null

  const borderColor = isLoading
    ? 'rgba(139,92,246,0.70)'
    : hasError
    ? 'rgba(239,68,68,0.50)'
    : 'rgba(34,197,94,0.50)'

  const previewText = resultText && resultText.length > PREVIEW_CHARS && !expanded
    ? resultText.slice(0, PREVIEW_CHARS) + '...'
    : resultText ?? ''

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
        <Eye size={13} style={{ color: 'rgba(139,92,246,0.85)', flexShrink: 0 }} />

        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(139,92,246,0.90)',
          fontWeight: 600,
        }}>
          Advisor Review
        </span>

        {isLoading && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(139,92,246,0.80)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Reviewing...
          </span>
        )}

        {isDone && !hasError && (
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
            Advisor reviewed
          </span>
        )}

        {hasError && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.28)',
            color: '#f87171',
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}>
            <AlertCircle size={9} style={{ flexShrink: 0 }} />
            Unavailable{errorCode ? ` (${errorCode})` : ''}
          </span>
        )}
      </div>

      {/* Result preview */}
      {isDone && !hasError && resultText && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: 6,
            }}>
              Feedback
            </span>
            <pre style={{
              fontSize: 11,
              margin: 0,
              fontFamily: 'monospace',
              background: 'var(--code-bg)',
              border: '1px solid var(--bg-hover)',
              borderRadius: 4,
              padding: '6px 8px',
              overflow: 'auto',
              maxHeight: expanded ? 400 : 120,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {previewText}
            </pre>
            {resultText.length > PREVIEW_CHARS && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10,
                  color: 'rgba(139,92,246,0.70)',
                  padding: '2px 0',
                  marginTop: 2,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(139,92,246,1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(139,92,246,0.70)' }}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
