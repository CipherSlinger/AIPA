import React, { useState } from 'react'
import { Send, Loader2, Check, X, Users } from 'lucide-react'
import { ToolUseInfo } from '../../../types/app.types'

/** SendMessage: shows recipient + message preview with indigo left-border style */
export function SendMessageCard({ tool }: { tool: ToolUseInfo }) {
  const to = typeof tool.input?.to === 'string' ? tool.input.to : ''
  const message = typeof tool.input?.message === 'string' ? tool.input.message : ''
  const [msgExpanded, setMsgExpanded] = useState(false)
  const MSG_LIMIT = 120
  const isMsgLong = message.length > MSG_LIMIT
  const msgPreview = isMsgLong && !msgExpanded ? message.slice(0, MSG_LIMIT) + '…' : message

  const isDone = tool.status === 'done'
  const isRunning = tool.status === 'running'
  const isError = tool.status === 'error'
  const resultText = typeof tool.result === 'string' ? tool.result : tool.result != null ? JSON.stringify(tool.result) : ''
  const isSuccess = isDone && !isError

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: '2px solid rgba(99,102,241,0.5)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px', background: 'var(--bg-hover)',
        borderBottom: '1px solid var(--border)',
      }}>
        <Send size={12} style={{ color: 'rgba(165,180,252,0.8)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>SendMessage</span>
        {isRunning && <Loader2 size={11} className="animate-spin" style={{ color: 'rgba(165,180,252,0.7)', flexShrink: 0 }} />}
        {isSuccess && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 8,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)',
            color: '#4ade80', fontSize: 10, fontWeight: 600,
          }}>
            <Check size={9} style={{ flexShrink: 0 }} />
            Delivered
          </span>
        )}
        {isError && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 8,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)',
            color: '#fca5a5', fontSize: 10, fontWeight: 600,
          }}>
            <X size={9} style={{ flexShrink: 0 }} />
            Failed
          </span>
        )}
      </div>
      {/* Body */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {to && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={11} style={{ color: 'rgba(165,180,252,0.6)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>To:</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'rgba(165,180,252,0.9)',
              fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {to}
            </span>
          </div>
        )}
        {message && (
          <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 6, padding: '6px 9px', border: '1px solid rgba(99,102,241,0.14)' }}>
            <pre style={{
              margin: 0, fontSize: 11, fontFamily: 'inherit',
              color: 'var(--text-secondary)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msgPreview}
            </pre>
            {isMsgLong && (
              <button
                onClick={() => setMsgExpanded(!msgExpanded)}
                style={{
                  marginTop: 3, background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(165,180,252,0.65)', fontSize: 10, padding: '0',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(165,180,252,0.65)' }}
              >
                {msgExpanded ? 'Show less' : `+ ${message.length - MSG_LIMIT} more chars`}
              </button>
            )}
          </div>
        )}
        {tool.result !== undefined && !isSuccess && resultText && (
          <div style={{
            fontSize: 11,
            color: isError ? '#fca5a5' : 'var(--text-secondary)',
            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 100, overflow: 'auto',
          }}>
            {resultText.slice(0, 150)}{resultText.length > 150 ? '…' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
