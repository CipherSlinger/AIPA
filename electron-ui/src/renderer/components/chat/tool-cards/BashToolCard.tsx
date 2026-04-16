/**
 * BashToolCard.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 578)
 *
 * Contains:
 *   - BashCommandBlock  — renders a `$ <cmd>` block with monospace styling
 *   - BashOutputBlock   — renders output with line-limit fold + error highlighting
 *   - BashStatusDot     — small success/failure indicator dot
 *   - ERROR_KEYWORDS    — regex used to detect error output (shared)
 *   - BASH_TOOLS        — set of tool names routed through bash rendering path
 */

import React, { useState } from 'react'

// ── Shared constants ──────────────────────────────────────────────────────────

/** Tool names that use the Bash rendering path */
export const BASH_TOOLS = new Set(['Bash', 'computer', 'PowerShell'])

/** Regex for detecting error output */
export const ERROR_KEYWORDS = /exit code|error|Error|FAILED|fatal/

const BASH_OUTPUT_MAX_LINES = 30

// ── BashCommandBlock ──────────────────────────────────────────────────────────

interface BashCommandBlockProps {
  command: string
}

/** Renders a `$ <command>` block with monospace styling */
export function BashCommandBlock({ command }: BashCommandBlockProps) {
  return (
    <div style={{
      background: 'var(--tool-card-bg)',
      borderRadius: 8,
      border: '1px solid var(--border)',
      padding: '8px 12px',
      fontFamily: 'monospace',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 0,
      transition: 'all 0.15s ease',
    }}>
      <span style={{
        color: 'rgba(99,102,241,0.80)',
        fontWeight: 700,
        marginRight: 8,
        flexShrink: 0,
        userSelect: 'none',
        fontSize: 13,
      }}>$</span>
      <span style={{
        color: 'var(--text-primary)',
        fontFamily: 'monospace',
        fontSize: 13,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        flex: 1,
      }}>{command}</span>
    </div>
  )
}

// ── BashOutputBlock ───────────────────────────────────────────────────────────

interface BashOutputBlockProps {
  output: string
}

/** Renders bash output with line-limit fold and error color highlighting */
export function BashOutputBlock({ output }: BashOutputBlockProps) {
  const lines = output.split('\n')
  const totalLines = lines.length
  const hasError = ERROR_KEYWORDS.test(output)
  const [showAll, setShowAll] = useState(false)

  const visibleLines = (!showAll && totalLines > BASH_OUTPUT_MAX_LINES)
    ? lines.slice(0, BASH_OUTPUT_MAX_LINES)
    : lines

  const textColor = hasError ? 'rgba(239,68,68,0.75)' : 'var(--text-secondary)'

  return (
    <div style={{
      background: 'var(--tool-card-bg)',
      borderRadius: 6,
      padding: '6px 10px',
      transition: 'all 0.15s ease',
    }}>
      <pre style={{
        margin: 0,
        fontSize: 12,
        fontFamily: 'monospace',
        color: textColor,
        lineHeight: 1.5,
        maxHeight: 200,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}>
        {visibleLines.join('\n')}
      </pre>
      {totalLines > BASH_OUTPUT_MAX_LINES && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 4,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(165,180,252,0.70)',
            fontSize: 11,
            fontFamily: 'monospace',
            padding: '2px 0',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.70)' }}
        >
          展开全部 {totalLines} 行
        </button>
      )}
    </div>
  )
}

// ── BashStatusDot ─────────────────────────────────────────────────────────────

interface BashStatusDotProps {
  output: string
}

/** Small colored dot + label indicating bash exit success/failure */
export function BashStatusDot({ output }: BashStatusDotProps) {
  const hasError = ERROR_KEYWORDS.test(output)
  const dotColor = hasError ? 'rgba(239,68,68,0.80)' : 'rgba(34,197,94,0.80)'
  const label = hasError ? '失败' : '成功'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10,
      fontWeight: 600,
      color: dotColor,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dotColor,
        display: 'inline-block',
        flexShrink: 0,
      }} />
      {label}
    </span>
  )
}
