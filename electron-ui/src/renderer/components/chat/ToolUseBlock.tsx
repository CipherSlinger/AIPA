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

export default function ToolUseBlock({ tool }: Props) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICONS[tool.name] || Terminal
  const label = TOOL_LABELS[tool.name] || tool.name

  const statusIcon = tool.status === 'running'
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
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary)',
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
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>INPUT</div>
            <pre style={{ fontSize: 11, margin: 0, background: 'transparent', border: 'none', padding: 0, overflow: 'auto', maxHeight: 200 }}>
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {tool.result !== undefined && (
            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>OUTPUT</div>
              <pre style={{ fontSize: 11, margin: 0, background: 'transparent', border: 'none', padding: 0, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {typeof tool.result === 'string'
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
