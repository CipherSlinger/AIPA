import React from 'react'
import { CheckCircle, XCircle, ClipboardList } from 'lucide-react'
import { PlanMessage } from '../../types/app.types'

interface Props {
  message: PlanMessage
  onAccept: () => void
  onReject: () => void
}

export default function PlanCard({ message, onAccept, onReject }: Props) {
  const isPending = message.decision === 'pending'

  return (
    <div
      style={{
        margin: '8px 16px',
        borderRadius: 8,
        border: '1px solid var(--accent)',
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <ClipboardList size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>执行计划</span>
        {!isPending && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: message.decision === 'accepted' ? 'var(--success)' : 'var(--error)',
              fontWeight: 600,
            }}
          >
            {message.decision === 'accepted' ? '已批准' : '已拒绝'}
          </span>
        )}
      </div>

      {/* Plan content */}
      <div
        style={{
          padding: '12px 14px',
          fontSize: 13,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          maxHeight: 400,
          overflowY: 'auto',
        }}
      >
        {message.planContent}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={onAccept}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <CheckCircle size={13} />
            批准并继续
          </button>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <XCircle size={13} />
            拒绝
          </button>
        </div>
      )}
    </div>
  )
}
