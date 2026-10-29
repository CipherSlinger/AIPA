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
import { useFindDeep } from '../findDeep'

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
      className={`card-action${copied ? ' is-copied' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 6,
        color: copied ? 'var(--success-text)' : 'var(--text-muted)',
        fontSize: 10,
        transition: 'color 0.15s ease',
        flexShrink: 0,
      }}
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
  const deepFind = useFindDeep()

  const filePath = typeof input.file_path === 'string' ? input.file_path : ''
  const content = typeof input.content === 'string' ? input.content : ''

  const { dir, basename } = splitPath(filePath)

  const hasResult = typeof result === 'string' && result.length > 0

  // Content preview logic — show the input content field
  const contentLines = content.length > 0 ? content.split('\n') : []
  const totalLines = contentLines.length
  const needsExpand = totalLines > PREVIEW_LINES
  // A deep find renders the whole content: the 20-line preview is text the
  // user cannot see, so it must not answer "No matches".
  const visibleContent = (needsExpand && !showMore && !deepFind)
    ? contentLines.slice(0, PREVIEW_LINES).join('\n')
    : content

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '2px solid rgba(74,222,128,0.35)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: 'var(--code-shadow)',
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
          style={{ color: 'var(--success-text)', flexShrink: 0 }}
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
          color: 'var(--success-text)',
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
            color: 'var(--success-text)',
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
            color: 'var(--success-text)',
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
            color: 'var(--success-text)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Writing…
          </span>
        )}
      </div>

      {/* Content preview section — shown when content field is non-empty */}
      {content.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
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
                border: '1px solid var(--border)',
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

              {/* Show more / show less toggle, hidden during a deep find:
                  everything is rendered, so a "+ N more lines" label would
                  describe a preview that is not on screen. */}
              {needsExpand && !deepFind && (
                <button
                  onClick={() => setShowMore(!showMore)}
                  style={{
                    background: 'var(--code-bg)',
                    border: '1px solid var(--border)',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    cursor: 'pointer',
                    color: 'var(--success-text)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--success-text)' }}
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
