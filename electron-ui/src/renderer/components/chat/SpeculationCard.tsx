/**
 * SpeculationCard — Preview card for speculative execution results (Iteration 490).
 * Shows below the last assistant message when a speculation is ready.
 *
 * Inspired by Claude Code's UI for speculation previews.
 * Shows: speculated prompt, response preview, file changes, accept/reject controls.
 */
import React, { useState } from 'react'
import { Zap, Check, X, ChevronDown, ChevronRight, FileEdit } from 'lucide-react'
import type { SpeculationState, SpeculationStatus } from '../../hooks/useSpeculation'

interface SpeculationCardProps {
  status: SpeculationStatus
  result: SpeculationState | null
  onAccept: () => void
  onReject: () => void
}

// Inline spinner using border animation
function IndigoSpinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 12,
      height: 12,
      borderRadius: '50%',
      border: '2px solid rgba(99,102,241,0.25)',
      borderTopColor: '#818cf8',
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  )
}

export default function SpeculationCard({ status, result, onAccept, onReject }: SpeculationCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (status === 'idle') return null

  // Accepted terminal state — brief green confirmation banner
  if (status === 'accepted') {
    return (
      <div style={{
        margin: '4px 16px 8px',
        padding: '7px 12px',
        background: 'var(--popup-bg)',
        borderLeft: '3px solid rgba(34,197,94,0.55)',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Check size={12} style={{ color: '#4ade80', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'rgba(34,197,94,0.82)' }}>Speculation accepted</span>
      </div>
    )
  }

  // Rejected terminal state — brief red confirmation banner
  if (status === 'rejected') {
    return (
      <div style={{
        margin: '4px 16px 8px',
        padding: '7px 12px',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(239,68,68,0.20)',
        borderLeft: '3px solid rgba(239,68,68,0.45)',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: 0.60,
      }}>
        <X size={12} style={{ color: '#f87171', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'rgba(248,113,113,0.60)', textDecoration: 'line-through' }}>Speculation discarded</span>
      </div>
    )
  }

  // Running state — indigo spinner with pulse zap icon
  if (status === 'running') {
    return (
      <div style={{
        margin: '4px 16px 8px',
        padding: '8px 12px',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderLeft: '3px solid rgba(99,102,241,0.6)',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <IndigoSpinner />
        <Zap size={11} style={{ color: '#a5b4fc', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <span style={{ fontSize: 11, color: 'rgba(165,180,252,0.82)' }}>
          Preparing speculative preview…
        </span>
      </div>
    )
  }

  if (!result) return null

  const hasFiles = result.changedFiles.length > 0
  const hasTools = result.toolActions.length > 0
  const previewText = result.text.slice(0, 300)

  return (
    <div style={{
      margin: '4px 16px 8px',
      background: 'rgba(15,15,25,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid rgba(99,102,241,0.55)',
      borderRadius: 10,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: expanded ? '1px solid var(--bg-hover)' : 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }} onClick={() => setExpanded(e => !e)}>
        <Zap size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title — opacity 0.82 */}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(165,180,252,0.82)' }}>
            Speculative Preview
          </span>
          {/* Subtitle — opacity 0.60 */}
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            "{result.prompt}"
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {hasFiles && (
            <span style={{
              fontSize: 9, background: 'rgba(99,102,241,0.12)', color: 'rgba(165,180,252,0.82)',
              border: '1px solid rgba(99,102,241,0.28)',
              borderRadius: 6, padding: '1px 5px', fontWeight: 600,
            }}>
              {result.changedFiles.length} file{result.changedFiles.length !== 1 ? 's' : ''}
            </span>
          )}
          {/* Timestamp / metadata — opacity 0.38 */}
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {Math.round(result.durationMs / 1000)}s
          </span>
          {expanded ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '8px 12px' }}>
          {/* Response preview */}
          {previewText && (
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
              marginBottom: 8,
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.30)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              maxHeight: 120,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--bg-active) transparent',
            } as React.CSSProperties}>
              {previewText}{result.text.length > 300 ? '…' : ''}
            </div>
          )}

          {/* Tool actions */}
          {hasTools && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4 }}>
                Tool calls ({result.toolActions.length})
              </div>
              {result.toolActions.slice(0, 3).map((ta, i) => (
                <div key={i} style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  padding: '3px 8px', borderRadius: 8,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  marginBottom: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                  transition: 'all 0.15s ease',
                }}>
                  {ta.name}({Object.keys(ta.input).slice(0, 2).join(', ')})
                </div>
              ))}
            </div>
          )}

          {/* Changed files */}
          {hasFiles && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4 }}>
                Files to be modified
              </div>
              {result.changedFiles.slice(0, 5).map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, color: 'rgba(165,180,252,0.82)', marginBottom: 2,
                  padding: '3px 8px', borderRadius: 8,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s ease',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <FileEdit size={10} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{f}</span>
                </div>
              ))}
              {result.changedFiles.length > 5 && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  +{result.changedFiles.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accept / Reject bar */}
      <div style={{
        display: 'flex', gap: 6, padding: '6px 12px',
        borderTop: '1px solid var(--bg-hover)',
        background: 'rgba(8,8,16,0.5)',
      }}>
        {/* Accept — indigo gradient CTA */}
        <button
          onClick={onAccept}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: 'none',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: 'rgba(255,255,255,0.95)', cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,1), rgba(139,92,246,1))' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))' }}
        >
          <Check size={10} />
          Accept
        </button>
        {/* Reject — ghost glass */}
        <button
          onClick={onReject}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6, fontSize: 12,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)', cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
            e.currentTarget.style.color = '#fca5a5'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <X size={10} />
          Discard
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'var(--text-muted)', alignSelf: 'center' }}>
          Pre-executed in sandbox
        </span>
      </div>
    </div>
  )
}
