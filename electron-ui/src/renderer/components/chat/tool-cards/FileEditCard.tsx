/**
 * FileEditCard.tsx
 * Renders the CLI's Edit / str_replace_editor tool use in a structured inline card.
 *
 * Input fields (Claude CLI Edit tool):
 *   file_path: string       — the file being edited
 *   old_string: string      — the text to replace (also accepted as old_str)
 *   new_string: string      — the replacement text (also accepted as new_str)
 *   replace_all?: boolean   — whether to replace all occurrences
 *
 * Visual design:
 *   - Orange left border (4px solid rgba(251,146,60,0.35))
 *   - Pencil icon in orange, "Edit" action badge
 *   - File path: directory muted, basename bold in orange tint
 *   - replace_all badge when applicable
 *   - Stacked diff: "Before" (red-tinted) / "After" (green-tinted) panels
 *   - "Edit applied" green badge when result is present
 */

import React, { useState, useCallback } from 'react'
import { FilePen, Check, Clipboard, ChevronDown, ChevronRight } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_LINES = 10

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

/** Truncate a string to N lines, returning { visible, hiddenCount } */
function truncateLines(
  text: string,
  maxLines: number
): { visible: string; hiddenCount: number } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { visible: text, hiddenCount: 0 }
  return {
    visible: lines.slice(0, maxLines).join('\n'),
    hiddenCount: lines.length - maxLines,
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
      title={copied ? 'Copied!' : 'Copy'}
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
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = '#fb923c' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** A single diff panel: "Before" or "After" */
interface DiffPanelProps {
  label: string
  text: string
  variant: 'old' | 'new'
}

function DiffPanel({ label, text, variant }: DiffPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const { visible, hiddenCount } = truncateLines(text, PREVIEW_LINES)
  const needsExpand = hiddenCount > 0
  const displayText = expanded ? text : visible

  const isOld = variant === 'old'
  const accentColor = isOld ? 'rgba(248,113,113,0.85)' : 'rgba(74,222,128,0.85)'
  const bgColor = isOld ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)'
  const borderColor = isOld ? 'rgba(239,68,68,0.20)' : 'rgba(34,197,94,0.20)'
  const labelColor = isOld ? 'rgba(248,113,113,0.70)' : 'rgba(74,222,128,0.70)'

  if (!text) {
    return (
      <div style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '3px 8px',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: labelColor,
          background: bgColor,
        }}>
          {label}
        </div>
        <div style={{
          padding: '6px 8px',
          fontSize: 11,
          fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
          color: 'var(--text-faint)',
          fontStyle: 'italic',
        }}>
          (empty)
        </div>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      overflow: 'hidden',
      background: bgColor,
    }}>
      {/* Panel label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '3px 8px',
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: labelColor,
        }}>
          {label}
        </span>
        <CopyBtn text={text} />
      </div>

      {/* Code block */}
      <pre style={{
        margin: 0,
        padding: '6px 8px',
        fontSize: 11,
        fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
        color: accentColor,
        background: 'transparent',
        overflow: 'auto',
        maxHeight: 200,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: 1.5,
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}>
        {displayText}
      </pre>

      {/* Show more toggle */}
      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderTop: `1px solid ${borderColor}`,
            cursor: 'pointer',
            color: labelColor,
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '3px 8px',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
        >
          {expanded
            ? <><ChevronDown size={10} /> Show less</>
            : <><ChevronRight size={10} /> +{hiddenCount} more lines</>}
        </button>
      )}
    </div>
  )
}

// ── FileEditCard ──────────────────────────────────────────────────────────────

export interface FileEditCardProps {
  input: Record<string, unknown>
  result?: string | null
  isStreaming?: boolean
}

/**
 * Structured card for the CLI's Edit (str_replace) tool.
 * Shows file path with orange icon, before/after diff panels,
 * replace_all badge, and "Edit applied" confirmation on result.
 */
export function FileEditCard({ input, result, isStreaming }: FileEditCardProps) {
  // Accept both old_string/new_string and old_str/new_str (CLI variants)
  const filePath =
    typeof input.file_path === 'string' ? input.file_path :
    typeof input.path === 'string' ? input.path : ''

  const oldString =
    typeof input.old_string === 'string' ? input.old_string :
    typeof input.old_str === 'string' ? input.old_str : ''

  const newString =
    typeof input.new_string === 'string' ? input.new_string :
    typeof input.new_str === 'string' ? input.new_str : ''

  const replaceAll = input.replace_all === true

  const { dir, basename } = splitPath(filePath)
  const hasResult = typeof result === 'string' && result.length > 0
  const hasDiff = oldString.length > 0 || newString.length > 0

  return (
    <div style={{
      background: 'var(--glass-bg-low)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '4px solid rgba(251,146,60,0.35)',
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
        <FilePen
          size={13}
          style={{ color: 'rgba(251,146,60,0.90)', flexShrink: 0 }}
        />

        {/* "Edit" action badge */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '2px 7px',
          borderRadius: 8,
          background: 'rgba(251,146,60,0.15)',
          border: '1px solid rgba(251,146,60,0.30)',
          color: 'rgba(251,146,60,0.90)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          Edit
        </span>

        {/* File path: directory muted, basename bold in orange tint */}
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
            color: 'rgba(251,146,60,0.92)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {basename || filePath}
          </span>
        </div>

        {/* replace_all badge */}
        {replaceAll && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(251,146,60,0.12)',
            border: '1px solid rgba(251,146,60,0.28)',
            color: 'rgba(251,146,60,0.80)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            replace all
          </span>
        )}

        {/* "Edit applied" badge when result is present */}
        {hasResult && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.28)',
            color: '#4ade80',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            <Check size={9} />
            Edit applied
          </span>
        )}

        {/* Editing indicator (streaming state) */}
        {isStreaming && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(251,146,60,0.60)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Editing…
          </span>
        )}
      </div>

      {/* Diff panels section */}
      {hasDiff && (
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
              Changes
            </div>

            {/* Before / After panels stacked vertically for readability */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <DiffPanel label="Before" text={oldString} variant="old" />
              <DiffPanel label="After" text={newString} variant="new" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
