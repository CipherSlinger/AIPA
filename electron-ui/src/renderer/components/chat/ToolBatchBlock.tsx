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
    ? <Loader2 size={11} className="animate-spin" style={{ color: '#818cf8' }} />
    : allDone
    ? <Check size={11} style={{ color: '#4ade80' }} />
    : hasError
    ? <span style={{ fontSize: 10, color: '#fca5a5' }}>!</span>
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
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
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
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.03)',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--bg-hover)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: '#818cf8',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      >
        {expanded
          ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', transition: 'all 0.15s ease', fontSize: 11 }} />
          : <ChevronRight size={11} style={{ color: 'var(--text-muted)', transition: 'all 0.15s ease', fontSize: 11 }} />
        }
        <Icon size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {summary}
        </span>
        {/* Count badge */}
        <span style={{
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.30)',
          borderRadius: 10,
          color: '#a5b4fc',
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
              ? { background: 'rgba(99,102,241,0.15)', color: '#818cf8' }
              : allDone
              ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }
              : { background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }
            ),
          }}>
            {statusIcon}
          </span>
        )}
      </button>

      {/* Expanded: show individual tools with tree lines */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--bg-hover)', padding: '4px 0 4px 8px' }}>
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
                  borderBottom: '1px solid var(--bg-hover)',
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
