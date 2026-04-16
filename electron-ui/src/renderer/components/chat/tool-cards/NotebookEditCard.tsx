/**
 * NotebookEditCard.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 578)
 *
 * Renders the input preview for the NotebookEdit tool:
 * edit mode badge, cell number badge, cell type badge, source code preview.
 */

import React, { useState } from 'react'
import { BookOpen } from 'lucide-react'

// ── Style maps ────────────────────────────────────────────────────────────────

const NOTEBOOK_EDIT_MODE_STYLES: Record<string, { label: string; bg: string; border: string; color: string }> = {
  replace: {
    label: 'replace',
    bg: 'rgba(99,102,241,0.15)',
    border: 'rgba(99,102,241,0.30)',
    color: '#818cf8',
  },
  insert: {
    label: 'insert',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.30)',
    color: '#4ade80',
  },
  delete: {
    label: 'delete',
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.30)',
    color: '#f87171',
  },
}

const NOTEBOOK_CELL_TYPE_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  code: {
    bg: 'rgba(59,130,246,0.15)',
    border: 'rgba(59,130,246,0.30)',
    color: '#60a5fa',
  },
  markdown: {
    bg: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.30)',
    color: '#a78bfa',
  },
}

const NOTEBOOK_SOURCE_PREVIEW_LINES = 8

// ── NotebookEditCard ──────────────────────────────────────────────────────────

interface NotebookEditCardProps {
  input: Record<string, unknown>
}

/** Input preview card for the NotebookEdit tool */
export function NotebookEditCard({ input }: NotebookEditCardProps) {
  const [sourceExpanded, setSourceExpanded] = useState(false)

  const editMode = typeof input.edit_mode === 'string' ? input.edit_mode : 'replace'
  const cellNumber = typeof input.cell_number === 'number' ? input.cell_number : null
  const newSource = typeof input.new_source === 'string' ? input.new_source : null
  const cellType = typeof input.cell_type === 'string' ? input.cell_type : null
  const notebookPath = typeof input.notebook_path === 'string' ? input.notebook_path : null

  const modeStyle = NOTEBOOK_EDIT_MODE_STYLES[editMode] ?? NOTEBOOK_EDIT_MODE_STYLES.replace
  const cellTypeStyle = cellType ? (NOTEBOOK_CELL_TYPE_STYLES[cellType] ?? null) : null

  // Extract basename from notebook path
  const notebookBasename = notebookPath
    ? (notebookPath.replace(/\\/g, '/').split('/').pop() ?? notebookPath)
    : null

  // Source preview: limit to first N lines when not expanded
  const sourceLines = newSource ? newSource.split('\n') : []
  const totalLines = sourceLines.length
  const needsExpand = totalLines > NOTEBOOK_SOURCE_PREVIEW_LINES
  const visibleSource = (needsExpand && !sourceExpanded)
    ? sourceLines.slice(0, NOTEBOOK_SOURCE_PREVIEW_LINES).join('\n')
    : newSource ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Filename header */}
      {notebookBasename && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <BookOpen size={13} style={{ color: 'rgba(165,180,252,0.75)', flexShrink: 0 }} />
          <span style={{
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 600,
            color: 'rgba(165,180,252,0.90)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {notebookBasename}
          </span>
        </div>
      )}

      {/* Badges row: edit mode + cell number + cell type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Edit mode badge */}
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          padding: '2px 7px',
          borderRadius: 8,
          background: modeStyle.bg,
          border: `1px solid ${modeStyle.border}`,
          color: modeStyle.color,
          flexShrink: 0,
        }}>
          {modeStyle.label}
        </span>

        {/* Cell number badge */}
        {cellNumber !== null && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'monospace',
            padding: '1px 6px',
            borderRadius: 6,
            background: 'rgba(165,180,252,0.10)',
            border: '1px solid rgba(165,180,252,0.22)',
            color: '#a5b4fc',
            flexShrink: 0,
          }}>
            Cell #{cellNumber}
          </span>
        )}

        {/* Cell type badge */}
        {cellType && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '2px 6px',
            borderRadius: 6,
            background: cellTypeStyle ? cellTypeStyle.bg : 'var(--bg-hover)',
            border: `1px solid ${cellTypeStyle ? cellTypeStyle.border : 'var(--border)'}`,
            color: cellTypeStyle ? cellTypeStyle.color : 'var(--text-muted)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {cellType}
          </span>
        )}
      </div>

      {/* Cell source content */}
      {newSource !== null && editMode !== 'delete' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <pre style={{
            margin: 0,
            fontSize: 11,
            fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: needsExpand && !sourceExpanded ? '6px 6px 0 0' : 6,
            padding: '8px 10px',
            overflow: 'auto',
            maxHeight: sourceExpanded ? 400 : 160,
            color: 'var(--text-primary)',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
          }}>
            {visibleSource}
          </pre>
          {needsExpand && (
            <button
              onClick={() => setSourceExpanded(!sourceExpanded)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                cursor: 'pointer',
                color: 'rgba(165,180,252,0.70)',
                fontSize: 10,
                fontFamily: 'monospace',
                padding: '3px 10px',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
            >
              {sourceExpanded
                ? 'Show less'
                : `+ ${totalLines - NOTEBOOK_SOURCE_PREVIEW_LINES} more lines`}
            </button>
          )}
        </div>
      )}

      {/* Delete placeholder */}
      {editMode === 'delete' && (
        <div style={{
          fontSize: 11,
          color: '#fca5a5',
          fontStyle: 'italic',
          opacity: 0.7,
        }}>
          Cell {cellNumber !== null ? `#${cellNumber}` : ''} will be deleted.
        </div>
      )}
    </div>
  )
}
