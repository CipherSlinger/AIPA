import React from 'react'
import { PermissionMessage } from '../../types/app.types'
import { ShieldAlert, Check, X } from 'lucide-react'

interface Props {
  message: PermissionMessage
  onAllow: () => void
  onDeny: () => void
}

export default function PermissionCard({ message, onAllow, onDeny }: Props) {
  const isPending = message.decision === 'pending'

  const inputPreview = JSON.stringify(message.toolInput, null, 2)
  const truncated = inputPreview.length > 300
    ? inputPreview.slice(0, 300) + '\n...'
    : inputPreview

  return (
    <div
      style={{
        margin: '8px 16px',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isPending ? 'var(--accent)' : message.decision === 'allowed' ? 'var(--success)' : 'var(--error)'}`,
        borderRadius: 6,
        background: 'var(--bg-secondary)',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ShieldAlert size={14} style={{ color: isPending ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          权限请求
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          工具: <code style={{ background: 'var(--bg-active)', padding: '1px 4px', borderRadius: 3 }}>{message.toolName}</code>
        </span>
      </div>

      <pre
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--bg-active)',
          borderRadius: 4,
          padding: '6px 8px',
          margin: '0 0 10px 0',
          overflow: 'auto',
          maxHeight: 120,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {truncated}
      </pre>

      {isPending ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onAllow}
            style={{
              background: 'var(--success)',
              border: 'none',
              borderRadius: 4,
              padding: '5px 14px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Check size={12} /> 允许
          </button>
          <button
            onClick={onDeny}
            style={{
              background: 'var(--bg-active)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '5px 14px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <X size={12} /> 拒绝
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {message.decision === 'allowed'
            ? <><Check size={11} style={{ color: 'var(--success)' }} /> 已允许</>
            : <><X size={11} style={{ color: 'var(--error)' }} /> 已拒绝</>
          }
        </div>
      )}
    </div>
  )
}
