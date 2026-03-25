import React, { useState } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import { User, Bot, Copy, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  message: ChatMessage
  onRate?: (msgId: string, rating: 'up' | 'down' | null) => void
  onRewind?: (msgTimestamp: number) => void
}

export default function Message({ message, onRate, onRewind }: Props) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  const thinking = message.role !== 'permission' ? (message as StandardChatMessage).thinking : undefined

  function handleCopy() {
    if (message.role !== 'assistant') return
    const text = message.content
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
          {isUser ? '你' : 'Claude'}
          {message.role !== 'permission' && message.isStreaming && (
            <span style={{ color: 'var(--success)' }}>● 生成中...</span>
          )}
          {hovered && message.timestamp && (
            <span style={{ fontSize: 10, opacity: 0.6 }}>
              {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
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
              💭 思考过程
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
          <MessageContent content={message.content} isUser={isUser} />
        )}
      </div>

      {/* Copy button for assistant messages */}
      {isAssistant && hovered && (
        <button
          onClick={handleCopy}
          title="复制"
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
            '已复制 ✓'
          ) : (
            <Copy size={13} />
          )}
        </button>
      )}
      {isAssistant && hovered && onRate && (
        <div style={{ display: 'flex', gap: 4, position: 'absolute', top: 8, right: 80 }}>
          <button
            onClick={() => {
              const cur = (message as StandardChatMessage).rating
              onRate(message.id, cur === 'up' ? null : 'up')
            }}
            title="有用"
            style={{
              background: (message as StandardChatMessage).rating === 'up' ? 'var(--success)' : 'none',
              border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px',
              color: (message as StandardChatMessage).rating === 'up' ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12,
            }}
          >👍</button>
          <button
            onClick={() => {
              const cur = (message as StandardChatMessage).rating
              onRate(message.id, cur === 'down' ? null : 'down')
            }}
            title="无用"
            style={{
              background: (message as StandardChatMessage).rating === 'down' ? 'var(--error)' : 'none',
              border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px',
              color: (message as StandardChatMessage).rating === 'down' ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12,
            }}
          >👎</button>
        </div>
      )}
      {isAssistant && hovered && onRewind && (message as StandardChatMessage).timestamp && (
        <button
          onClick={() => onRewind((message as StandardChatMessage).timestamp)}
          title="回滚到此处（恢复 Claude 在此消息后修改的文件）"
          style={{
            position: 'absolute',
            top: 8,
            right: 148,
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
          ↩ 回滚
        </button>
      )}
    </div>
  )
}
