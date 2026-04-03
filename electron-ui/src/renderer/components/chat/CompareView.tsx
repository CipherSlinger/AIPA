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
          borderRadius: 8,
          fontSize: 13,
          lineHeight: '1.5',
          background: isUser ? 'var(--accent)' : 'var(--bg-message)',
          color: isUser ? '#fff' : 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
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
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'var(--bg-chat)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--bg-header)',
        }}
      >
        <GitBranch size={16} style={{ color: 'rgb(139, 92, 246)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
          {t('fork.compareTitle')}
        </span>
        <button
          onClick={onClose}
          title={t('error.close')}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <X size={16} />
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
              <div style={{ padding: '0 16px 4px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
              <div
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-header)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <GitBranch size={11} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {titleA || t('fork.originalBranch')}
                </span>
              </div>
              {errorA ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error)', fontSize: 12 }}>{errorA}</div>
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

            {/* Column B */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-header)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <GitBranch size={11} style={{ color: 'rgb(139, 92, 246)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {titleB || t('fork.forkedBranch')}
                </span>
              </div>
              {errorB ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error)', fontSize: 12 }}>{errorB}</div>
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
  )
}
