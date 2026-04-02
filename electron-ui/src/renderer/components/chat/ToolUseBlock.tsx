import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ToolUseInfo } from '../../types/app.types'
import { ChevronDown, ChevronRight, Terminal, FileEdit, Search, Globe, Loader2, Check, X, Timer, ClipboardCopy } from 'lucide-react'
import { useT } from '../../i18n'
import DiffView from './DiffView'
import { generateToolSummary } from '../../utils/toolSummary'

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

const BASH_TOOLS = new Set(['Bash', 'computer'])
const FILE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'str_replace_editor', 'str_replace_based_edit_tool'])

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const FILE_WRITE_TOOLS = new Set(['Write', 'create_file'])

/** Small copy button for tool output */
function CopyOutputBtn({ text, t }: { text: string; t: (key: string) => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [text])

  return (
    <button
      onClick={handleCopy}
      title={t('message.copyCode')}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '1px 4px',
        borderRadius: 3,
        color: copied ? 'var(--success)' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        transition: 'color 150ms, background 150ms',
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'var(--accent)' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {copied ? <Check size={10} /> : <ClipboardCopy size={10} />}
      {copied ? t('message.codeCopied') : t('message.copyCode')}
    </button>
  )
}

export default function ToolUseBlock({ tool, onAbort }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const userToggledRef = useRef(false)

  const isRunning = tool.status === 'running'

  // Auto-expand when tool starts running, auto-collapse when done
  // Respects manual user toggle: if user collapsed a running tool, don't re-expand
  useEffect(() => {
    if (isRunning && !userToggledRef.current) {
      setExpanded(true)
    } else if (!isRunning && !userToggledRef.current) {
      setExpanded(false)
    }
    // Reset user toggle tracking when tool status changes
    if (!isRunning) {
      userToggledRef.current = false
    }
  }, [isRunning])

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
  const summaryLabel = generateToolSummary(tool, t)
  const isBash = BASH_TOOLS.has(tool.name)
  const isFileEdit = FILE_EDIT_TOOLS.has(tool.name)
  const showElapsed = isRunning && elapsed >= 2
  const showFinalDuration = !isRunning && finalDuration !== null && finalDuration >= 1

  const statusIcon = isRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--warning)' }} />
    : tool.status === 'done'
    ? <Check size={11} style={{ color: 'var(--success)' }} />
    : <X size={11} style={{ color: 'var(--error)' }} />

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
        onClick={() => { userToggledRef.current = true; setExpanded(!expanded) }}
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
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {summaryLabel}
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
            title={t('toolbar.cancelTool')}
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
            {t('common.cancel')}
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
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{t('tool.input')}</div>
            {isFileEdit && (tool.input.old_str || tool.input.new_str || tool.input.old_string || tool.input.new_string) ? (
              <>
                <DiffView
                  oldStr={String(tool.input.old_str ?? tool.input.old_string ?? '')}
                  newStr={String(tool.input.new_str ?? tool.input.new_string ?? '')}
                  filePath={tool.input.path ? String(tool.input.path) : undefined}
                />
              </>
            ) : FILE_WRITE_TOOLS.has(tool.name) && tool.input.content ? (
              <DiffView
                oldStr=""
                newStr={String(tool.input.content)}
                filePath={tool.input.path ? String(tool.input.path) : tool.input.file_path ? String(tool.input.file_path) : undefined}
              />
            ) : (
              <pre style={{ fontSize: 10, margin: 0, background: 'transparent', border: 'none', padding: 0, overflow: 'auto', maxHeight: 200 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </div>

          {/* Output section */}
          {tool.result !== undefined && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '4px 8px 0', fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t('tool.output')}
                  {resultText && resultText.split('\n').length > 1 && (
                    <span style={{ fontSize: 9, opacity: 0.7 }}>
                      {t('tool.linesCount', { count: String(resultText.split('\n').length) })}
                    </span>
                  )}
                </span>
                {resultText && (
                  <CopyOutputBtn text={resultText} t={t} />
                )}
              </div>
              {isBash ? (
                <pre style={{
                  margin: 0, padding: '4px 8px 6px',
                  fontFamily: 'monospace', fontSize: 10,
                  background: 'rgba(0, 0, 0, 0.2)', color: '#4ade80',
                  maxHeight: 200, overflowY: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  borderRadius: '0 0 6px 6px',
                }}>
                  {resultText || t('tool.noOutput')}
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
