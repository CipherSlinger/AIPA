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
    accepted: 'rgba(34,197,94,0.9)',
    declined: '#fca5a5',
    cancelled: 'rgba(255,255,255,0.45)',
  }

  const decisionBg: Record<string, string> = {
    accepted: 'rgba(34,197,94,0.12)',
    declined: 'rgba(239,68,68,0.12)',
    cancelled: 'rgba(255,255,255,0.06)',
  }

  return (
    <div
      className={isPending ? 'elicitation-card-pending' : 'elicitation-card-enter'}
      style={{
        margin: '8px auto',
        maxWidth: 420,
        background: isPending
          ? 'rgba(99,102,241,0.08)'
          : message.decision === 'accepted'
            ? 'rgba(34,197,94,0.08)'
            : 'rgba(239,68,68,0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: isPending
          ? '1px solid rgba(99,102,241,0.20)'
          : message.decision === 'accepted'
            ? '1px solid rgba(34,197,94,0.20)'
            : '1px solid rgba(239,68,68,0.20)',
        borderLeft: isPending
          ? '3px solid rgba(99,102,241,0.6)'
          : message.decision === 'accepted'
            ? '3px solid rgba(34,197,94,0.5)'
            : '3px solid rgba(239,68,68,0.5)',
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))',
          boxShadow: '0 0 16px rgba(99,102,241,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'rgba(255,255,255,0.95)',
        }}>
          <MessageSquare size={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {message.serverName}
            </span>
            {isPending && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                padding: '1px 5px',
                borderRadius: 6,
                background: 'rgba(99,102,241,0.18)',
                color: 'rgba(165,180,252,0.9)',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}>
                MCP
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>
            Requesting information
          </span>
        </div>
      </div>

      {/* Message text */}
      <div style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
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
            background: decisionBg[message.decision] || 'rgba(255,255,255,0.06)',
            color: decisionColor[message.decision] || 'rgba(255,255,255,0.45)',
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
                borderRadius: 6,
                border: '1px solid rgba(99,102,241,0.4)',
                background: 'rgba(99,102,241,0.12)',
                color: 'rgba(165,180,252,0.9)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
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
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, color: 'rgba(255,255,255,0.38)' }}>
                  {prop.title || key}
                  {required.includes(key) && <span style={{ color: '#fca5a5' }}> *</span>}
                </label>
                {prop.description && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4, lineHeight: 1.6 }}>{prop.description}</div>
                )}
                <input
                  type="text"
                  value={formData[key] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: '7px 10px',
                    fontSize: 12,
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.82)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
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
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '7px 10px',
                fontSize: 12,
                resize: 'vertical',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.82)',
                marginBottom: 8,
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
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
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.12)'; e.currentTarget.style.transform = 'scale(1.02)' }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)' }}
        style={{
          flex: 1,
          height: 36,
          borderRadius: 6,
          border: 'none',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.75), rgba(22,163,74,0.75))',
          color: 'rgba(255,255,255,0.95)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 0.15s ease',
        }}
      >
        <Check size={14} /> {submitLabel}
      </button>
      <button
        onClick={onDecline}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
        style={{
          padding: '0 14px',
          height: 36,
          borderRadius: 6,
          border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.12)',
          color: '#fca5a5',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        Decline
      </button>
      <button
        onClick={onCancel}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        style={{
          padding: '0 14px',
          height: 36,
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.60)',
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
