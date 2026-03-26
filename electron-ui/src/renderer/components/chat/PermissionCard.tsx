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
        title: 'Run Command',
        detail: cmd ? `\`${cmd.slice(0, 120)}${cmd.length > 120 ? '...' : ''}\`` : 'Execute a terminal command',
      }
    }
    case 'Write':
    case 'create_file': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: 'Write File',
        detail: path || 'Create or overwrite a file',
      }
    }
    case 'Edit':
    case 'str_replace_editor': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: 'Edit File',
        detail: path || 'Modify file contents',
      }
    }
    case 'MultiEdit': {
      const path = (toolInput.path as string) || ''
      return {
        title: 'Multi-Edit File',
        detail: path || 'Make multiple edits to a file',
      }
    }
    case 'Read':
    case 'read_file': {
      const path = (toolInput.path as string) || (toolInput.file_path as string) || ''
      return {
        title: 'Read File',
        detail: path || 'Read file contents',
      }
    }
    case 'Glob':
    case 'LS': {
      const pattern = (toolInput.pattern as string) || (toolInput.path as string) || ''
      return {
        title: 'Search Files',
        detail: pattern || 'Find files in the working directory',
      }
    }
    case 'Grep': {
      const q = (toolInput.pattern as string) || ''
      return {
        title: 'Search Content',
        detail: q ? `Search "${q.slice(0, 80)}"` : 'Search file contents',
      }
    }
    case 'WebFetch':
    case 'web_fetch': {
      const url = (toolInput.url as string) || ''
      return {
        title: 'Fetch Web Page',
        detail: url || 'Retrieve information from the internet',
      }
    }
    case 'WebSearch': {
      const q = (toolInput.query as string) || ''
      return {
        title: 'Web Search',
        detail: q ? `Search "${q.slice(0, 80)}"` : 'Search the web',
      }
    }
    default: {
      return {
        title: 'Claude wants to perform an action',
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
          Claude wants to {title}
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
            <Check size={13} /> Allow
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
            <X size={13} /> Deny
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {message.decision === 'allowed'
            ? <><Check size={12} style={{ color: 'var(--success)' }} /> Allowed</>
            : <><X size={12} style={{ color: 'var(--error)' }} /> Denied</>
          }
        </div>
      )}
    </div>
  )
}
