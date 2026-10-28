import React from 'react'
import { Check } from 'lucide-react'

interface Props {
  onSubmit: () => void
  onDecline: () => void
  onCancel: () => void
  submitLabel?: string
  declineLabel?: string
  cancelLabel?: string
  /** Every question must be answered before the submit button works. */
  submitDisabled?: boolean
}

/**
 * Submit / Decline / Cancel row shared by the schema-driven elicitation form,
 * the URL mode, and the Codex question form. Lives in its own file so the
 * question form does not import from the card that renders it.
 */
export function ElicitationActions({
  onSubmit,
  onDecline,
  onCancel,
  submitLabel = 'Submit',
  declineLabel = 'Decline',
  cancelLabel = 'Cancel',
  submitDisabled = false,
}: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={onSubmit}
        disabled={submitDisabled}
        onMouseEnter={(e) => {
          if (submitDisabled) return
          e.currentTarget.style.filter = 'brightness(1.12)'
          e.currentTarget.style.transform = 'scale(1.02)'
        }}
        onMouseLeave={(e) => {
          if (submitDisabled) return
          e.currentTarget.style.filter = 'brightness(1)'
          e.currentTarget.style.transform = 'scale(1)'
        }}
        style={{
          flex: 1,
          height: 36,
          borderRadius: 6,
          border: 'none',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.75), rgba(22,163,74,0.75))',
          color: 'rgba(255,255,255,0.95)',
          fontWeight: 600,
          fontSize: 13,
          cursor: submitDisabled ? 'not-allowed' : 'pointer',
          opacity: submitDisabled ? 0.45 : 1,
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
        {declineLabel}
      </button>
      <button
        onClick={onCancel}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        style={{
          padding: '0 14px',
          height: 36,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-hover)',
          color: 'var(--text-secondary)',
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {cancelLabel}
      </button>
    </div>
  )
}
