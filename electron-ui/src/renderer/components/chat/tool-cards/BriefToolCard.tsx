/**
 * BriefToolCard.tsx
 * Renders the BriefTool inline card.
 *
 * Input fields:
 *   path?: string  — path to the brief file (if absent, shows "Global Brief")
 *
 * Result: brief content string, shown as a code block (first 20 lines,
 * expandable). Includes a copy-to-clipboard button.
 */

import React, { useState, useCallback } from 'react'
import { BookOpen, Check, Clipboard } from 'lucide-react'

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
      title={copied ? 'Copied!' : 'Copy content'}
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

// ── BriefToolCard ─────────────────────────────────────────────────────────────

export interface BriefToolCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function BriefToolCard({ input, result, isLoading }: BriefToolCardProps) {
  const [showMore, setShowMore] = useState(false)

  const briefPath = typeof input.path === 'string' && input.path.trim() !== ''
    ? input.path
    : null

  const hasResult = typeof result === 'string' && result.length > 0
  const contentLines = hasResult ? result.split('\n') : []
  const totalLines = contentLines.length
  const needsExpand = totalLines > PREVIEW_LINES
  const visibleContent = needsExpand && !showMore
    ? contentLines.slice(0, PREVIEW_LINES).join('\n')
    : (result ?? '')

  const borderColor = isLoading
    ? 'rgba(6,182,212,0.60)'
    : hasResult
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
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <BookOpen
          size={13}
          style={{ color: 'rgba(34,211,238,0.85)', flexShrink: 0 }}
        />

        {/* Path / title */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(34,211,238,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {briefPath ?? 'Global Brief'}
        </span>

        {/* Status indicator while loading */}
        {isLoading && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(34,211,238,0.65)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Reading...
          </span>
        )}
      </div>

      {/* Content section — shown when result is available */}
      {hasResult && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
            {/* Output label row */}
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
                Brief Content
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
              <CopyBtn text={result} />
            </div>

            {/* Code preview block */}
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

              {/* Show more / show less toggle */}
              {needsExpand && (
                <button
                  onClick={() => setShowMore(!showMore)}
                  style={{
                    background: 'var(--code-bg)',
                    border: '1px solid var(--bg-hover)',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    cursor: 'pointer',
                    color: 'rgba(34,211,238,0.70)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(34,211,238,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(34,211,238,0.70)' }}
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
