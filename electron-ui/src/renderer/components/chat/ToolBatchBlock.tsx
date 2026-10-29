/**
 * ToolBatchBlock -- renders a group of 3+ same-category tool uses as a collapsible batch.
 *
 * Shows a summary header like "Read 5 files" with an expand arrow.
 * On expand, shows individual ToolUseBlock entries with tree-line indentation.
 */
import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal, FileEdit, Search, Globe, Check, Loader2 } from 'lucide-react'
import type { ToolGroup } from '../../utils/toolSummary'
import ToolUseBlock from './ToolUseBlock'
import { useFindDeep } from './findDeep'

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  command: Terminal,
  edit: FileEdit,
  write: FileEdit,
  read: FileEdit,
  search: Search,
  web: Globe,
}

interface ToolBatchBlockProps {
  group: ToolGroup
  onAbort?: () => void
}

export default function ToolBatchBlock({ group, onAbort }: ToolBatchBlockProps) {
  const [expanded, setExpanded] = useState(false)
  // A batch hides its cards until opened. The find bar's deep search opens it
  // for display only, so the batch returns to its own state when the search
  // ends — same rule as an individual tool card.
  const deepFind = useFindDeep()
  const showTools = expanded || deepFind
  const { tools, summary } = group

  // Determine aggregate status
  const hasRunning = tools.some(t => t.status === 'running')
  const hasError = tools.some(t => t.status === 'error')
  const allDone = tools.every(t => t.status === 'done')

  const statusIcon = hasRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent-muted)' }} />
    : allDone
    ? <Check size={11} style={{ color: 'var(--success-text)' }} />
    : hasError
    ? <span style={{ fontSize: 10, color: 'var(--danger-text)' }}>!</span>
    : null

  // Get category icon
  const firstCategory = tools[0]?.name || ''
  const Icon = CATEGORY_ICONS[
    firstCategory === 'Bash' || firstCategory === 'computer' ? 'command'
    : firstCategory === 'Edit' || firstCategory === 'MultiEdit' || firstCategory === 'str_replace_editor' || firstCategory === 'str_replace_based_edit_tool' ? 'edit'
    : firstCategory === 'Write' || firstCategory === 'create_file' ? 'write'
    : firstCategory === 'Read' || firstCategory === 'read_file' ? 'read'
    : firstCategory === 'Grep' || firstCategory === 'Glob' || firstCategory === 'LS' ? 'search'
    : firstCategory === 'WebFetch' || firstCategory === 'WebSearch' ? 'web'
    : 'command'
  ] || Terminal

  return (
    <div
      style={{
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: '2px solid rgba(99,102,241,0.40)',
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
        boxShadow: 'var(--code-shadow)',
      }}
    >
      {/* Batch Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={showTools}
        aria-label={`Expand tool batch: ${summary}`}
        className="row-focus-inset"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          // Match the standard tool card header (7px) and its tone; a batch
          // sits directly above the cards it groups and used to be a step
          // lighter/darker than them.
          padding: '7px 10px',
          background: 'var(--section-bg)',
          border: 'none',
          borderBottom: showTools ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--accent-muted)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--section-bg)' }}
      >
        {showTools
          ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', transition: 'all 0.15s ease', fontSize: 11 }} />
          : <ChevronRight size={11} style={{ color: 'var(--text-muted)', transition: 'all 0.15s ease', fontSize: 11 }} />
        }
        <Icon size={12} style={{ color: 'var(--accent-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {summary}
        </span>
        {/* Count badge */}
        <span style={{
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.30)',
          borderRadius: 10,
          color: 'var(--accent-text)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '1px 6px',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>
          {tools.length}
        </span>
        {/* Overall status badge */}
        {statusIcon && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 6px',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 600,
            flexShrink: 0,
            ...(hasRunning
              ? { background: 'rgba(99,102,241,0.15)', color: 'var(--accent-muted)' }
              : allDone
              ? { background: 'rgba(34,197,94,0.12)', color: 'var(--success-text)' }
              : { background: 'rgba(239,68,68,0.12)', color: 'var(--danger-text)' }
            ),
          }}>
            {statusIcon}
          </span>
        )}
      </button>

      {/* Expanded: show individual tools with tree lines */}
      {showTools && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0 4px 8px' }}>
          {tools.map((tool, idx) => {
            const isLast = idx === tools.length - 1
            const treeLine = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500'
            return (
              <div key={tool.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: '22px', flexShrink: 0, userSelect: 'none' }}>
                  {treeLine}
                </span>
                <div style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '5px 10px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <ToolUseBlock tool={tool} onAbort={onAbort} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
