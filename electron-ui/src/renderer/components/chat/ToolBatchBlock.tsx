/**
 * ToolBatchBlock -- renders a group of 3+ same-category tool uses as a collapsible batch.
 *
 * Shows a summary header like "Read 5 files" with an expand arrow.
 * On expand, shows individual ToolUseBlock entries with tree-line indentation.
 */
import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal, FileEdit, Search, Globe, Check, Loader2 } from 'lucide-react'
import type { ToolGroup } from '../../utils/toolSummary'
import type { ToolGroup } from '../../utils/toolSummary'
import ToolUseBlock from './ToolUseBlock'

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
  const { tools, summary } = group

  // Determine aggregate status
  const hasRunning = tools.some(t => t.status === 'running')
  const hasError = tools.some(t => t.status === 'error')
  const allDone = tools.every(t => t.status === 'done')

  const statusIcon = hasRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--warning)' }} />
    : allDone
    ? <Check size={11} style={{ color: 'var(--success)' }} />
    : hasError
    ? <span style={{ fontSize: 10, color: 'var(--error)' }}>!</span>
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
        background: 'var(--tool-card-bg)',
        border: '1px solid var(--tool-card-border)',
        borderRadius: 6,
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      {/* Batch Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Expand tool batch: ${summary}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary)',
        }}
      >
        {expanded
          ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
        }
        <Icon size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', flex: 1 }}>
          {summary}
        </span>
        {statusIcon && <span style={{ flexShrink: 0 }}>{statusIcon}</span>}
      </button>

      {/* Expanded: show individual tools with tree lines */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0 4px 20px' }}>
          {tools.map((tool, idx) => {
            const isLast = idx === tools.length - 1
            const treeLine = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500'
            return (
              <div key={tool.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: '22px', flexShrink: 0, userSelect: 'none' }}>
                  {treeLine}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
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
