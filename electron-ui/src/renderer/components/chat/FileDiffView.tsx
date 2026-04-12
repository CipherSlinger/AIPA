/**
 * FileDiffView — glass-morphism line-level diff preview for file_edit / file_write / file_create
 * tool calls from the Claude Code CLI.
 *
 * Uses a simple LCS-based diff algorithm (no external deps) with ±3-line context
 * windows and a fold-all button for large diffs (>50 lines visible).
 */
import React, { useState, useMemo } from 'react'
import { FileCode } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FileDiffViewProps {
  tool: 'file_edit' | 'file_write' | 'file_create'
  path: string
  oldString?: string
  newString?: string
  content?: string
}

type LineType = 'del' | 'add' | 'ctx'

interface DiffLine {
  type: LineType
  content: string
  oldNum?: number
  newNum?: number
}

// ── Diff algorithm ─────────────────────────────────────────────────────────────

const CONTEXT_LINES = 3
const LARGE_DIFF_THRESHOLD = 50

/** Build a compact LCS diff between two line arrays. */
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length
  const n = newLines.length

  // For very large inputs skip LCS to avoid O(m*n) memory
  if (m + n > 2000) {
    const lines: DiffLine[] = []
    let o = 1
    for (const line of oldLines) lines.push({ type: 'del', content: line, oldNum: o++ })
    let nu = 1
    for (const line of newLines) lines.push({ type: 'add', content: line, newNum: nu++ })
    return lines
  }

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const raw: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({ type: 'ctx', content: oldLines[i - 1], oldNum: i, newNum: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'add', content: newLines[j - 1], newNum: j })
      j--
    } else {
      raw.unshift({ type: 'del', content: oldLines[i - 1], oldNum: i })
      i--
    }
  }

  return raw
}

/**
 * Filter a full diff to only keep changed lines + CONTEXT_LINES context around each change.
 * Returns the filtered lines preserving original indices for rendering purposes.
 */
function applyContext(lines: DiffLine[]): DiffLine[] {
  if (lines.length === 0) return []

  // Mark which indices to keep
  const keep = new Set<number>()
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].type !== 'ctx') {
      for (let c = Math.max(0, idx - CONTEXT_LINES); c <= Math.min(lines.length - 1, idx + CONTEXT_LINES); c++) {
        keep.add(c)
      }
    }
  }

  if (keep.size === 0) return [] // identical files

  const result: DiffLine[] = []
  let prevKept = -1
  for (let idx = 0; idx < lines.length; idx++) {
    if (!keep.has(idx)) continue
    if (prevKept !== -1 && idx > prevKept + 1) {
      // gap — insert a separator sentinel (hunk header style)
      result.push({ type: 'ctx', content: '…', oldNum: undefined, newNum: undefined })
    }
    result.push(lines[idx])
    prevKept = idx
  }

  return result
}

// ── Colour tokens ──────────────────────────────────────────────────────────────

const CLR = {
  delBg: 'rgba(239,68,68,0.12)',
  delText: 'rgba(239,68,68,0.80)',
  delBorder: 'rgba(239,68,68,0.22)',
  addBg: 'rgba(34,197,94,0.12)',
  addText: 'rgba(34,197,94,0.80)',
  addBorder: 'rgba(34,197,94,0.22)',
  ctxText: 'rgba(255,255,255,0.45)',
  lineNum: 'rgba(255,255,255,0.25)',
  sepText: 'rgba(99,102,241,0.70)',
  sepBg: 'rgba(99,102,241,0.07)',
} as const

// ── Sub-components ─────────────────────────────────────────────────────────────

interface LineRowProps {
  line: DiffLine
}

