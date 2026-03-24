import React, { useState } from 'react'
import { ToolUseInfo } from '../../types/app.types'
import { ChevronDown, ChevronRight, Terminal, FileEdit, Search, Globe, Loader2, Check, X } from 'lucide-react'

interface Props {
  tool: ToolUseInfo
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  Bash: Terminal,
  computer: Terminal,
  str_replace_editor: FileEdit,
  str_replace_based_edit_tool: FileEdit,
  create_file: FileEdit,
  read_file: FileEdit,
  Glob: Search,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
}

const TOOL_LABELS: Record<string, string> = {
  Bash: 'Bash 命令',
  str_replace_editor: '编辑文件',
  str_replace_based_edit_tool: '编辑文件',
  create_file: '创建文件',
  read_file: '读取文件',
  Glob: '文件搜索',
  Grep: '内容搜索',
  WebFetch: '获取网页',
  WebSearch: '网络搜索',
}

const BASH_TOOLS = new Set(['Bash', 'computer'])
const FILE_EDIT_TOOLS = new Set(['str_replace_editor', 'str_replace_based_edit_tool'])

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

export default function ToolUseBlock({ tool }: Props) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICONS[tool.name] || Terminal
  const label = TOOL_LABELS[tool.name] || tool.name
  const isBash = BASH_TOOLS.has(tool.name)
  const isFileEdit = FILE_EDIT_TOOLS.has(tool.name)
  const isRunning = tool.status === 'running'

  const statusIcon = isRunning
    ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--warning)' }} />
    : tool.status === 'done'
    ? <Check size={12} style={{ color: 'var(--success)' }} />
    : <X size={12} style={{ color: 'var(--error)' }} />

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
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        marginBottom: 6,
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
          gap: 8,
          padding: '6px 10px',
          background: isRunning ? 'rgba(234,179,8,0.06)' : 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary)',
          transition: 'background 0.2s',
        }}
      >
        {expanded ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
        <Icon size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'monospace' }}>
          {primaryInput}
        </span>
        <span style={{ flexShrink: 0 }}>{statusIcon}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Input section */}
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>INPUT</div>
            {isFileEdit && (tool.input.old_str || tool.input.new_str || tool.input.old_string || tool.input.new_string) ? (
              <>
                {tool.input.path && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'monospace' }}>{String(tool.input.path)}</div>
                )}
                <DiffView input={tool.input} />
              </>
            ) : (
              <pre style={{ fontSize: 11, margin: 0, background: 'transparent', border: 'none', padding: 0, overflow: 'auto', maxHeight: 200 }}>
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </div>

          {/* Output section */}
          {tool.result !== undefined && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '4px 10px 0', fontSize: 10, color: 'var(--text-muted)' }}>OUTPUT</div>
              {isBash ? (
                <pre style={{
                  margin: 0, padding: '6px 10px 8px',
                  fontFamily: 'monospace', fontSize: 11,
                  background: '#0d0d0d', color: '#4ade80',
                  maxHeight: 300, overflowY: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {resultText || '(no output)'}
                </pre>
              ) : (
                <pre style={{
                  fontSize: 11, margin: 0, padding: '6px 10px 8px',
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
  )
}
