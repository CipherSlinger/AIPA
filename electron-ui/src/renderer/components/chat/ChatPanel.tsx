import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Plus, Trash2 } from 'lucide-react'
import { useChatStore } from '../../store'
import { useStreamJson } from '../../hooks/useStreamJson'
import MessageList from './MessageList'

export default function ChatPanel() {
  const { messages, isStreaming, currentSessionId } = useChatStore()
  const { sendMessage, abort, respondPermission, newConversation } = useStreamJson()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    resizeTextarea()
    await sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const resizeTextarea = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  useEffect(() => {
    resizeTextarea()
  }, [input])

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 12, flex: 1 }}>
          {currentSessionId
            ? `会话: ${currentSessionId.slice(0, 8)}...`
            : '新对话'}
        </span>
        <button
          onClick={newConversation}
          title="新对话"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {messages.length === 0 ? (
            <WelcomeScreen />
          ) : (
          <MessageList messages={messages} onPermission={respondPermission} />
          )}
        </div>
        {isStreaming && <ThinkingIndicator />}
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            background: 'var(--bg-input)',
            borderRadius: 6,
            padding: '8px 12px',
            border: '1px solid var(--border)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              resize: 'none',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.5,
              minHeight: 20,
              maxHeight: 160,
              overflow: 'auto',
            }}
          />
          <button
            onClick={isStreaming ? abort : handleSend}
            disabled={!isStreaming && !input.trim()}
            title={isStreaming ? '停止生成' : '发送 (Ctrl+Enter)'}
            style={{
              background: isStreaming ? 'var(--error)' : 'var(--accent)',
              border: 'none',
              borderRadius: 4,
              padding: '6px 10px',
              color: '#fff',
              cursor: isStreaming || input.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              opacity: !isStreaming && !input.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {isStreaming ? <Square size={14} /> : <Send size={14} />}
          </button>
        </div>
        <div style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>
          Enter 发送 · Shift+Enter 换行
        </div>
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '10px 16px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🤖</div>
      <div style={{ fontSize: 20, color: 'var(--text-primary)', fontWeight: 500 }}>Claude Code UI</div>
      <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
        与 Claude 开始对话。Claude 可以理解你的代码库，编辑文件，执行终端命令，并完成整个工作流程。
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        在下方输入框中输入你的问题或任务...
      </div>
    </div>
  )
}
