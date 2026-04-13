// DiffViewer — pure CSS unified diff renderer (Iteration 521)
// No third-party diff libraries; parses unified diff text line-by-line.
import React from 'react'

interface DiffViewerProps {
  diff: string
}

type LineType = 'add' | 'remove' | 'context' | 'hunk' | 'header' | 'other'

interface DiffLine {
  type: LineType
  content: string
}

function parseDiff(diff: string): DiffLine[] {
  return diff.split('\n').map((line) => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
      return { type: 'header', content: line }
    }
    if (line.startsWith('@@')) {
      return { type: 'hunk', content: line }
    }
    if (line.startsWith('+')) {
      return { type: 'add', content: line }
    }
    if (line.startsWith('-')) {
      return { type: 'remove', content: line }
    }
    return { type: 'context', content: line }
  })
}

const lineStyles: Record<LineType, React.CSSProperties> = {
  add: {
    background: 'rgba(34,197,94,0.12)',
    color: '#86efac',
    borderLeft: '2px solid rgba(34,197,94,0.25)',
  },
  remove: {
    background: 'rgba(239,68,68,0.10)',
    color: '#fca5a5',
    borderLeft: '2px solid rgba(239,68,68,0.20)',
  },
  hunk: {
    background: 'rgba(99,102,241,0.08)',
    color: 'rgba(165,180,252,0.7)',
    borderLeft: '2px solid rgba(99,102,241,0.20)',
  },
  header: {
    color: 'rgba(255,255,255,0.60)',
    background: 'rgba(255,255,255,0.03)',
    borderLeft: '2px solid transparent',
  },
  context: {
    color: 'rgba(255,255,255,0.45)',
    background: 'transparent',
    borderLeft: '2px solid transparent',
  },
  other: {
    color: 'rgba(255,255,255,0.38)',
    background: 'transparent',
    borderLeft: '2px solid transparent',
  },
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const lines = parseDiff(diff)

  if (!diff || !diff.trim()) {
    return (
      <div
        style={{
          background: 'rgba(10,10,18,0.95)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8,
          overflow: 'hidden',
          fontFamily: 'monospace',
          fontSize: 11,
        }}
      >
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', textAlign: 'center', padding: 24 }}>
          No changes
        </div>
      </div>
    )
  }

  // Derive a filename from the first header line if present
  const headerLine = lines.find((l) => l.type === 'header' && l.content.startsWith('+++'))
  const filename = headerLine ? headerLine.content.replace(/^\+\+\+\s+/, '').split('\t')[0] : null

  return (
    <div
      style={{
        background: 'rgba(10,10,18,0.95)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: 'monospace',
        fontSize: 11,
        maxHeight: 400,
        overflowY: 'auto',
        overflowX: 'auto',
      }}
    >
      {filename && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', fontFamily: 'monospace' }}>
            {filename}
          </span>
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content', lineHeight: 1.5 }}>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} style={lineStyles[line.type]}>
              <td
                style={{
                  padding: '0 10px 0 8px',
                  userSelect: 'none',
                  color: 'rgba(255,255,255,0.38)',
                  textAlign: 'right',
                  minWidth: 36,
                  borderRight: '1px solid rgba(255,255,255,0.09)',
                  fontSize: 10,
                  verticalAlign: 'top',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {i + 1}
              </td>
              <td
                style={{
                  padding: '0 8px',
                  whiteSpace: 'pre',
                  ...lineStyles[line.type],
                }}
              >
                {line.content || ' '}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
