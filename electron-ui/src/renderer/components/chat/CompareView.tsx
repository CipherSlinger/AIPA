// CompareView — side-by-side comparison of two conversation branches (Iteration 456)
// Shows shared prefix once (before the fork point), then diverging messages in parallel columns.
import React, { useEffect, useState, useCallback } from 'react'
import { X, GitBranch } from 'lucide-react'
import { ChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'

interface CompareSession {
  sessionId: string
  title: string
  messages: ChatMessage[]
  loading: boolean
  error: string | null
}

interface CompareViewProps {
  sessionA: string
  sessionB: string
  titleA?: string
  titleB?: string
  forkMessageIndex?: number
  onClose: () => void
}

function useSessionMessages(sessionId: string): { messages: ChatMessage[]; loading: boolean; error: string | null } {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    window.electronAPI.sessionLoad(sessionId)
      .then((result: unknown) => {
        const msgs = result as ChatMessage[]
        setMessages(Array.isArray(msgs) ? msgs : [])
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err?.message || 'Failed to load session')
        setLoading(false)
      })
  }, [sessionId])

  return { messages, loading, error }
}

interface MessageBubbleProps {
  message: ChatMessage
  side: 'left' | 'right'
}

function SimpleMessageBubble({ message, side }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const content = 'content' in message ? (message as { content: string }).content : ''
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? (side === 'left' ? 'flex-end' : 'flex-start') : 'flex-start',
        padding: '4px 12px',
      }}
    >
      <div
        style={{
          maxWidth: '90%',
          padding: '8px 12px',
          borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
          fontSize: 13,
          lineHeight: '1.5',
          background: isUser
            ? 'rgba(99,102,241,0.14)'
            : 'var(--glass-bg-low)',
          border: isUser
            ? '1px solid rgba(99,102,241,0.25)'
            : '1px solid var(--bg-hover)',
          color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          opacity: 0.85,
        }}
      >
        {content || <em style={{ opacity: 0.5 }}>[empty]</em>}
      </div>
    </div>
  )
}

export default function CompareView({ sessionA, sessionB, titleA, titleB, forkMessageIndex, onClose }: CompareViewProps) {
  const t = useT()
  const { messages: messagesA, loading: loadingA, error: errorA } = useSessionMessages(sessionA)
  const { messages: messagesB, loading: loadingB, error: errorB } = useSessionMessages(sessionB)

  // Determine shared prefix length: messages before (and including) the fork point are shared.
  // We show them in a unified "shared" section above the split.
  const sharedCount = forkMessageIndex !== undefined
    ? Math.min(forkMessageIndex + 1, messagesA.length, messagesB.length)
    : 0

  const divergingA = messagesA.slice(sharedCount)
  const divergingB = messagesB.slice(sharedCount)
  const sharedMessages = messagesA.slice(0, sharedCount)

  const loading = loadingA || loadingB

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div style={{
        background: 'rgba(13,13,20,0.95)',
        borderTop: '1px solid var(--border)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUp 0.15s ease',
      }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--bg-hover)',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          flexShrink: 0,
        }}
      >
        <GitBranch size={16} style={{ color: 'rgba(139,92,246,0.9)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
          {t('fork.compareTitle')}
        </span>
        <button
          onClick={onClose}
          title={t('error.close')}
          style={{
            marginLeft: 'auto',
            background: 'var(--border)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: 28,
            height: 28,
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <X size={14} />
        </button>
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {t('fork.loadingBranches')}
        </div>
      )}

      {!loading && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Shared prefix section */}
          {sharedMessages.length > 0 && (
            <div
              style={{
                borderBottom: '2px dashed rgba(139, 92, 246, 0.3)',
                padding: '8px 0 4px',
                flexShrink: 0,
                maxHeight: '30%',
                overflowY: 'auto',
                background: 'rgba(139, 92, 246, 0.03)',
              }}
            >
              <div style={{ padding: '0 16px 4px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {t('fork.sharedPrefix')}
              </div>
              {sharedMessages.map((msg) => (
                <SimpleMessageBubble key={msg.id} message={msg} side="left" />
              ))}
            </div>
          )}

          {/* Diverging columns */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {/* Column A */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(99,102,241,0.02)' }}>
              <div
                style={{
                  padding: '5px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'rgba(99,102,241,0.60)',
                  background: 'var(--glass-shimmer)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <GitBranch size={10} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {titleA || t('fork.originalBranch')}
                </span>
              </div>
              {errorA ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: 12 }}>{errorA}</div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                  {divergingA.length === 0 && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      {t('fork.noMessages')}
                    </div>
                  )}
                  {divergingA.map((msg) => (
                    <SimpleMessageBubble key={msg.id} message={msg} side="left" />
                  ))}
                </div>
              )}
            </div>

            {/* Split view divider */}
            <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

            {/* Column B */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(139,92,246,0.02)' }}>
              <div
                style={{
                  padding: '5px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: 'rgba(139,92,246,0.60)',
                  background: 'var(--glass-shimmer)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <GitBranch size={10} style={{ color: 'rgba(139,92,246,0.60)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {titleB || t('fork.forkedBranch')}
                </span>
              </div>
              {errorB ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: 12 }}>{errorB}</div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                  {divergingB.length === 0 && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      {t('fork.noMessages')}
                    </div>
                  )}
                  {divergingB.map((msg) => (
                    <SimpleMessageBubble key={msg.id} message={msg} side="right" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
