import React, { useState, useCallback, useEffect } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import MessageContextMenu from './MessageContextMenu'
import { User, Bot, Copy, ChevronDown, ChevronRight, Bookmark } from 'lucide-react'
import { usePrefsStore } from '../../store'

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

interface Props {
  message: ChatMessage
  onRate?: (msgId: string, rating: 'up' | 'down' | null) => void
  onRewind?: (msgTimestamp: number) => void
  onBookmark?: (msgId: string) => void
  searchQuery?: string
}

export default React.memo(function Message({ message, onRate, onRewind, onBookmark, searchQuery }: Props) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const compact = usePrefsStore(s => s.prefs.compactMode)
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)

  const thinking = message.role !== 'permission' ? (message as StandardChatMessage).thinking : undefined

  // Compute word and approx token count for assistant messages
  const wordInfo = isAssistant && message.role !== 'permission' && (message as StandardChatMessage).content
    ? (() => {
        const text = (message as StandardChatMessage).content
        const words = text.split(/\s+/).filter(w => w.length > 0).length
        // Rough token estimate: ~0.75 words per token for English
        const tokens = Math.round(words / 0.75)
        return `${words} words (~${tokens} tokens)`
      })()
    : null

  // Live-update relative timestamp every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const handleCopy = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const handleCopyMarkdown = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    // Copy raw content which is already markdown
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Don't show custom menu for permission/plan cards
    if (message.role === 'permission' || message.role === 'plan') return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [message.role])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
      style={{
        padding: compact ? '4px 16px' : '8px 20px',
        display: 'flex',
        gap: compact ? 8 : 12,
        alignItems: 'flex-start',
        background: isUser ? 'transparent' : 'var(--bg-secondary)',
        position: 'relative',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: compact ? 22 : 28,
          height: compact ? 22 : 28,
          borderRadius: '50%',
          background: isUser ? 'var(--user-bubble)' : '#5a3f8a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {isUser ? <User size={compact ? 11 : 14} color="#fff" /> : <Bot size={compact ? 11 : 14} color="#fff" />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {isUser ? 'You' : 'Claude'}
          {message.role !== 'permission' && message.isStreaming && (
            <span style={{ color: 'var(--success)' }}>Generating...</span>
          )}
          {message.timestamp && (
            <span
              style={{ fontSize: 10, opacity: 0.5 }}
              title={new Date(message.timestamp).toLocaleString()}
            >
              {relativeTime(message.timestamp)}
            </span>
          )}
          {message.role !== 'permission' && message.role !== 'plan' && (message as StandardChatMessage).bookmarked && (
            <Bookmark size={11} style={{ color: 'var(--warning)', fill: 'var(--warning)' }} />
          )}
        </div>

        {/* Tool uses */}
        {message.role !== 'permission' && message.toolUses && message.toolUses.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {message.toolUses.map((tool) => (
              <ToolUseBlock key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Thinking block */}
        {thinking && (
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 11, padding: 0, marginBottom: 4,
              }}
            >
              {thinkingExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Thinking
            </button>
            {thinkingExpanded && (
              <div style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '8px 12px',
                fontSize: 12, color: 'var(--text-muted)',
                fontStyle: 'italic', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
              }}>
                {thinking}
              </div>
            )}
          </div>
        )}

        {/* Image attachments (user messages) */}
        {isUser && message.role !== 'permission' && (message as StandardChatMessage).attachments?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {(message as StandardChatMessage).attachments!.map((att, i) => (
              <img
                key={i}
                src={att.dataUrl}
                alt={att.name}
                title={att.name}
                style={{
                  maxWidth: 200,
                  maxHeight: 150,
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  objectFit: 'cover',
                  cursor: 'pointer',
                }}
                onClick={() => window.open(att.dataUrl, '_blank')}
              />
            ))}
          </div>
        ) : null}

        {/* Text content */}
        {message.role !== 'permission' && message.content && (
          <div title={wordInfo || undefined}>
            <MessageContent content={message.content} isUser={isUser} searchQuery={searchQuery} />
          </div>
        )}
      </div>

      {/* Copy button for assistant messages */}
      {isAssistant && hovered && (
        <button
          onClick={handleCopy}
          title="Copy"
          style={{
            position: 'absolute',
            top: 8,
            right: 20,
            background: 'var(--bg-primary, #1e1e2e)',
            border: '1px solid var(--border, #3a3a4a)',
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
          }}
        >
          {copied ? (
            'Copied'
          ) : (
            <Copy size={13} />
          )}
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={message}
          onCopy={handleCopy}
          onCopyMarkdown={isAssistant ? handleCopyMarkdown : undefined}
          onRate={onRate ? (rating) => onRate(message.id, rating) : undefined}
          onBookmark={onBookmark ? () => onBookmark(message.id) : undefined}
          onRewind={onRewind && (message as StandardChatMessage).timestamp
            ? () => onRewind((message as StandardChatMessage).timestamp)
            : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  const pm = prevProps.message as StandardChatMessage
  const nm = nextProps.message as StandardChatMessage
  if (prevProps.message.id !== nextProps.message.id) return false
  if (prevProps.message.role !== nextProps.message.role) return false
  if (pm.content !== nm.content) return false
  if (pm.isStreaming !== nm.isStreaming) return false
  if (pm.rating !== nm.rating) return false
  if (pm.bookmarked !== nm.bookmarked) return false
  if (pm.thinking !== nm.thinking) return false
  if ((pm.toolUses?.length ?? 0) !== (nm.toolUses?.length ?? 0)) return false
  if (prevProps.searchQuery !== nextProps.searchQuery) return false
  return true
})
