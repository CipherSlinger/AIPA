import React from 'react'
import { PermissionMessage } from '../../types/app.types'
import {
  ShieldCheck, Check, X,
  Terminal, FilePlus, FileEdit, FileSearch,
  FolderSearch, Search, Globe
} from 'lucide-react'

interface Props {
  message: PermissionMessage
  onAllow: () => void
  onDeny: () => void
}

// Map tool names to lucide icons + tint colors
function getToolVisual(toolName: string): { icon: React.ReactNode; tint: string } {
  const size = 22
  switch (toolName) {
    case 'Bash':
    case 'computer':
      return { icon: <Terminal size={size} />, tint: 'rgba(78,201,176,0.15)' }
    case 'Write':
    case 'create_file':
      return { icon: <FilePlus size={size} />, tint: 'rgba(0,122,204,0.15)' }
    case 'Edit':
    case 'str_replace_editor':
    case 'MultiEdit':
      return { icon: <FileEdit size={size} />, tint: 'rgba(215,186,125,0.15)' }
    case 'Read':
    case 'read_file':
      return { icon: <FileSearch size={size} />, tint: 'rgba(133,133,133,0.15)' }
    case 'Glob':
    case 'LS':
      return { icon: <FolderSearch size={size} />, tint: 'rgba(133,133,133,0.15)' }
    case 'Grep':
      return { icon: <Search size={size} />, tint: 'rgba(133,133,133,0.15)' }
    case 'WebFetch':
    case 'web_fetch':
    case 'WebSearch':
      return { icon: <Globe size={size} />, tint: 'rgba(90,63,138,0.15)' }
    default:
      return { icon: <ShieldCheck size={size} />, tint: 'rgba(0,122,204,0.15)' }
  }
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
        title: 'Perform an action',
        detail: toolName,
      }
    }
  }
}

export default function PermissionCard({ message, onAllow, onDeny }: Props) {
  const isPending = message.decision === 'pending'
  const { title, detail } = describeAction(message.toolName, message.toolInput)
  const { icon, tint } = getToolVisual(message.toolName)

  return (
    <div
      className={isPending ? 'permission-card-pending' : 'permission-card-enter'}
      style={{
        margin: '8px auto',
        maxWidth: 420,
        border: `${isPending ? '2px' : '1px'} solid ${isPending ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: 12,
        background: 'var(--card-bg)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header: Icon circle + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: isPending ? 'var(--text-primary)' : 'var(--text-muted)',
            opacity: isPending ? 1 : 0.6,
            transition: 'opacity 0.2s ease',
          }}
        >
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Requires your permission
          </span>
        </div>
      </div>

      {/* Detail block */}
      {detail && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'var(--action-btn-bg)',
            borderRadius: 6,
            padding: '8px 12px',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
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
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)'
              e.currentTarget.style.filter = 'brightness(1.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.filter = 'brightness(1)'
            }}
            style={{
              flex: 1,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '0',
              height: 36,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'transform 0.15s ease, filter 0.15s ease',
            }}
          >
            <Check size={14} /> Allow
          </button>
          <button
            onClick={onDeny}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--popup-item-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0',
              height: 36,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.15s ease',
            }}
          >
            <X size={14} /> Deny
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          {message.decision === 'allowed' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(78,201,176,0.15)',
                color: 'var(--success)',
                borderRadius: 12,
                padding: '3px 10px',
                fontWeight: 500,
              }}
            >
              <Check size={12} /> Allowed
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(244,71,71,0.15)',
                color: 'var(--error)',
                borderRadius: 12,
                padding: '3px 10px',
                fontWeight: 500,
              }}
            >
              <X size={12} /> Denied
            </span>
          )}
        </div>
      )}
    </div>
  )
}
