import React from 'react'
import { PermissionMessage } from '../../types/app.types'
import { ShieldCheck, Check, X } from 'lucide-react'

interface Props {
  message: PermissionMessage
  onAllow: () => void
  onDeny: () => void
}

// Convert technical tool names and inputs into user-friendly descriptions
function describeAction(toolName: string, toolInput: Record<string, unknown>): { title: string; detail: string } {
  switch (toolName) {
    case 'Bash':
    case 'computer': {
      const cmd = (toolInput.command as string) || (toolInput.cmd as string) || ''
      return {
        title: '执行命令',
        detail: cmd ? `\`${cmd.slice(0, 120)}${cmd.length > 120 ? '…' : ''}\`` : '运行一条终端命令',
      }
    }
    case 'Write':
    case 'create_file': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: '写入文件',
        detail: path || '创建或覆盖一个文件',
      }
    }
    case 'Edit':
    case 'str_replace_editor': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: '修改文件',
        detail: path || '编辑文件内容',
      }
    }
    case 'MultiEdit': {
      const path = (toolInput.path as string) || ''
      return {
        title: '批量修改文件',
        detail: path || '对文件进行多处编辑',
      }
    }
    case 'Read':
    case 'read_file': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: '读取文件',
        detail: path || '读取一个文件的内容',
      }
    }
    case 'Glob':
    case 'LS': {
      const pattern = (toolInput.pattern as string) || (toolInput.path as string) || ''
      return {
        title: '搜索文件',
        detail: pattern || '在工作目录中查找文件',
      }
    }
    case 'Grep': {
      const q = (toolInput.pattern as string) || ''
      return {
        title: '搜索内容',
        detail: q ? `搜索 "${q.slice(0, 80)}"` : '在文件中搜索内容',
      }
    }
    case 'WebFetch':
    case 'web_fetch': {
      const url = (toolInput.url as string) || ''
      return {
        title: '访问网页',
        detail: url || '从互联网获取信息',
      }
    }
    case 'WebSearch': {
      const q = (toolInput.query as string) || ''
      return {
        title: '搜索网络',
        detail: q ? `搜索 "${q.slice(0, 80)}"` : '在网络上搜索',
      }
    }
    default: {
      return {
        title: 'Claude 需要执行操作',
        detail: toolName,
      }
    }
  }
}

export default function PermissionCard({ message, onAllow, onDeny }: Props) {
  const isPending = message.decision === 'pending'
  const { title, detail } = describeAction(message.toolName, message.toolInput)

  return (
    <div
      style={{
        margin: '8px 16px',
        border: `1px solid ${isPending ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 10,
        background: 'var(--bg-secondary)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={16} style={{ color: isPending ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Claude 想要{title}
        </span>
      </div>

      {/* Detail */}
      {detail && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'var(--bg-active)',
            borderRadius: 5,
            padding: '6px 10px',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
          }}
        >
          {detail}
        </div>
      )}

      {/* Actions or result */}
      {isPending ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onAllow}
            style={{
              flex: 1,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              padding: '7px 0',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Check size={13} /> 允许
          </button>
          <button
            onClick={onDeny}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '7px 0',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <X size={13} /> 拒绝
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {message.decision === 'allowed'
            ? <><Check size={12} style={{ color: 'var(--success)' }} /> 已允许</>
            : <><X size={12} style={{ color: 'var(--error)' }} /> 已拒绝</>
          }
        </div>
      )}
    </div>
  )
}
