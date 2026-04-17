/**
 * FileWriteCard.tsx
 * Renders the CLI's Write (FileWrite) tool use in a structured inline card.
 *
 * Input fields:
 *   file_path: string  — the file being written
 *   content: string   — the full content to write
 *
 * Result: a short confirmation string like "File written successfully".
 * When result is present, shows a green "File written" badge.
 */

import React, { useState, useCallback } from 'react'
import { FileText, Check, Clipboard } from 'lucide-react'

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
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#4ade80' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── FileWriteCard ─────────────────────────────────────────────────────────────

export interface FileWriteCardProps {
  input: Record<string, unknown>
  result?: string | null
  isStreaming?: boolean
}

/**
 * Structured card for the CLI's Write (FileWrite) tool.
 * Shows file path with green icon, content preview (first 20 lines, expandable),
 * and a "File written" confirmation badge when the result arrives.
 */
export function FileWriteCard({ input, result, isStreaming }: FileWriteCardProps) {
  const [showMore, setShowMore] = useState(false)

  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const content = typeof input.content === 'string' ? input.content : ''

  const { dir, basename } = splitPath(filePath)

  const hasResult = typeof result === 'string' && result.length > 0

  // Content preview logic — show the input content field
  const contentLines = content.length > 0 ? content.split('\n') : []
  const totalLines = contentLines.length
  const needsExpand = totalLines > PREVIEW_LINES
  const visibleContent = (needsExpand && !showMore)
    ? contentLines.slice(0, PREVIEW_LINES).join('\n')
    : content

  return (
    <div style={{
      background: 'var(--glass-bg-low)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '4px solid rgba(74,222,128,0.35)',
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
        <FileText
          size={13}
          style={{ color: 'rgba(74,222,128,0.85)', flexShrink: 0 }}
        />

        {/* "Write" action badge */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '2px 7px',
          borderRadius: 8,
          background: 'rgba(74,222,128,0.15)',
          border: '1px solid rgba(74,222,128,0.30)',
          color: 'rgba(74,222,128,0.90)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          Write
        </span>

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
            color: 'rgba(74,222,128,0.92)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {basename || filePath}
          </span>
        </div>

        {/* "File written" badge when result is present */}
        {hasResult && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.28)',
            color: '#4ade80',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            <Check size={9} />
            File written
          </span>
        )}

        {/* Writing indicator (input state) */}
        {isStreaming && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(74,222,128,0.60)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Writing…
          </span>
        )}
      </div>

      {/* Content preview section — shown when content field is non-empty */}
      {content.length > 0 && (
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
              <CopyBtn text={content} />
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
                    color: 'rgba(74,222,128,0.70)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(74,222,128,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(74,222,128,0.70)' }}
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
