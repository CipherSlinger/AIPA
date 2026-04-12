// LSPResultCard — specialized renderer for LSP tool results
// The CLI LSP tool returns a structured JSON object (operation, result, filePath, resultCount, fileCount)
// where `result` is a pre-formatted string from the formatters.
import React, { useState } from 'react'
import { Code2, ChevronDown, ChevronRight, FileSearch, Info, BookOpen, ArrowRightLeft, Phone } from 'lucide-react'

// Shape of the LSP tool output as returned by Claude Code CLI
export interface LSPOutput {
  operation:
    | 'goToDefinition'
    | 'findReferences'
    | 'hover'
    | 'documentSymbol'
    | 'workspaceSymbol'
    | 'goToImplementation'
    | 'prepareCallHierarchy'
    | 'incomingCalls'
    | 'outgoingCalls'
  result: string
  filePath: string
  resultCount?: number
  fileCount?: number
}

/** Parse a tool result string as LSPOutput, returning null on failure */
export function parseLSPOutput(raw: string): LSPOutput | null {
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.operation === 'string' &&
      typeof parsed.result === 'string' &&
      typeof parsed.filePath === 'string'
    ) {
      return parsed as LSPOutput
    }
  } catch {
    // not JSON
  }
  return null
}

const OPERATION_LABELS: Record<LSPOutput['operation'], string> = {
  goToDefinition: '定义',
  findReferences: '引用',
  hover: '悬停信息',
  documentSymbol: '文档符号',
  workspaceSymbol: '工作区符号',
  goToImplementation: '实现',
  prepareCallHierarchy: '调用层级',
  incomingCalls: '调用者',
  outgoingCalls: '被调用',
}

function getOperationIcon(op: LSPOutput['operation']): React.ElementType {
  switch (op) {
    case 'goToDefinition':
    case 'goToImplementation':
      return FileSearch
    case 'findReferences':
      return ArrowRightLeft
    case 'hover':
      return Info
    case 'documentSymbol':
    case 'workspaceSymbol':
      return BookOpen
    case 'prepareCallHierarchy':
    case 'incomingCalls':
    case 'outgoingCalls':
      return Phone
    default:
      return Code2
  }
}

/** Render the pre-formatted result string with minimal highlighting */
function LSPResultBody({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div
      style={{
        fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
        fontSize: 11,
        lineHeight: 1.55,
        padding: '6px 8px',
        overflowX: 'auto',
        maxHeight: 300,
        overflowY: 'auto',
        background: 'rgba(12,12,22,0.9)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 7,
        color: '#a5b4fc',
      }}
    >
      {lines.map((line, i) => {
        const trimmed = line.trimStart()
        const indent = line.length - trimmed.length

        // File path lines (contain ":" and look like paths, or end with ":")
        const isFilePath = /^[^\s].*\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|rb|swift|cs|php):/.test(trimmed) ||
          (/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|rb|swift|cs|php)$/.test(trimmed.replace(/:$/, '')))

        // Location entries (contain file:line:col pattern)
        const isLocation = /\w.*:\d+:\d+/.test(trimmed) || /Line \d+/.test(trimmed)

        // Summary / header lines (start with "Found", "Defined", "Document", "Call hierarchy")
        const isSummary = /^(Found|Defined in|Document symbols|Call hierarchy|No |LSP )/.test(trimmed)

        // Error / no-result messages
        const isError = /^(No |Error |LSP server )/.test(trimmed) || trimmed.startsWith('Error')

        let color = 'rgba(255,255,255,0.82)'
        if (isError) color = 'rgba(255,255,255,0.38)'
        else if (isSummary) color = '#a5b4fc'
        else if (isFilePath) color = '#4ade80'
        else if (isLocation) color = 'rgba(255,255,255,0.6)'

        return (
          <div
            key={i}
            style={{
              paddingLeft: indent * 6,
              color,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {trimmed || '\u00a0'}
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  data: LSPOutput
}

export default function LSPResultCard({ data }: Props) {
  const [expanded, setExpanded] = useState(true)

  const OpIcon = getOperationIcon(data.operation)
  const opLabel = OPERATION_LABELS[data.operation] ?? data.operation

  // Build a compact summary badge text
  const hasCount = typeof data.resultCount === 'number'
  const hasFiles = typeof data.fileCount === 'number'
  let badge = ''
  if (hasCount && data.resultCount! > 0) {
    badge += `${data.resultCount} 结果`
    if (hasFiles && data.fileCount! > 1) badge += `, ${data.fileCount} 文件`
  }

  // Truncate the filePath to last 2 segments for display
  const shortPath = data.filePath.split(/[/\\]/).slice(-2).join('/')

  const isEmpty =
    !data.result ||
    data.result.startsWith('No ') ||
    data.result.startsWith('Error') ||
    data.result.startsWith('LSP server')

  return (
    <div
      style={{
        background: 'rgba(15,15,25,0.90)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        marginBottom: 4,
      }}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        {expanded
          ? <ChevronDown size={11} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
          : <ChevronRight size={11} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
        }

        {/* LSP icon */}
        <Code2 size={12} style={{ color: '#818cf8', flexShrink: 0 }} />

        {/* Operation label — type badge */}
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#818cf8',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 10,
          padding: '1px 6px',
          flexShrink: 0,
        }}>
          LSP: {opLabel}
        </span>

        {/* Operation-specific icon */}
        <OpIcon size={11} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />

        {/* File path */}
        <span style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.38)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          fontFamily: 'monospace',
        }}>
          {shortPath}
        </span>

        {/* Count badge */}
        {badge && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 6,
            background: isEmpty
              ? 'rgba(120,120,120,0.12)'
              : 'rgba(99,102,241,0.15)',
            color: isEmpty ? 'rgba(255,255,255,0.38)' : '#818cf8',
            border: `1px solid ${isEmpty
              ? 'rgba(120,120,120,0.25)'
              : 'rgba(99,102,241,0.3)'}`,
            flexShrink: 0,
            letterSpacing: '0.02em',
          }}>
            {badge}
          </span>
        )}
      </button>

      {/* Expandable body */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <LSPResultBody text={data.result} />
        </div>
      )}
    </div>
  )
}
