/**
 * FileReadCard.tsx
 * Renders the CLI's Read (FileRead) tool use in a structured inline card.
 *
 * Input fields:
 *   file_path: string  — the file being read
 *   offset?: number   — starting line (optional)
 *   limit?: number    — max lines to read (optional)
 *
 * Result: file content as a string (shown as code block, first 20 lines
 * with "show more" toggle for longer content).
 */

import React, { useState, useCallback } from 'react'
import { File, Check, Clipboard } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_LINES = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract basename and directory from a file path string */
function splitPath(filePath: string): { dir: string; basename: string } {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return { dir: '', basename: normalized }
  return {
    dir: normalized.slice(0, lastSlash + 1),
    basename: normalized.slice(lastSlash + 1),
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#a5b4fc' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── FileReadCard ──────────────────────────────────────────────────────────────

export interface FileReadCardProps {
  input: Record<string, unknown>
  result?: string | null
  isStreaming?: boolean
}

/**
 * Structured card for the CLI's Read (FileRead) tool.
 * Shows file path with icon, optional line range badge, and content preview.
 */
export function FileReadCard({ input, result, isStreaming }: FileReadCardProps) {
  const [showMore, setShowMore] = useState(false)

  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const offset = typeof input.offset === 'number' ? input.offset : null
  const limit = typeof input.limit === 'number' ? input.limit : null

  const { dir, basename } = splitPath(filePath)

  // Build the line range label for the badge
  let lineBadgeLabel: string | null = null
  if (offset !== null && limit !== null) {
    lineBadgeLabel = `lines ${offset}–${offset + limit - 1}`
  } else if (offset !== null) {
    lineBadgeLabel = `from line ${offset}`
  } else if (limit !== null) {
    lineBadgeLabel = `first ${limit} lines`
  }

  // Content preview logic
  const hasResult = typeof result === 'string' && result.length > 0
  const contentLines = hasResult ? result.split('\n') : []
  const totalLines = contentLines.length
  const needsExpand = totalLines > PREVIEW_LINES
  const visibleContent = (needsExpand && !showMore)
    ? contentLines.slice(0, PREVIEW_LINES).join('\n')
    : (result ?? '')

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: isStreaming
        ? '2px solid rgba(99,102,241,0.60)'
        : hasResult
        ? '2px solid rgba(34,197,94,0.50)'
        : '2px solid rgba(99,102,241,0.40)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <File
          size={13}
          style={{ color: 'rgba(165,180,252,0.80)', flexShrink: 0 }}
        />

        {/* File path: directory muted, basename bold */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: 0,
          fontFamily: 'monospace',
          fontSize: 12,
          overflow: 'hidden',
        }}>
          {dir && (
            <span style={{
              color: 'var(--text-muted)',
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexShrink: 1,
              minWidth: 0,
            }}>
              {dir}
            </span>
          )}
          <span style={{
            color: 'rgba(165,180,252,0.92)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {basename || filePath}
          </span>
        </div>

        {/* Line range badge */}
        {lineBadgeLabel && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            fontFamily: 'monospace',
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.28)',
            color: '#a5b4fc',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {lineBadgeLabel}
          </span>
        )}

        {/* Reading indicator (input state) */}
        {isStreaming && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(165,180,252,0.60)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Reading…
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
                Content
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
                    color: 'rgba(165,180,252,0.70)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
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
