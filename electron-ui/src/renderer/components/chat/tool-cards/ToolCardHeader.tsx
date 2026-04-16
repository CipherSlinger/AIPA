/**
 * ToolCardHeader.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 585)
 *
 * The collapsible header button used in the standard ToolUseBlock card.
 * Shows: expand chevron, tool icon, summary/file-path label, MCP server badge,
 * elapsed timer, status badge (running/done/error), final duration, and abort button.
 */

import React from 'react'
import { ChevronDown, Timer, Loader2, Check, X } from 'lucide-react'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ToolCardHeaderProps {
  /** Whether the card body is currently expanded */
  expanded: boolean
  /** Called when the user clicks the header to toggle expand */
  onToggle: () => void
  /** Tool icon element type */
  Icon: React.ElementType
  /** Left border color (status-driven) */
  leftBorderColor: string
  /** Summary label (node or string) */
  summaryLabel: React.ReactNode
  /** If true, render file-path-highlighted summary instead of summaryLabel */
  isFilePath: boolean
  /** The highlighted file path (only used when isFilePath=true) */
  filePath?: string | null
  /** Tool name (used for file path label localisation and MCP badge) */
  toolName: string
  /** Status of the tool call */
  status: 'running' | 'done' | 'error'
  /** Whether to show the running elapsed time */
  showElapsed: boolean
  /** Whether to show the final duration badge */
  showFinalDuration: boolean
  /** Current elapsed seconds */
  elapsed: number
  /** Final duration in seconds (when done) */
  finalDuration: number | null
  /** Callback to abort the running tool (only shown during running) */
  onAbort?: () => void
  /** i18n helper */
  t: (key: string) => string
  /** FilePathHighlight renderer (passed from parent to avoid duplication) */
  FilePathHighlightComponent: React.ComponentType<{ filePath: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const FILE_PATH_VERB: Record<string, string> = {
  Read: '读取',
  Write: '写入',
  Edit: '编辑',
  MultiEdit: '多段编辑',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ToolCardHeader({
  expanded,
  onToggle,
  Icon,
  summaryLabel,
  isFilePath,
  filePath,
  toolName,
  status,
  showElapsed,
  showFinalDuration,
  elapsed,
  finalDuration,
  onAbort,
  t,
  FilePathHighlightComponent,
}: ToolCardHeaderProps) {
  const isRunning = status === 'running'

  const statusIcon = isRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color: '#818cf8' }} />
    : status === 'done'
    ? <Check size={11} style={{ color: '#4ade80' }} />
    : <X size={11} style={{ color: '#f87171' }} />

  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: 'var(--bg-hover)',
        border: 'none',
        borderBottom: expanded ? '1px solid var(--bg-hover)' : 'none',
        borderRadius: expanded ? '8px 8px 0 0' : 8,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--text-primary)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
    >
      <ChevronDown
        size={11}
        style={{
          color: 'var(--text-muted)',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 0.15s ease',
          flexShrink: 0,
        }}
      />
      <Icon size={13} style={{ color: 'rgba(165,180,252,0.8)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
        {/* For file path tools, show path-highlighted summary; otherwise show normal summary */}
        {isFilePath && filePath ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', minWidth: 0 }}>
            <span style={{ flexShrink: 0, color: 'var(--text-secondary)', fontWeight: 400 }}>
              {FILE_PATH_VERB[toolName] ?? toolName}
            </span>
            <FilePathHighlightComponent filePath={filePath} />
          </span>
        ) : (
          summaryLabel
        )}
        {toolName.startsWith('mcp__') && (() => {
          const parts = toolName.split('__')
          const serverName = parts[1]
          return serverName ? (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              background: 'rgba(99,102,241,0.15)',
              color: '#6366f1',
              borderRadius: 6,
              padding: '1px 4px',
              flexShrink: 0,
              letterSpacing: '0.02em',
              border: '1px solid rgba(99,102,241,0.3)',
            }}>
              {serverName}
            </span>
          ) : null
        })()}
      </span>
      {showElapsed && (
        <span style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          flexShrink: 0,
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatElapsed(elapsed)}
        </span>
      )}
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {/* Status badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '1px 6px',
          borderRadius: 10,
          fontSize: 10,
          fontWeight: 600,
          ...(isRunning
            ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }
            : status === 'done'
            ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }
            : { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }
          ),
        }}>
          {statusIcon}
        </span>
      </span>
      {showFinalDuration && finalDuration !== null && (
        <span style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          flexShrink: 0,
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}>
          <Timer size={9} />
          {formatElapsed(finalDuration)}
        </span>
      )}
      {showElapsed && onAbort && (
        <button
          onClick={(e) => { e.stopPropagation(); onAbort() }}
          title={t('toolbar.cancelTool')}
          style={{
            padding: '1px 6px',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            color: '#fca5a5',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 600,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          {t('common.cancel')}
        </button>
      )}
    </button>
  )
}