function LineRow({ line }: LineRowProps) {
  const isSep = line.content === '…'
  const isAdd = line.type === 'add'
  const isDel = line.type === 'del'

  if (isSep) {
    return (
      <div style={{
        display: 'flex',
        background: CLR.sepBg,
        borderLeft: `2px solid ${CLR.sepText}`,
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        color: CLR.sepText,
        padding: '1px 0',
      }}>
        <span style={{ width: 36, flexShrink: 0 }} />
        <span style={{ width: 36, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)' }} />
        <span style={{ width: 16, textAlign: 'center', flexShrink: 0, fontWeight: 700 }}>⋯</span>
        <span style={{ flex: 1, padding: '0 8px', fontStyle: 'italic', fontSize: 10 }}>
          {line.oldNum !== undefined ? '' : ''}
        </span>
      </div>
    )
  }

  const bg = isAdd ? CLR.addBg : isDel ? CLR.delBg : 'transparent'
  const borderColor = isAdd ? CLR.addBorder : isDel ? CLR.delBorder : 'transparent'
  const textColor = isAdd ? CLR.addText : isDel ? CLR.delText : CLR.ctxText
  const marker = isAdd ? '+' : isDel ? '-' : ' '
  const markerColor = isAdd ? CLR.addText : isDel ? CLR.delText : 'rgba(255,255,255,0.22)'

  return (
    <div style={{
      display: 'flex',
      background: bg,
      borderLeft: `2px solid ${borderColor}`,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 1.5,
      transition: 'all 0.15s ease',
    }}>
      {/* Old line number */}
      <span style={{
        width: 36, textAlign: 'right', padding: '0 6px',
        color: CLR.lineNum,
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
        userSelect: 'none',
        flexShrink: 0,
        opacity: 0.38,
      }}>
        {line.type !== 'add' ? line.oldNum ?? '' : ''}
      </span>
      {/* New line number */}
      <span style={{
        width: 36, textAlign: 'right', padding: '0 6px',
        color: CLR.lineNum,
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
        userSelect: 'none',
        flexShrink: 0,
        opacity: 0.38,
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}>
        {line.type !== 'del' ? line.newNum ?? '' : ''}
      </span>
      {/* Marker (+/-/ ) */}
      <span style={{
        width: 16, textAlign: 'center', flexShrink: 0,
        color: markerColor,
        fontWeight: 700,
        userSelect: 'none',
      }}>
        {marker}
      </span>
      {/* Content */}
      <span style={{
        flex: 1, padding: '0 8px',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.5,
        color: textColor,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {line.content}
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FileDiffView({ tool, path, oldString, newString, content }: FileDiffViewProps) {
  const [expanded, setExpanded] = useState(false)

  // Determine mode: edit (has old+new) or write/create (new file, only content)
  const isEdit = tool === 'file_edit' && typeof oldString === 'string' && typeof newString === 'string'
  const isWrite = (tool === 'file_write' || tool === 'file_create')

  // Label badge for file_write / file_create
  const writeLabel = tool === 'file_create' ? 'NEW FILE' : 'OVERWRITE'

  // Compute diff lines for edit mode
  const diffLines = useMemo<DiffLine[]>(() => {
    if (!isEdit) return []
    const oldLines = (oldString ?? '').split('\n')
    const newLines = (newString ?? '').split('\n')
    const full = computeDiff(oldLines, newLines)
    return applyContext(full)
  }, [isEdit, oldString, newString])

  // For write mode: show content (green) capped at 30 lines by default
  const writeLines = useMemo<DiffLine[]>(() => {
    if (!isWrite) return []
    const src = content ?? newString ?? ''
    return src.split('\n').map((line, idx) => ({
      type: 'add' as LineType,
      content: line,
      newNum: idx + 1,
    }))
  }, [isWrite, content, newString])

  const allLines = isEdit ? diffLines : writeLines
  const totalLines = allLines.length

  // Stats (edit mode)
  const stats = useMemo(() => {
    if (!isEdit) return null
    const additions = diffLines.filter(l => l.type === 'add').length
    const deletions = diffLines.filter(l => l.type === 'del').length
    return { additions, deletions }
  }, [isEdit, diffLines])

  // Fold at 50 visible lines; user can expand
  const shouldFold = totalLines > LARGE_DIFF_THRESHOLD
  const visibleLines = (!shouldFold || expanded) ? allLines : allLines.slice(0, LARGE_DIFF_THRESHOLD)

  // File name from path (for display)
  const fileName = path.split(/[/\\]/).pop() || path

  return (
    <div style={{
      background: 'rgba(0,0,0,0.20)',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.07)',
      overflow: 'hidden',
      transition: 'all 0.15s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <FileCode size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
        {/* File path */}
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.07em',
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}
          title={path}
        >
          {fileName}
        </span>

        {/* Write/create badge */}
        {isWrite && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            padding: '1px 6px',
            borderRadius: 6,
            background: 'rgba(34,197,94,0.15)',
            border: '1px solid rgba(34,197,94,0.30)',
            color: '#4ade80',
            flexShrink: 0,
          }}>
            {writeLabel}
          </span>
        )}

        {/* Edit stat badges */}
        {isEdit && stats && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {stats.additions > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
                padding: '1px 5px', borderRadius: 5,
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.25)',
                color: '#4ade80',
              }}>+{stats.additions}</span>
            )}
            {stats.deletions > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
                padding: '1px 5px', borderRadius: 5,
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171',
              }}>−{stats.deletions}</span>
            )}
          </span>
        )}
      </div>

      {/* Diff / content body */}
      {allLines.length === 0 ? (
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.30)',
          fontStyle: 'italic',
          fontFamily: 'monospace',
        }}>
          No changes
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 380,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.10) transparent',
        }}>
          {visibleLines.map((line, idx) => (
            <LineRow key={idx} line={line} />
          ))}
        </div>
      )}

      {/* Expand / collapse footer for large diffs */}
      {shouldFold && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%',
            background: 'rgba(99,102,241,0.07)',
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            color: '#818cf8',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 600,
            padding: '5px 10px',
            textAlign: 'center',
            transition: 'all 0.15s ease',
            letterSpacing: '0.03em',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.14)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.07)' }}
        >
          {expanded
            ? `Collapse (showing ${totalLines} lines)`
            : `Expand all (${totalLines} lines)`}
        </button>
      )}
    </div>
  )
}
