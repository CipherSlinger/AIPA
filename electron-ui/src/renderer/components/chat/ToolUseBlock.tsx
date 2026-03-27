import React, { useState, useEffect, useRef } from 'react'
import { ToolUseInfo } from '../../types/app.types'
import { ChevronDown, ChevronRight, Terminal, FileEdit, Search, Globe, Loader2, Check, X, Timer } from 'lucide-react'

interface Props {
  tool: ToolUseInfo
  onAbort?: () => void
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  Bash: Terminal,
  computer: Terminal,
  Write: FileEdit,
  Edit: FileEdit,
  MultiEdit: FileEdit,
  Read: FileEdit,
  str_replace_editor: FileEdit,
  str_replace_based_edit_tool: FileEdit,
  create_file: FileEdit,
  read_file: FileEdit,
  Glob: Search,
  LS: Search,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
}

const TOOL_LABELS: Record<string, string> = {
  Bash: 'Bash',
  Write: 'Write File',
  Edit: 'Edit File',
  MultiEdit: 'Multi-Edit',
  Read: 'Read File',
  str_replace_editor: 'Edit File',
  str_replace_based_edit_tool: 'Edit File',
  create_file: 'Create File',
  read_file: 'Read File',
  Glob: 'File Search',
  LS: 'List Files',
  Grep: 'Content Search',
  WebFetch: 'Web Fetch',
  WebSearch: 'Web Search',
}

const BASH_TOOLS = new Set(['Bash', 'computer'])
const FILE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'str_replace_editor', 'str_replace_based_edit_tool'])

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function DiffView({ input }: { input: Record<string, unknown> }) {
  const oldStr = String(input.old_str ?? input.old_string ?? '')
  const newStr = String(input.new_str ?? input.new_string ?? '')
  if (!oldStr && !newStr) return null
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
      {oldStr && oldStr.split('\n').map((line, i) => (
        <div key={`old-${i}`} style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171', padding: '1px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          - {line}
        </div>
      ))}
      {newStr && newStr.split('\n').map((line, i) => (
        <div key={`new-${i}`} style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '1px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          + {line}
        </div>
      ))}
    </div>
  )
}

export default function ToolUseBlock({ tool, onAbort }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isRunning = tool.status === 'running'

  // Start elapsed timer when tool begins running, capture final duration when done
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now()
      setElapsed(0)
      setFinalDuration(null)
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      // Capture final duration when transitioning from running to done/error
      if (startTimeRef.current && elapsed > 0) {
        setFinalDuration(elapsed)
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  const Icon = TOOL_ICONS[tool.name] || Terminal
  const label = TOOL_LABELS[tool.name] || tool.name
  const isBash = BASH_TOOLS.has(tool.name)
  const isFileEdit = FILE_EDIT_TOOLS.has(tool.name)
  const showElapsed = isRunning && elapsed >= 2
  const showFinalDuration = !isRunning && finalDuration !== null && finalDuration >= 1

  const statusIcon = isRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--warning)' }} />
    : tool.status === 'done'
    ? <Check size={11} style={{ color: 'var(--success)' }} />
    : <X size={11} style={{ color: 'var(--error)' }} />

  const primaryInput = (() => {
    if (tool.input.command) return String(tool.input.command).slice(0, 80)
    if (tool.input.path) return String(tool.input.path)
    if (tool.input.pattern) return String(tool.input.pattern)
    if (tool.input.url) return String(tool.input.url)
    return JSON.stringify(tool.input).slice(0, 80)
  })()

  const resultText = typeof tool.result === 'string'
    ? tool.result
    : tool.result != null ? JSON.stringify(tool.result, null, 2) : ''

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
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          background: isRunning ? 'var(--tool-card-header-bg)' : 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary)',
        }}
      >
        {expanded ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />}
        <Icon size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'monospace' }}>
          {primaryInput}
        </span>
        {showElapsed && (
          <span style={{ fontSize: 11, color: 'var(--warning)', flexShrink: 0, fontFamily: 'monospace' }}>
            {formatElapsed(elapsed)}
          </span>
        )}
        <span style={{ flexShrink: 0 }}>{statusIcon}</span>
        {showFinalDuration && (
          <span style={{
            fontSize: 10,
            color: tool.status === 'error' ? 'var(--error)' : 'var(--text-muted)',
            flexShrink: 0,
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            opacity: 0.8,
          }}>
            <Timer size={9} />
            {formatElapsed(finalDuration)}
          </span>
        )}
        {showElapsed && onAbort && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbort() }}
            title="Cancel tool"
            style={{
              padding: '1px 6px',
              background: 'var(--error)',
              border: 'none',
              borderRadius: 3,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        )}
      </button>

      {/* Expanded detail with animated height */}
      <div className={`tool-output-wrapper${expanded ? ' expanded' : ''}`}>
        <div>
        {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Input section */}
          <div style={{ padding: '6px 8px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>INPUT</div>
            {isFileEdit && (tool.input.old_str || tool.input.new_str || tool.input.old_string || tool.input.new_string) ? (
              <>
                {tool.input.path && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'monospace' }}>{String(tool.input.path)}</div>
                )}
                <DiffView input={tool.input} />
              </>
            ) : (
              <pre style={{ fontSize: 10, margin: 0, background: 'transparent', border: 'none', padding: 0, overflow: 'auto', maxHeight: 200 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </div>

          {/* Output section */}
          {tool.result !== undefined && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '4px 8px 0', fontSize: 10, color: 'var(--text-muted)' }}>OUTPUT</div>
              {isBash ? (
                <pre style={{
                  margin: 0, padding: '4px 8px 6px',
                  fontFamily: 'monospace', fontSize: 10,
                  background: 'rgba(0, 0, 0, 0.2)', color: '#4ade80',
                  maxHeight: 200, overflowY: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  borderRadius: '0 0 6px 6px',
                }}>
                  {resultText || '(no output)'}
                </pre>
              ) : (
                <pre style={{
                  fontSize: 10, margin: 0, padding: '4px 8px 6px',
                  background: 'transparent', border: 'none',
                  overflow: 'auto', maxHeight: 200,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {resultText}
                </pre>
              )}
            </div>
          )}
        </div>
        )}
        </div>
      </div>
    </div>
  )
}
