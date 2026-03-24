import React, { useState } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import { User, Bot, Copy, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  message: ChatMessage
}

export default function Message({ message }: Props) {
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
    </div>
  )
}
