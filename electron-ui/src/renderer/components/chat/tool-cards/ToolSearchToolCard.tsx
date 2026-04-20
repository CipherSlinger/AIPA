import React, { useState, useCallback } from 'react'
import { Search, Check, Clipboard, Wrench } from 'lucide-react'

interface ToolEntry {
  name: string
  description?: string
}

function parseToolList(text: string): ToolEntry[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) return null
  if (parsed.length === 0) return []

  if (typeof parsed[0] === 'string') {
    return (parsed as string[]).map((name) => ({ name }))
  }

  if (typeof parsed[0] === 'object' && parsed[0] !== null && 'name' in (parsed[0] as object)) {
    return (parsed as Record<string, unknown>[]).map((item) => ({
      name: String(item.name ?? ''),
      description: typeof item.description === 'string' ? item.description : undefined,
    }))
  }

  return null
}

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
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#22d3ee' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export interface ToolSearchToolCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function ToolSearchToolCard({ input, result, isLoading }: ToolSearchToolCardProps) {
  const [expanded, setExpanded] = useState(false)

  const query = typeof input.query === 'string' ? input.query
    : typeof input.tool_name === 'string' ? input.tool_name
    : ''
  const limit = typeof input.limit === 'number' ? input.limit : null

  const hasResult = typeof result === 'string' && result.length > 0
  const isDone = !isLoading && hasResult

  const toolList = hasResult ? parseToolList(result!) : null
  const rawResult = hasResult && toolList === null ? result! : null

  const PREVIEW_CHARS = 200

  const borderColor = isLoading
    ? 'rgba(6,182,212,0.70)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(6,182,212,0.35)'

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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <Search size={13} style={{ color: 'rgba(6,182,212,0.85)', flexShrink: 0 }} />

        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(6,182,212,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {query || '(empty query)'}
        </span>

        {limit !== null && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}>
            limit: {limit}
          </span>
        )}

        {isLoading && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(6,182,212,0.80)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Searching...
          </span>
        )}

        {isDone && toolList !== null && toolList.length > 0 && (
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

        {isDone && toolList !== null && toolList.length === 0 && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 8,
            background: 'rgba(148,163,184,0.10)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: 'var(--text-muted)',
            fontSize: 10,
            fontWeight: 500,
            flexShrink: 0,
          }}>
            No tools found
          </span>
        )}

        {isDone && rawResult && (
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

      {isDone && toolList !== null && toolList.length > 0 && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
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
                    background: 'rgba(6,182,212,0.08)',
                    border: '1px solid rgba(6,182,212,0.22)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    color: 'rgba(6,182,212,0.90)',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <Wrench size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                  {tool.name}
                </div>
              ))}

              {toolList.length > 12 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'none',
                    border: '1px solid rgba(6,182,212,0.20)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: 'rgba(6,182,212,0.65)',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(6,182,212,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(6,182,212,0.65)' }}
                >
                  {expanded ? 'Show less' : `+${toolList.length - 12} more`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isDone && toolList !== null && toolList.length === 0 && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <span style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontStyle: 'italic',
            }}>
              No tools matched{query ? ` "${query}"` : ''}
            </span>
          </div>
        </div>
      )}

      {isDone && rawResult && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6,
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
              <CopyBtn text={rawResult} />
            </div>
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
              {rawResult.length > PREVIEW_CHARS && !expanded
                ? rawResult.slice(0, PREVIEW_CHARS) + '…'
                : rawResult}
            </pre>
            {rawResult.length > PREVIEW_CHARS && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10,
                  color: 'rgba(6,182,212,0.70)',
                  padding: '2px 0',
                  marginTop: 2,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(6,182,212,1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(6,182,212,0.70)' }}
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
