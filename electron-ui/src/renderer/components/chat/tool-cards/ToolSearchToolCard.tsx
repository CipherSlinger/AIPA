/**
 * ToolSearchToolCard.tsx
 * Renders the ToolSearchTool inline card.
 *
 * Input fields:
 *   query: string  — search query for finding available tools
 *
 * While loading: shows pulsing "Searching..." indicator.
 * After result: shows list of found tool names/descriptions.
 *
 * Theme: Slate/gray — meta/system tool character.
 * Left border: rgba(148,163,184,0.35) idle, rgba(148,163,184,0.70) loading,
 *              rgba(34,197,94,0.50) done.
 */

import React, { useState } from 'react'
import { Search, Check } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolEntry {
  name: string
  description?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse the result text as a JSON array of tool entries.
 * Accepts:
 *   - string[]  (tool names only)
 *   - { name: string; description?: string }[]
 * Returns null if the text is not parseable as either format.
 */
function parseToolList(text: string): ToolEntry[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) return null
  if (parsed.length === 0) return []

  // String array
  if (typeof parsed[0] === 'string') {
    return (parsed as string[]).map((name) => ({ name }))
  }

  // Object array with at least a name field
  if (typeof parsed[0] === 'object' && parsed[0] !== null && 'name' in (parsed[0] as object)) {
    return (parsed as Record<string, unknown>[]).map((item) => ({
      name: String(item.name ?? ''),
      description: typeof item.description === 'string' ? item.description : undefined,
    }))
  }

  return null
}

// ── ToolSearchToolCard ────────────────────────────────────────────────────────

export interface ToolSearchToolCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function ToolSearchToolCard({ input, result, isLoading }: ToolSearchToolCardProps) {
  const [expanded, setExpanded] = useState(false)

  const query = typeof input.query === 'string' ? input.query : ''
  const hasResult = typeof result === 'string' && result.length > 0
  const isDone = !isLoading && hasResult

  // Parse result
  const toolList = hasResult ? parseToolList(result!) : null
  const rawResult = hasResult && toolList === null ? result! : null

  const borderColor = isLoading
    ? 'rgba(148,163,184,0.70)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(148,163,184,0.35)'

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
        <Search
          size={13}
          style={{ color: 'rgba(148,163,184,0.85)', flexShrink: 0 }}
        />

        {/* Query label */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(148,163,184,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {query || '(empty query)'}
        </span>

        {/* Status badge */}
        {isLoading && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(148,163,184,0.80)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Searching...
          </span>
        )}

        {isDone && toolList !== null && (
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
            {toolList.length} tool{toolList.length !== 1 ? 's' : ''} found
          </span>
        )}

        {isDone && toolList === null && rawResult && (
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
            Done
          </span>
        )}
      </div>

      {/* Result section — structured tool list */}
      {isDone && toolList !== null && toolList.length > 0 && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            {/* Section label */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 6,
            }}>
              Available Tools
            </div>

            {/* Tool chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(expanded ? toolList : toolList.slice(0, 12)).map((tool, i) => (
                <div
                  key={i}
                  title={tool.description ?? ''}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(148,163,184,0.10)',
                    border: '1px solid rgba(148,163,184,0.25)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    color: 'rgba(148,163,184,0.90)',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tool.name}
                </div>
              ))}

              {/* Expand / collapse toggle */}
              {toolList.length > 12 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'none',
                    border: '1px solid rgba(148,163,184,0.20)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: 'rgba(148,163,184,0.65)',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.65)' }}
                >
                  {expanded ? 'Show less' : `+${toolList.length - 12} more`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty result */}
      {isDone && toolList !== null && toolList.length === 0 && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <span style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontStyle: 'italic',
            }}>
              No tools matched "{query}"
            </span>
          </div>
        </div>
      )}

      {/* Raw text fallback (non-JSON result) */}
      {isDone && rawResult && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <pre style={{
              fontSize: 11,
              margin: 0,
              fontFamily: 'monospace',
              background: 'var(--code-bg)',
              border: '1px solid var(--bg-hover)',
              borderRadius: 4,
              padding: '6px 8px',
              overflow: 'auto',
              maxHeight: 180,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {rawResult}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
