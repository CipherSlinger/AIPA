import React, { useState } from 'react'
import { HookCallbackMessage } from '../../types/app.types'
import { Check, X, ChevronDown, ChevronUp, Zap } from 'lucide-react'

interface Props {
  message: HookCallbackMessage
  onRespond: (requestId: string, response: Record<string, unknown>) => void
}

/** A single choice option from CLI PromptRequest */
interface PromptOption {
  key: string
  label: string
  description?: string
}

export function HookCallbackCard({ message, onRespond }: Props) {
  const [showReason, setShowReason] = useState(false)
  const [reason, setReason] = useState('')
  const [approveHover, setApproveHover] = useState(false)
  const [blockHover, setBlockHover] = useState(false)
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null)

  const hookEventName = (message.hookInput.hook_event_name as string) || 'Hook Event'
  const toolName = (message.hookInput.tool_name as string) || ''
  const toolInput = (message.hookInput.tool_input as Record<string, unknown>) || {}

  // Detect PromptRequest options array
  const rawOptions = message.hookInput.options
  const options: PromptOption[] | null =
    Array.isArray(rawOptions) && rawOptions.length > 0
      ? (rawOptions as PromptOption[])
      : null

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

  const handleOptionConfirm = () => {
    if (!isPending || !selectedOptionKey) return
    const response: Record<string, unknown> = { decision: 'approve', selected_key: selectedOptionKey }
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
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderLeft: isPending ? '3px solid rgba(99,102,241,0.50)' : '3px solid rgba(99,102,241,0.20)',
        borderRadius: 10,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'rgba(99,102,241,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#818cf8',
          opacity: isPending ? 1 : 0.55,
          transition: 'opacity 0.15s ease',
        }}>
          <Zap size={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {hookEventName}
            </span>
            {isPending && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.07em',
                padding: '1px 5px',
                borderRadius: 6,
                background: 'rgba(99,102,241,0.15)',
                color: '#818cf8',
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
              Tool: <code style={{
                fontFamily: 'monospace',
                fontSize: 11,
                background: 'rgba(99,102,241,0.12)',
                color: '#a5b4fc',
                borderRadius: 6,
                padding: '1px 6px',
              }}>{toolName}</code>
            </span>
          )}
        </div>
      </div>

      {/* Tool input summary */}
      {toolInputStr && (
        <pre style={{
          margin: 0,
          fontSize: 11,
          color: '#a5b4fc',
          background: 'var(--code-bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 10px',
          fontFamily: 'monospace',
          maxHeight: 96,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.5,
        }}>
          {toolInputStr}
        </pre>
      )}

      {/* Result badge or actions */}
      {!isPending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: isApproved ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: isApproved ? '#4ade80' : '#f87171',
            borderRadius: 12,
            padding: '3px 10px',
            fontWeight: 500,
          }}>
            {isApproved ? <Check size={12} /> : <X size={12} />}
            {isApproved ? 'Approved' : 'Blocked'}
          </span>
        </div>
      ) : options ? (
        /* ── PromptRequest multi-option UI ── */
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Section label */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 2,
            }}>
              Select an option
            </div>
            {options.map(opt => {
              const isSelected = selectedOptionKey === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => setSelectedOptionKey(opt.key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 7,
                    background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--bg-hover)',
                    border: isSelected
                      ? '1px solid rgba(99,102,241,0.40)'
                      : '1px solid var(--border)',
                    borderLeft: isSelected
                      ? '3px solid rgba(99,102,241,0.75)'
                      : '3px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(99,102,241,0.07)'
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                      e.currentTarget.style.borderLeft = '3px solid rgba(99,102,241,0.40)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--bg-hover)'
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.borderLeft = '3px solid transparent'
                    }
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isSelected ? '#a5b4fc' : 'var(--text-primary)',
                    transition: 'color 0.15s ease',
                  }}>
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span style={{
                      fontSize: 11,
                      color: isSelected ? 'rgba(165,180,252,0.70)' : 'var(--text-muted)',
                      lineHeight: 1.35,
                    }}>
                      {opt.description}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

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
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          )}

          {/* Confirm button */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleOptionConfirm}
              disabled={!selectedOptionKey}
              onMouseEnter={(e) => {
                if (selectedOptionKey) {
                  e.currentTarget.style.filter = 'brightness(0.95)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: 'none',
                background: selectedOptionKey
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'var(--bg-hover)',
                color: selectedOptionKey ? 'rgba(255,255,255,0.95)' : 'var(--text-faint)',
                fontWeight: 600,
                fontSize: 13,
                cursor: selectedOptionKey ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <Check size={14} /> Confirm
            </button>
          </div>

          {/* Add reason toggle */}
          <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button
              onClick={() => setShowReason(!showReason)}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.75'
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(251,191,36,0.7)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 5px',
                borderRadius: 8,
                opacity: 0.75,
                transition: 'opacity 0.15s ease, background 0.15s ease',
              }}
            >
              {showReason ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showReason ? 'Hide reason' : 'Add reason'}
            </button>
          </div>
        </>
      ) : (
        /* ── Standard approve/block UI ── */
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
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          )}

          {/* Primary actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleApprove}
              onMouseEnter={(e) => {
                setApproveHover(true)
                e.currentTarget.style.filter = 'brightness(0.95)'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
              }}
              onMouseLeave={(e) => {
                setApproveHover(false)
                e.currentTarget.style.filter = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: 'none',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
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
              <Check size={14} /> Approve
            </button>
            <button
              onClick={handleBlock}
              onMouseEnter={(e) => {
                setBlockHover(true)
                e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.40)'
              }}
              onMouseLeave={(e) => {
                setBlockHover(false)
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-hover)',
                color: '#fca5a5',
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
              <X size={14} /> Block
            </button>
          </div>

          {/* Add reason toggle */}
          <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button
              onClick={() => setShowReason(!showReason)}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.75'
                e.currentTarget.style.background = 'transparent'
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(251,191,36,0.7)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 5px',
                borderRadius: 8,
                opacity: 0.75,
                transition: 'opacity 0.15s ease, background 0.15s ease',
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
