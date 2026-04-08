import React, { useState } from 'react'
import { HookCallbackMessage } from '../../types/app.types'
import { Check, X, ChevronDown, ChevronUp, Zap } from 'lucide-react'

interface Props {
  message: HookCallbackMessage
  onRespond: (requestId: string, response: Record<string, unknown>) => void
}

export function HookCallbackCard({ message, onRespond }: Props) {
  const [showReason, setShowReason] = useState(false)
  const [reason, setReason] = useState('')

  const hookEventName = (message.hookInput.hook_event_name as string) || 'Hook Event'
  const toolName = (message.hookInput.tool_name as string) || ''
  const toolInput = (message.hookInput.tool_input as Record<string, unknown>) || {}

  const isPending = message.decision === 'pending'
  const isApproved = message.decision === 'approved'

  const handleApprove = () => {
    if (!isPending) return
    const response: Record<string, unknown> = { decision: 'approve' }
    if (reason.trim()) response.reason = reason.trim()
    onRespond(message.requestId, response)
  }

  const handleBlock = () => {
    if (!isPending) return
    const response: Record<string, unknown> = { decision: 'block' }
    if (reason.trim()) response.reason = reason.trim()
    onRespond(message.requestId, response)
  }

  // Trim tool input JSON for display (max 400 chars)
  const toolInputStr = Object.keys(toolInput).length > 0
    ? JSON.stringify(toolInput, null, 2).slice(0, 400)
    : null

  return (
    <div
      className={isPending ? 'hook-card-pending' : 'hook-card-enter'}
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(99,102,241,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: isPending ? 'var(--accent)' : 'var(--text-muted)',
          opacity: isPending ? 1 : 0.6,
          transition: 'opacity 0.2s ease',
        }}>
          <Zap size={22} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {hookEventName}
            </span>
            {isPending && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(99,102,241,0.15)',
                color: 'var(--accent)',
                textTransform: 'uppercase',
              }}>
                Hook
              </span>
            )}
          </div>
          {toolName && (
            <span style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              Tool: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{toolName}</code>
            </span>
          )}
        </div>
      </div>

      {/* Tool input summary */}
      {toolInputStr && (
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--action-btn-bg)',
          border: '1px solid var(--action-btn-border)',
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: 'monospace',
          maxHeight: 96,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.5,
        }}>
          {toolInputStr}
        </div>
      )}

      {/* Result badge or actions */}
      {!isPending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: isApproved ? 'rgba(78,201,176,0.15)' : 'rgba(244,71,71,0.15)',
            color: isApproved ? 'var(--success)' : 'var(--error)',
            borderRadius: 12,
            padding: '3px 10px',
            fontWeight: 500,
          }}>
            {isApproved ? <Check size={12} /> : <X size={12} />}
            {isApproved ? 'Approved' : 'Blocked'}
          </span>
        </div>
      ) : (
        <>
          {/* Optional reason textarea */}
          {showReason && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional reason..."
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 6,
                border: '1px solid var(--border)',
                padding: '6px 10px',
                fontSize: 12,
                resize: 'vertical',
                background: 'var(--action-btn-bg)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          )}

          {/* Primary actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleApprove}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'scale(1.02)' }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)' }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 8,
                border: 'none',
                background: 'var(--success)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'transform 0.15s ease, filter 0.15s ease',
              }}
            >
              <Check size={14} /> Approve
            </button>
            <button
              onClick={handleBlock}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--error)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'background 0.15s ease',
              }}
            >
              <X size={14} /> Block
            </button>
          </div>

          {/* Add reason toggle */}
          <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button
              onClick={() => setShowReason(!showReason)}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75' }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 0',
                opacity: 0.75,
                transition: 'opacity 0.15s ease',
              }}
            >
              {showReason ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showReason ? 'Hide reason' : 'Add reason'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
