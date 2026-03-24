import React from 'react'
import { ChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import { User, Bot } from 'lucide-react'

interface Props {
  message: ChatMessage
}

export default function Message({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        padding: '8px 20px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        background: isUser ? 'transparent' : 'var(--bg-secondary)',
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
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          {isUser ? '你' : 'Claude'}
          {message.isStreaming && (
            <span style={{ marginLeft: 8, color: 'var(--success)' }}>● 生成中...</span>
          )}
        </div>

        {/* Tool uses */}
        {message.toolUses && message.toolUses.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {message.toolUses.map((tool) => (
              <ToolUseBlock key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <MessageContent content={message.content} isUser={isUser} />
        )}
      </div>
    </div>
  )
}
