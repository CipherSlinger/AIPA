/**
 * SpeculationCard — Preview card for speculative execution results (Iteration 489).
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

export default function SpeculationCard({ status, result, onAccept, onReject }: SpeculationCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (status === 'idle' || status === 'accepted' || status === 'rejected') return null

  // Loading state
  if (status === 'running') {
    return (
      <div style={{
        margin: '4px 16px 8px',
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid rgba(139,92,246,0.2)',
        background: 'rgba(139,92,246,0.04)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Zap size={12} style={{ color: '#8b5cf6', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
      borderRadius: 10,
      border: '1px solid rgba(139,92,246,0.3)',
      background: 'rgba(139,92,246,0.05)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: expanded ? '1px solid rgba(139,92,246,0.15)' : 'none',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <Zap size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Speculative Preview
          </span>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            "{result.prompt}"
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {hasFiles && (
            <span style={{
              fontSize: 9, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
              borderRadius: 6, padding: '1px 5px', fontWeight: 600,
            }}>
              {result.changedFiles.length} file{result.changedFiles.length !== 1 ? 's' : ''}
            </span>
          )}
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
              fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5,
              marginBottom: 8,
              padding: '6px 8px',
              background: 'rgba(0,0,0,0.12)',
              borderRadius: 6,
              maxHeight: 120,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {previewText}{result.text.length > 300 ? '…' : ''}
            </div>
          )}

          {/* Tool actions */}
          {hasTools && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>
                Tool calls ({result.toolActions.length})
              </div>
              {result.toolActions.slice(0, 3).map((ta, i) => (
                <div key={i} style={{
                  fontSize: 10, color: 'var(--text-muted)',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(0,0,0,0.08)', marginBottom: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ta.name}({Object.keys(ta.input).slice(0, 2).join(', ')})
                </div>
              ))}
            </div>
          )}

          {/* Changed files */}
          {hasFiles && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>
                Files to be modified
              </div>
              {result.changedFiles.slice(0, 5).map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10, color: '#8b5cf6', marginBottom: 1,
                }}>
                  <FileEdit size={10} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
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
        borderTop: '1px solid rgba(139,92,246,0.15)',
        background: 'rgba(0,0,0,0.04)',
      }}>
        <button
          onClick={onAccept}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#8b5cf6' }}
        >
          <Check size={10} />
          Accept
        </button>
        <button
          onClick={onReject}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6, fontSize: 10,
            border: '1px solid rgba(139,92,246,0.3)', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'border-color 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--error)'
            e.currentTarget.style.color = 'var(--error)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'
            e.currentTarget.style.color = 'var(--text-muted)'
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
