import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Plus, Mic, MicOff } from 'lucide-react'
import { useChatStore, usePrefsStore } from '../../store'
import { useStreamJson } from '../../hooks/useStreamJson'
import MessageList from './MessageList'
import AtMentionPopup from './AtMentionPopup'

export default function ChatPanel() {
  const { messages, isStreaming, currentSessionId } = useChatStore()
  const { prefs } = usePrefsStore()
  const { sendMessage, abort, respondPermission, grantToolPermission, newConversation } = useStreamJson()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @ mention state
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  // Speech recognition state
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    setAtQuery(null)
    resizeTextarea()
    await sendMessage(text)
  }

  const sendText = async (text: string) => {
    if (!text.trim() || isStreaming) return
    await sendMessage(text.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      // Let AtMentionPopup handle these keys
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    // Detect @ trigger
    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@([^\s]*)$/)
    if (atMatch) {
      setAtQuery(atMatch[1])
    } else {
      setAtQuery(null)
    }
  }

  const handleAtSelect = (filePath: string) => {
    // Replace @query with the selected path
    const cursor = textareaRef.current?.selectionStart ?? input.length
    const textBefore = input.slice(0, cursor)
    const textAfter = input.slice(cursor)
    const atMatch = textBefore.match(/@([^\s]*)$/)
    if (atMatch) {
      const replaced = textBefore.slice(0, textBefore.length - atMatch[0].length) + `@${filePath}` + textAfter
      setInput(replaced)
    }
    setAtQuery(null)
    textareaRef.current?.focus()
  }

  // Speech recognition
  const toggleSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setInput((prev) => prev + transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
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
        <span style={{ color: 'var(--text-muted)', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentSessionId
            ? `会话: ${currentSessionId.slice(0, 8)}...`
            : `⚡ ${prefs.model?.split('-').slice(0, 3).join('-') || 'claude'}`}
        </span>
        {prefs.workingDir && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={prefs.workingDir}>
            📁 {prefs.workingDir.split(/[/\\]/).pop()}
          </span>
        )}
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
            <WelcomeScreen onSuggestion={sendText} />
          ) : (
          <MessageList messages={messages} onPermission={respondPermission} onGrantPermission={grantToolPermission} />
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
          ref={inputWrapRef}
          style={{
            position: 'relative',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            background: 'var(--bg-input)',
            borderRadius: 6,
            padding: '8px 12px',
            border: '1px solid var(--border)',
          }}
        >
          {atQuery !== null && (
            <AtMentionPopup
              query={atQuery}
              onSelect={handleAtSelect}
              onDismiss={() => setAtQuery(null)}
              anchorRef={inputWrapRef as React.RefObject<HTMLElement>}
            />
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="发送消息... (@ 引用文件，Enter 发送，Shift+Enter 换行)"
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
            onClick={toggleSpeech}
            title={listening ? '停止录音' : '语音输入'}
            style={{
              background: listening ? 'var(--error)' : 'none',
              border: listening ? 'none' : '1px solid var(--border)',
              borderRadius: 4,
              padding: '6px 8px',
              color: listening ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
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
          @ 引用文件 · Enter 发送 · Shift+Enter 换行
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

function WelcomeScreen({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    { emoji: '📁', text: '分析当前目录的代码结构' },
    { emoji: '🐛', text: '帮我找到并修复这个 bug' },
    { emoji: '✨', text: '帮我实现一个新功能' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 20 }}>
      <div style={{ fontSize: 56 }}>🤖</div>
      <div style={{ fontSize: 24, color: 'var(--text-primary)', fontWeight: 600 }}>你好！我是 Claude</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
        你的 AI 助手，随时准备帮助你
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {suggestions.map(({ emoji, text }) => (
          <button
            key={text}
            onClick={() => onSuggestion(text)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '16px 20px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13,
              minWidth: 110,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-active)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
            }}
          >
            <span style={{ fontSize: 24 }}>{emoji}</span>
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
