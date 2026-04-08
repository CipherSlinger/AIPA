import React, { useState } from 'react'
import { ElicitationMessage } from '../../types/app.types'
import { Check, X, ExternalLink, MessageSquare } from 'lucide-react'

interface Props {
  message: ElicitationMessage
  onRespond: (requestId: string, result: Record<string, unknown>) => void
}

export function ElicitationCard({ message, onRespond }: Props) {
  const [formData, setFormData] = useState<Record<string, string>>({})

  const isPending = message.decision === 'pending'

  const handleSubmit = () => {
    if (!isPending) return
    // For no-schema form, wrap free-text under key "_text"
    onRespond(message.requestId, { action: 'accept', content: formData })
  }

  const handleDecline = () => {
    if (!isPending) return
    onRespond(message.requestId, { action: 'decline' })
  }

  const handleCancel = () => {
    if (!isPending) return
    onRespond(message.requestId, { action: 'cancel' })
  }

  const schema = message.requestedSchema
  const properties = schema?.properties as Record<string, { type?: string; description?: string; title?: string }> | undefined
  const required = (schema?.required as string[]) || []

  const decisionLabel: Record<string, string> = {
    accepted: 'Submitted',
    declined: 'Declined',
    cancelled: 'Cancelled',
  }

  const decisionColor: Record<string, string> = {
    accepted: 'var(--success)',
    declined: 'var(--error)',
    cancelled: 'var(--text-muted)',
  }

  const decisionBg: Record<string, string> = {
    accepted: 'rgba(78,201,176,0.15)',
    declined: 'rgba(244,71,71,0.15)',
    cancelled: 'rgba(133,133,133,0.1)',
  }

  return (
    <div
      className={isPending ? 'elicitation-card-pending' : 'elicitation-card-enter'}
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
          background: 'rgba(59,130,246,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: isPending ? 'var(--accent)' : 'var(--text-muted)',
          opacity: isPending ? 1 : 0.6,
          transition: 'opacity 0.2s ease',
        }}>
          <MessageSquare size={22} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {message.serverName}
            </span>
            {isPending && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(59,130,246,0.15)',
                color: 'var(--accent)',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}>
                MCP
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Requesting information
          </span>
        </div>
      </div>

      {/* Message text */}
      <div style={{
        fontSize: 12,
        color: 'var(--text-primary)',
        background: 'var(--action-btn-bg)',
        border: '1px solid var(--action-btn-border)',
        borderRadius: 6,
        padding: '8px 12px',
        lineHeight: 1.6,
      }}>
        {message.message}
      </div>

      {/* Result badge */}
      {!isPending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: decisionBg[message.decision] || 'rgba(133,133,133,0.1)',
            color: decisionColor[message.decision] || 'var(--text-muted)',
            borderRadius: 12,
            padding: '3px 10px',
            fontWeight: 500,
          }}>
            {message.decision === 'accepted' ? <Check size={12} /> : <X size={12} />}
            {decisionLabel[message.decision] || message.decision}
          </span>
        </div>
      ) : message.mode === 'url' ? (
        /* URL mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {message.url && (
            <button
              onClick={() => window.electronAPI?.shellOpenExternal(message.url!)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <ExternalLink size={13} /> Open in Browser
            </button>
          )}
          <ActionButtons onSubmit={handleSubmit} onDecline={handleDecline} onCancel={handleCancel} submitLabel="Done" />
        </div>
      ) : (
        /* Form mode */
        <div>
          {properties && Object.keys(properties).length > 0 ? (
            Object.entries(properties).map(([key, prop]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                  {prop.title || key}
                  {required.includes(key) && <span style={{ color: 'var(--error)' }}> *</span>}
                </label>
                {prop.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{prop.description}</div>
                )}
                <input
                  type="text"
                  value={formData[key] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    padding: '7px 10px',
                    fontSize: 12,
                    background: 'var(--action-btn-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
              </div>
            ))
          ) : (
            <textarea
              value={formData._text || ''}
              onChange={(e) => setFormData({ _text: e.target.value })}
              placeholder="Enter your response..."
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 6,
                border: '1px solid var(--border)',
                padding: '7px 10px',
                fontSize: 12,
                resize: 'vertical',
                background: 'var(--action-btn-bg)',
                color: 'var(--text-primary)',
                marginBottom: 8,
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          )}
          <ActionButtons onSubmit={handleSubmit} onDecline={handleDecline} onCancel={handleCancel} />
        </div>
      )}
    </div>
  )
}

function ActionButtons({
  onSubmit, onDecline, onCancel, submitLabel = 'Submit',
}: {
  onSubmit: () => void
  onDecline: () => void
  onCancel: () => void
  submitLabel?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={onSubmit}
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'scale(1.02)' }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)' }}
        style={{
          flex: 1,
          height: 36,
          borderRadius: 8,
          border: 'none',
          background: 'var(--accent)',
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
        <Check size={14} /> {submitLabel}
      </button>
      <button
        onClick={onDecline}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        style={{
          padding: '0 14px',
          height: 36,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
      >
        Decline
      </button>
      <button
        onClick={onCancel}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        style={{
          padding: '0 14px',
          height: 36,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
