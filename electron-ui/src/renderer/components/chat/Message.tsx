import React, { useState, useCallback } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import MessageContextMenu from './MessageContextMenu'
import { User, Bot, Copy, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  message: ChatMessage
  onRate?: (msgId: string, rating: 'up' | 'down' | null) => void
  onRewind?: (msgTimestamp: number) => void
  searchQuery?: string
}

export default React.memo(function Message({ message, onRate, onRewind, searchQuery }: Props) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const thinking = message.role !== 'permission' ? (message as StandardChatMessage).thinking : undefined

  const handleCopy = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
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
        padding: '8px 20px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        background: isUser ? 'transparent' : 'var(--bg-secondary)',
        position: 'relative',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: isUser ? 'var(--user-bubble)' : '#5a3f8a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {isUser ? <User size={14} color="#fff" /> : <Bot size={14} color="#fff" />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {isUser ? 'You' : 'Claude'}
          {message.role !== 'permission' && message.isStreaming && (
            <span style={{ color: 'var(--success)' }}>Generating...</span>
          )}
          {hovered && message.timestamp && (
            <span style={{ fontSize: 10, opacity: 0.6 }}>
              {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
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
          <MessageContent content={message.content} isUser={isUser} searchQuery={searchQuery} />
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
          onRate={onRate ? (rating) => onRate(message.id, rating) : undefined}
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
  if (pm.thinking !== nm.thinking) return false
  if ((pm.toolUses?.length ?? 0) !== (nm.toolUses?.length ?? 0)) return false
  if (prevProps.searchQuery !== nextProps.searchQuery) return false
  return true
})
