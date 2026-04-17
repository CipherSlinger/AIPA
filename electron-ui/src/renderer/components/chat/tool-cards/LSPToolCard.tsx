/**
 * LSPToolCard.tsx
 * Renders the LSPTool inline card (Language Server Protocol operations).
 *
 * Input fields:
 *   operation?: string  — LSP operation name (e.g. "hover", "definition")
 *   method?: string     — alternative operation name field
 *   file?: string       — source file path
 *   file_path?: string  — alternative file path field
 *   line?: number       — line number
 *   character?: number  — character/column position
 *   (any other params shown in a monospace block)
 *
 * While loading: shows pulsing "Processing..." indicator.
 * After result: shows result as expandable code block with copy button.
 *
 * Theme: Blue — rgba(59,130,246,0.35) left border, #3b82f6 icon/badge color.
 */

import React, { useState, useCallback } from 'react'
import { Code2, Check, Clipboard } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_LINES = 20

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
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#3b82f6' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive the operation label from various input field conventions */
function extractOperation(input: Record<string, unknown>): string {
  if (typeof input.operation === 'string' && input.operation) return input.operation
  if (typeof input.method === 'string' && input.method) return input.method
  // Fall back to the first key that isn't a known path/position field
  const skip = new Set(['file', 'file_path', 'line', 'character', 'column', 'uri'])
  const firstKey = Object.keys(input).find((k) => !skip.has(k))
  return firstKey ?? 'lsp'
}

/** Extract file path from input */
function extractFilePath(input: Record<string, unknown>): string | null {
  const v = input.file ?? input.file_path ?? input.uri
  return typeof v === 'string' && v ? v : null
}

/** Build params summary excluding already-displayed fields */
function buildParamSummary(input: Record<string, unknown>): string | null {
  const skip = new Set(['operation', 'method', 'file', 'file_path', 'uri'])
  const entries = Object.entries(input).filter(([k]) => !skip.has(k))
  if (entries.length === 0) return null
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')
}

// ── LSPToolCard ───────────────────────────────────────────────────────────────

export interface LSPToolCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function LSPToolCard({ input, result, isLoading }: LSPToolCardProps) {
  const [showMore, setShowMore] = useState(false)

  const operation = extractOperation(input)
  const filePath = extractFilePath(input)
  const paramSummary = buildParamSummary(input)

  const hasResult = typeof result === 'string' && result.length > 0
  const isDone = !isLoading && hasResult
  const contentLines = hasResult ? result.split('\n') : []
  const totalLines = contentLines.length
  const needsExpand = totalLines > PREVIEW_LINES
  const visibleContent = needsExpand && !showMore
    ? contentLines.slice(0, PREVIEW_LINES).join('\n')
    : (result ?? '')

  const borderColor = isLoading
    ? 'rgba(59,130,246,0.65)'
    : isDone
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(59,130,246,0.35)'

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
        <Code2
          size={13}
          style={{ color: 'rgba(59,130,246,0.85)', flexShrink: 0 }}
        />

        {/* Badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 6px',
          borderRadius: 5,
          background: 'rgba(59,130,246,0.15)',
          border: '1px solid rgba(59,130,246,0.30)',
          color: '#93c5fd',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          LSP
        </span>

        {/* Operation label */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(147,197,253,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {operation}
        </span>

        {/* Loading indicator */}
        {isLoading && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(59,130,246,0.75)',
            fontStyle: 'italic',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}>
            Processing...
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
            Done
          </span>
        )}
      </div>

      {/* Input params section */}
      {(filePath || paramSummary) && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '6px 10px', background: 'var(--section-bg)' }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}>
              Input
            </div>
            <pre style={{
              margin: 0,
              fontSize: 11,
              fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
              background: 'var(--code-bg)',
              border: '1px solid var(--bg-hover)',
              borderRadius: 4,
              padding: '5px 8px',
              overflow: 'auto',
              maxHeight: 100,
              color: 'rgba(147,197,253,0.80)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {filePath ? `file: ${filePath}${paramSummary ? '\n' + paramSummary : ''}` : paramSummary}
            </pre>
          </div>
        </div>
      )}

      {/* Result section */}
      {hasResult && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            {/* Label row */}
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
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                Result
                {totalLines > 1 && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 400,
                    letterSpacing: 'normal',
                    textTransform: 'none',
                    opacity: 0.7,
                  }}>
                    {totalLines} lines
                  </span>
                )}
              </span>
              <CopyBtn text={result!} />
            </div>

            {/* Code block */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
                background: 'var(--code-bg)',
                border: '1px solid var(--bg-hover)',
                borderRadius: needsExpand && !showMore ? '6px 6px 0 0' : 6,
                padding: '8px 10px',
                overflow: 'auto',
                maxHeight: showMore ? 500 : 320,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {visibleContent}
              </pre>

              {needsExpand && (
                <button
                  onClick={() => setShowMore(!showMore)}
                  style={{
                    background: 'var(--code-bg)',
                    border: '1px solid var(--bg-hover)',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    cursor: 'pointer',
                    color: 'rgba(59,130,246,0.70)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(59,130,246,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(59,130,246,0.70)' }}
                >
                  {showMore
                    ? 'Show less'
                    : `+ ${totalLines - PREVIEW_LINES} more lines`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
