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
  const [hunkHovered, setHunkHovered] = useState(false)
  const [copyHovered, setCopyHovered] = useState(false)
  const [rawHovered, setRawHovered] = useState(false)

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
      <div style={{
        background: 'rgba(13,13,20,0.95)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'monospace',
        fontSize: 11,
      }}>
        {filePath && (
          <div style={{
            fontSize: 10, color: 'var(--text-primary)', marginBottom: 4,
            padding: '6px 12px',
            background: 'var(--bg-hover)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>{filePath}</div>
        )}
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10, padding: '8px 12px' }}>
          {`--- old\n+++ new\n${oldStr.split('\n').map(l => `- ${l}`).join('\n')}\n${newStr.split('\n').map(l => `+ ${l}`).join('\n')}`}
        </pre>
        <button
          onClick={() => setShowRaw(false)}
          style={{
            background: 'none', border: 'none', color: '#818cf8',
            cursor: 'pointer', fontSize: 10, padding: '4px 12px 8px', display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.15s ease',
          }}
        >
          <FileCode size={10} /> {t('diff.showDiff')}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(13,13,20,0.95)',
      border: '1px solid var(--glass-border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => { if (autoCollapsed) setAutoCollapsed(false); else setCollapsed(!collapsed) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          background: 'var(--bg-hover)',
          borderBottom: '1px solid var(--glass-border)',
          cursor: 'pointer', fontSize: 11,
          transition: 'all 0.15s ease',
        }}
      >
        {isCollapsed
          ? <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
          : <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
        <FileCode size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
        {filePath && (
          <span style={{
            fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {filePath}
          </span>
        )}
        {/* Stat badges */}
        <span style={{ fontSize: 10, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {stats.additions > 0 && (
            <span style={{
              background: 'rgba(34,197,94,0.15)', color: '#4ade80',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 6, padding: '1px 6px',
              fontSize: 10, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
            }}>+{stats.additions}</span>
          )}
          {stats.deletions > 0 && (
            <span style={{
              background: 'rgba(239,68,68,0.15)', color: '#f87171',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 6, padding: '1px 6px',
              fontSize: 10, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
            }}>-{stats.deletions}</span>
          )}
        </span>
      </div>

      {/* Diff content */}
      {!isCollapsed && (
        <div style={{
          maxHeight: 400, overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border) transparent',
        }}>
          {diffLines.map((line, idx) => {
            const isAdd = line.type === 'add'
            const isDel = line.type === 'del'
            const isHunk = line.content.startsWith('@@')

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  background: isHunk
                    ? 'rgba(99,102,241,0.08)'
                    : isAdd
                    ? 'rgba(34,197,94,0.12)'
                    : isDel
                    ? 'rgba(239,68,68,0.10)'
                    : 'var(--glass-bg-low)',
                  borderLeft: isHunk
                    ? '2px solid rgba(99,102,241,0.30)'
                    : isAdd
                    ? '2px solid rgba(34,197,94,0.25)'
                    : isDel
                    ? '2px solid rgba(239,68,68,0.20)'
                    : '2px solid transparent',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {/* Old line number */}
                <span style={{
                  width: 40, textAlign: 'right', padding: '0 8px',
                  color: isAdd
                    ? 'rgba(34,197,94,0.4)'
                    : isDel
                    ? 'rgba(239,68,68,0.4)'
                    : 'var(--text-faint)',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                  userSelect: 'none', flexShrink: 0,
                }}>
                  {line.type !== 'add' ? line.oldNum : ''}
                </span>
                {/* New line number */}
                <span style={{
                  width: 40, textAlign: 'right', padding: '0 8px',
                  color: isAdd
                    ? 'rgba(34,197,94,0.4)'
                    : isDel
                    ? 'rgba(239,68,68,0.4)'
                    : 'var(--text-faint)',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                  userSelect: 'none', flexShrink: 0,
                  borderRight: '1px solid var(--border)',
                }}>
                  {line.type !== 'del' ? line.newNum : ''}
                </span>

                {/* Marker */}
                <span style={{
                  width: 14, textAlign: 'center', flexShrink: 0,
                  color: isHunk
                    ? '#818cf8'
                    : isAdd
                    ? '#4ade80'
                    : isDel
                    ? '#f87171'
                    : 'var(--text-faint)',
                  fontWeight: 600,
                }}>
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                </span>

                {/* Content */}
                <span style={{
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1,
                  padding: '0 10px',
                  fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5,
                  color: isHunk
                    ? '#818cf8'
                    : isAdd
                    ? 'rgba(34,197,94,0.82)'
                    : isDel
                    ? 'rgba(239,68,68,0.82)'
                    : 'var(--text-muted)',
                  fontStyle: isHunk ? 'italic' : undefined,
                }}>
                  {line.content}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Large diff collapsed message — collapse/expand hunk button */}
      {isCollapsed && isLarge && (
        <div
          onClick={() => setAutoCollapsed(false)}
          onMouseEnter={() => setHunkHovered(true)}
          onMouseLeave={() => setHunkHovered(false)}
          style={{
            padding: '6px 12px', fontSize: 11,
            color: '#818cf8',
            background: hunkHovered ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
            cursor: 'pointer', textAlign: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {t('diff.showLines', { count: String(diffLines.length) })}
        </div>
      )}

      {/* Footer controls */}
      {!isCollapsed && (
        <div style={{
          display: 'flex', gap: 8, padding: '4px 12px',
          borderTop: '1px solid var(--glass-border)', fontSize: 10,
          background: 'var(--glass-shimmer)',
        }}>
          <button
            onClick={() => setShowRaw(true)}
            onMouseEnter={() => setRawHovered(true)}
            onMouseLeave={() => setRawHovered(false)}
            style={{
              background: 'none', border: 'none',
              color: rawHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
              transition: 'all 0.15s ease',
            }}
          >
            <Code size={10} /> {t('diff.showRaw')}
          </button>
          <button
            onClick={handleCopy}
            onMouseEnter={() => setCopyHovered(true)}
            onMouseLeave={() => setCopyHovered(false)}
            style={{
              background: 'none', border: 'none',
              color: copyHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
              transition: 'all 0.15s ease',
            }}
          >
            {copied ? <Check size={10} style={{ color: '#4ade80' }} /> : <Copy size={10} />}
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
      )}
    </div>
  )
}
