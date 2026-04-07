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
    background: 'rgba(46, 160, 67, 0.2)',
    color: 'var(--text-primary)',
  },
  remove: {
    background: 'rgba(248, 81, 73, 0.2)',
    color: 'var(--text-primary)',
  },
  hunk: {
    color: '#58a6ff',
    background: 'rgba(88, 166, 255, 0.08)',
  },
  header: {
    color: 'var(--text-muted)',
    background: 'transparent',
  },
  context: {
    color: 'var(--text-primary)',
    background: 'transparent',
  },
  other: {
    color: 'var(--text-muted)',
    background: 'transparent',
  },
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const lines = parseDiff(diff)

  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)',
        fontSize: 11,
        lineHeight: 1.5,
        maxHeight: 400,
        overflowY: 'auto',
        overflowX: 'auto',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary, var(--bg-chat))',
      }}
    >
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} style={lineStyles[line.type]}>
              <td
                style={{
                  padding: '0 8px',
                  userSelect: 'none',
                  color: 'var(--text-muted)',
                  textAlign: 'right',
                  minWidth: 32,
                  borderRight: '1px solid var(--border)',
                  fontSize: 10,
                  opacity: 0.6,
                  verticalAlign: 'top',
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
