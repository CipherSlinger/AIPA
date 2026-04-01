/**
 * DiffView -- structured diff rendering for file edit tool results.
 * Inspired by Claude Code's StructuredDiff component.
 * Shows unified diff with line numbers, color-coded additions/deletions,
 * file path header, and change statistics.
 */
import React, { useState, useMemo } from 'react'
import { FileCode, ChevronDown, ChevronRight, Copy, Check, Code } from 'lucide-react'
import { useT } from '../../i18n'

interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  content: string
  oldNum?: number
  newNum?: number
}

interface DiffViewProps {
  oldStr: string
  newStr: string
  filePath?: string
}

function computeUnifiedDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const lines: DiffLine[] = []

  // Simple LCS-based diff for reasonable input sizes
  // For very large inputs, fall back to line-by-line comparison
  if (oldLines.length + newLines.length > 2000) {
    // Fallback: show all old as deletions, all new as additions
    let oldNum = 1
    let newNum = 1
    for (const line of oldLines) {
      lines.push({ type: 'del', content: line, oldNum: oldNum++ })
    }
    for (const line of newLines) {
      lines.push({ type: 'add', content: line, newNum: newNum++ })
    }
    return lines
  }

  // Build LCS table
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'ctx', content: oldLines[i - 1], oldNum: i, newNum: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', content: newLines[j - 1], newNum: j })
      j--
    } else {
      result.unshift({ type: 'del', content: oldLines[i - 1], oldNum: i })
      i--
    }
  }

  return result
}

export default function DiffView({ oldStr, newStr, filePath }: DiffViewProps) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const diffLines = useMemo(() => computeUnifiedDiff(oldStr, newStr), [oldStr, newStr])

  const stats = useMemo(() => {
    const additions = diffLines.filter(l => l.type === 'add').length
    const deletions = diffLines.filter(l => l.type === 'del').length
    return { additions, deletions }
  }, [diffLines])

  const isLarge = diffLines.length > 50

  // Auto-collapse large diffs
  const [autoCollapsed, setAutoCollapsed] = useState(isLarge)
  const isCollapsed = collapsed || autoCollapsed

  const handleCopy = async () => {
    const text = diffLines
      .map(l => `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} ${l.content}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (showRaw) {
    return (
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
        {filePath && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{filePath}</div>
        )}
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
          {`--- old\n+++ new\n${oldStr.split('\n').map(l => `- ${l}`).join('\n')}\n${newStr.split('\n').map(l => `+ ${l}`).join('\n')}`}
        </pre>
        <button
          onClick={() => setShowRaw(false)}
          style={{
            background: 'none', border: 'none', color: 'var(--accent)',
            cursor: 'pointer', fontSize: 10, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <FileCode size={10} /> {t('diff.showDiff')}
        </button>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div
        onClick={() => { if (autoCollapsed) setAutoCollapsed(false); else setCollapsed(!collapsed) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
          background: 'var(--diff-header-bg, var(--card-bg))',
          cursor: 'pointer', fontSize: 11,
        }}
      >
        {isCollapsed
          ? <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
          : <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
        <FileCode size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        {filePath && (
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath}
          </span>
        )}
        <span style={{ fontSize: 10, flexShrink: 0 }}>
          {stats.additions > 0 && <span style={{ color: 'var(--diff-add-text, #3fb950)' }}>+{stats.additions}</span>}
          {stats.additions > 0 && stats.deletions > 0 && <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>/</span>}
          {stats.deletions > 0 && <span style={{ color: 'var(--diff-del-text, #f85149)' }}>-{stats.deletions}</span>}
        </span>
      </div>

      {/* Diff content */}
      {!isCollapsed && (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {diffLines.map((line, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                background: line.type === 'add'
                  ? 'var(--diff-add-bg, rgba(46,160,67,0.15))'
                  : line.type === 'del'
                  ? 'var(--diff-del-bg, rgba(248,81,73,0.15))'
                  : 'transparent',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
                lineHeight: '1.5',
              }}
            >
              {/* Line numbers */}
              <span style={{
                minWidth: 28, textAlign: 'right', paddingRight: 4,
                color: 'var(--diff-line-num, var(--text-muted))',
                fontSize: 10, opacity: 0.6, userSelect: 'none', flexShrink: 0,
              }}>
                {line.type !== 'add' ? line.oldNum : ''}
              </span>
              <span style={{
                minWidth: 28, textAlign: 'right', paddingRight: 6,
                color: 'var(--diff-line-num, var(--text-muted))',
                fontSize: 10, opacity: 0.6, userSelect: 'none', flexShrink: 0,
                borderRight: '1px solid var(--border)',
              }}>
                {line.type !== 'del' ? line.newNum : ''}
              </span>

              {/* Marker */}
              <span style={{
                width: 14, textAlign: 'center', flexShrink: 0,
                color: line.type === 'add'
                  ? 'var(--diff-add-text, #3fb950)'
                  : line.type === 'del'
                  ? 'var(--diff-del-text, #f85149)'
                  : 'var(--text-muted)',
                fontWeight: 600,
              }}>
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </span>

              {/* Content */}
              <span style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1,
                paddingRight: 8,
                color: line.type === 'ctx' ? 'var(--text-secondary)' : 'var(--text-primary)',
              }}>
                {line.content}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Large diff collapsed message */}
      {isCollapsed && isLarge && (
        <div
          onClick={() => setAutoCollapsed(false)}
          style={{
            padding: '6px 8px', fontSize: 10, color: 'var(--accent)',
            cursor: 'pointer', textAlign: 'center',
          }}
        >
          {t('diff.showLines', { count: String(diffLines.length) })}
        </div>
      )}

      {/* Footer controls */}
      {!isCollapsed && (
        <div style={{
          display: 'flex', gap: 8, padding: '3px 8px',
          borderTop: '1px solid var(--border)', fontSize: 10,
        }}>
          <button
            onClick={() => setShowRaw(true)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
            }}
          >
            <Code size={10} /> {t('diff.showRaw')}
          </button>
          <button
            onClick={handleCopy}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
            }}
          >
            {copied ? <Check size={10} style={{ color: 'var(--success)' }} /> : <Copy size={10} />}
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
      )}
    </div>
  )
}
