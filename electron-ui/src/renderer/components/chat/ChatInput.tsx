import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Mic, MicOff, AtSign, TerminalSquare, ListPlus, ClipboardPaste, FileText, Languages, PenLine, CircleHelp, SpellCheck } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import AtMentionPopup from './AtMentionPopup'
import SlashCommandPopup, { SLASH_COMMANDS, SlashCommand } from './SlashCommandPopup'
import QuickReplyChips from './QuickReplyChips'
import { useImagePaste, ImageAttachment } from '../../hooks/useImagePaste'
import { useT } from '../../i18n'

// Placeholder suggestion i18n keys
const PLACEHOLDER_KEYS = [
  'chat.placeholders.default',
  'chat.placeholders.draftEmail',
  'chat.placeholders.summarize',
  'chat.placeholders.weeklyReport',
  'chat.placeholders.explainConcept',
  'chat.placeholders.organize',
  'chat.placeholders.translate',
  'chat.placeholders.helpCode',
]

// Clipboard quick-action definitions
const CLIPBOARD_ACTIONS = [
  { id: 'summarize', icon: FileText, labelKey: 'clipboard.summarize', template: 'Please summarize the following text concisely:\n\n{text}' },
  { id: 'translate', icon: Languages, labelKey: 'clipboard.translate', templateEn: 'Please translate the following text to Chinese:\n\n{text}', templateZh: 'Please translate the following text to English:\n\n{text}' },
  { id: 'rewrite', icon: PenLine, labelKey: 'clipboard.rewrite', template: 'Please rewrite the following text to be more clear and professional:\n\n{text}' },
  { id: 'explain', icon: CircleHelp, labelKey: 'clipboard.explain', template: 'Please explain the following text in simple terms:\n\n{text}' },
  { id: 'grammar', icon: SpellCheck, labelKey: 'clipboard.grammar', template: 'Please check the following text for grammar and spelling errors, and provide corrections:\n\n{text}' },
] as const

interface ChatInputProps {
  isStreaming: boolean
  onSend: (text: string, attachments?: ImageAttachment[]) => Promise<void>
  onAbort: () => void
  onNewConversation: () => void
}

export default function ChatInput({
  isStreaming,
  onSend,
  onAbort,
  onNewConversation,
}: ChatInputProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const addToast = useUiStore(s => s.addToast)
  const quotedText = useUiStore(s => s.quotedText)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const taskQueue = useChatStore(s => s.taskQueue)
  const addToQueue = useChatStore(s => s.addToQueue)

  const [input, setInput] = useState(() => {
    try {
      return sessionStorage.getItem('aipa:draft-input') || ''
    } catch { return '' }
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  // @ mention state
  const [atQuery, setAtQuery] = useState<string | null>(null)

  // Slash command state
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [customCommands, setCustomCommands] = useState<{ name: string; description: string }[]>([])

  // Speech recognition state
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Clipboard actions dropdown state
  const [showClipboardMenu, setShowClipboardMenu] = useState(false)
  const clipboardMenuRef = useRef<HTMLDivElement>(null)

  // Input history (sent messages) -- persisted via localStorage
  const [initialHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('aipa:input-history')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const inputHistoryRef = useRef<string[]>(initialHistory)
  const historyIdxRef = useRef(-1)
  const tempInputRef = useRef('')

  // Rotating placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  useEffect(() => {
    if (input.length > 0) return
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_KEYS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [input])

  const { attachments, handlePaste, addFiles, removeAttachment, clearAttachments } = useImagePaste()

  // Expose addFiles and setInput via window events so parent drag-and-drop can use them
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail.imageFiles && detail.imageFiles.length > 0) {
        addFiles(detail.imageFiles)
      }
      if (detail.atPaths) {
        setInput(prev => {
          const sep = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
          return prev + sep + detail.atPaths
        })
        setTimeout(() => textareaRef.current?.focus(), 0)
      }
    }
    window.addEventListener('aipa:dropFiles', handler)
    return () => window.removeEventListener('aipa:dropFiles', handler)
  }, [addFiles])

  // Auto-save draft input to sessionStorage
  useEffect(() => {
    try {
      if (input) {
        sessionStorage.setItem('aipa:draft-input', input)
      } else {
        sessionStorage.removeItem('aipa:draft-input')
      }
    } catch { /* sessionStorage may not be available */ }
  }, [input])

  // Handle quote reply: prepend quoted text to input
  useEffect(() => {
    if (!quotedText) return
    const lines = quotedText.split('\n').map((l: string) => `> ${l}`).join('\n')
    setInput((prev: string) => {
      const separator = prev.trim() ? '\n\n' : ''
      return `${lines}${separator}${prev}`
    })
    setQuotedText(null)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [quotedText, setQuotedText])

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Listen for focus request from global shortcut (Ctrl+L)
  useEffect(() => {
    const handler = () => textareaRef.current?.focus()
    window.addEventListener('aipa:focusInput', handler)
    return () => window.removeEventListener('aipa:focusInput', handler)
  }, [])

  const handleSend = async () => {
    const text = input.trim()
    if (!text && attachments.length === 0 || isStreaming) return
    if (text) {
      inputHistoryRef.current = [text, ...inputHistoryRef.current.filter(h => h !== text)].slice(0, 50)
      historyIdxRef.current = -1
      try { localStorage.setItem('aipa:input-history', JSON.stringify(inputHistoryRef.current)) } catch { /* ignore */ }
    }
    setInput('')
    setAtQuery(null)
    clearAttachments()
    resizeTextarea()
    try { sessionStorage.removeItem('aipa:draft-input') } catch { /* ignore */ }
    await onSend(text || 'Describe this image', attachments.length > 0 ? attachments : undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      return
    }
    if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      return
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && atQuery === null && slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0 && inputHistoryRef.current.length > 0) {
        e.preventDefault()
        if (historyIdxRef.current === -1) {
          tempInputRef.current = input
        }
        const nextIdx = Math.min(historyIdxRef.current + 1, inputHistoryRef.current.length - 1)
        historyIdxRef.current = nextIdx
        setInput(inputHistoryRef.current[nextIdx])
      }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && atQuery === null && slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === input.length && historyIdxRef.current >= 0) {
        e.preventDefault()
        const nextIdx = historyIdxRef.current - 1
        historyIdxRef.current = nextIdx
        setInput(nextIdx >= 0 ? inputHistoryRef.current[nextIdx] : tempInputRef.current)
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@([^\s]*)$/)
    if (atMatch) {
      setAtQuery(atMatch[1])
    } else {
      setAtQuery(null)
    }

    const slashMatch = textBefore.match(/(?:^|\s)(\/[^\s]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1].slice(1))
      setSlashIndex(0)
      setAtQuery(null)
    } else if (!atMatch) {
      setSlashQuery(null)
    }
  }

  const handleAtSelect = (filePath: string) => {
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

  const handleSlashSelect = async (cmd: SlashCommand) => {
    setSlashQuery(null)
    setInput('')
    if (cmd.clientOnly) {
      if (cmd.name === '/clear') {
        onNewConversation()
      } else if (cmd.name === '/help') {
        useChatStore.getState().addMessage({
          id: `help-${Date.now()}`,
          role: 'assistant',
          content: `**${t('command.availableCommands')}:**\n\n` + SLASH_COMMANDS.map(c => `- \`${c.name}\` — ${c.description}`).join('\n'),
          timestamp: Date.now(),
        } as any)
      }
      return
    }
    const isBuiltin = SLASH_COMMANDS.some(c => c.name === cmd.name)
    if (isBuiltin) {
      await onSend(cmd.name)
    } else {
      setInput(cmd.name + ' ')
      textareaRef.current?.focus()
    }
  }

  // Load custom slash commands once when popup opens
  const slashPopupOpen = slashQuery !== null
  useEffect(() => {
    if (!slashPopupOpen) return
    window.electronAPI.fsListCommands(prefs.workingDir || '').then((cmds: { name: string; description: string; source: string }[]) => {
      setCustomCommands(cmds.map(c => ({
        name: c.name,
        description: c.description + (c.source === 'project' ? ' [Project]' : ' [User]'),
      })))
    }).catch(() => {})
  }, [slashPopupOpen, prefs.workingDir])

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
    recognition.lang = navigator.language || 'en-US'
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

  // Clipboard action handler
  const handleClipboardAction = async (actionId: string) => {
    setShowClipboardMenu(false)
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) {
        addToast({ type: 'info' as any, message: t('clipboard.emptyClipboard') })
        return
      }
      const action = CLIPBOARD_ACTIONS.find(a => a.id === actionId)
      if (!action) return
      let prompt: string
      if (actionId === 'translate') {
        const lang = prefs.language === 'zh-CN' ? 'templateZh' : 'templateEn'
        prompt = ((action as any)[lang] || action.template || '').replace('{text}', text.trim())
      } else {
        prompt = (action as any).template.replace('{text}', text.trim())
      }
      if (prompt) {
        await onSend(prompt)
      }
    } catch {
      addToast({ type: 'error' as any, message: t('clipboard.clipboardError') })
    }
  }

  // Close clipboard menu on click outside
  useEffect(() => {
    if (!showClipboardMenu) return
    const handler = (e: MouseEvent) => {
      if (clipboardMenuRef.current && !clipboardMenuRef.current.contains(e.target as Node)) {
        setShowClipboardMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showClipboardMenu])

  // Slash command keyboard navigation
  useEffect(() => {
    if (slashQuery === null) return
    const filtered = SLASH_COMMANDS.filter(c => !slashQuery || c.name.toLowerCase().includes(slashQuery.toLowerCase()))
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[slashIndex]) handleSlashSelect(filtered[slashIndex]) }
      else if (e.key === 'Escape') { setSlashQuery(null) }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [slashQuery, slashIndex])

  // Keyboard shortcut: Ctrl+Shift+Q to add to queue
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
        e.preventDefault()
        const currentInput = input.trim()
        if (currentInput) {
          addToQueue(currentInput)
          setInput('')
          resizeTextarea()
          try { sessionStorage.removeItem('aipa:draft-input') } catch { /* ignore */ }
          textareaRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [input, addToQueue, resizeTextarea])

  return (
    <div
      style={{
        padding: '8px 16px 12px',
        background: 'var(--input-bar-bg)',
        flexShrink: 0,
      }}
    >
      {/* Toolbar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6, paddingLeft: 4 }}>
        <button
          onClick={() => {
            setInput(prev => prev + '@')
            setAtQuery('')
            textareaRef.current?.focus()
          }}
          title={t('toolbar.insertMention')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--input-toolbar-icon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'color 150ms, background 150ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <AtSign size={16} />
        </button>
        <button
          onClick={() => {
            setInput('/')
            setSlashQuery('')
            setSlashIndex(0)
            textareaRef.current?.focus()
          }}
          title={t('toolbar.insertSlashCommand')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--input-toolbar-icon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'color 150ms, background 150ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <TerminalSquare size={16} />
        </button>
        <button
          onClick={toggleSpeech}
          title={listening ? t('toolbar.stopRecording') : t('toolbar.voiceInput')}
          style={{
            background: listening ? 'var(--error)' : 'none',
            border: 'none',
            color: listening ? '#fff' : 'var(--input-toolbar-icon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'color 150ms, background 150ms',
          }}
          onMouseEnter={(e) => { if (!listening) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' } }}
          onMouseLeave={(e) => { if (!listening) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' } }}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        {/* Clipboard actions dropdown */}
        <div ref={clipboardMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onClick={() => setShowClipboardMenu(v => !v)}
            title={t('clipboard.pasteAndAsk')}
            style={{
              background: showClipboardMenu ? 'rgba(255,255,255,0.06)' : 'none',
              border: 'none',
              color: showClipboardMenu ? 'var(--input-toolbar-hover)' : 'var(--input-toolbar-icon)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              flexShrink: 0,
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={(e) => { if (!showClipboardMenu) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' } }}
            onMouseLeave={(e) => { if (!showClipboardMenu) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--input-toolbar-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' } }}
          >
            <ClipboardPaste size={16} />
          </button>
          {showClipboardMenu && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              background: 'var(--popup-bg)',
              border: '1px solid var(--popup-border)',
              borderRadius: 10,
              boxShadow: 'var(--popup-shadow)',
              padding: '4px 0',
              minWidth: 180,
              zIndex: 100,
              animation: 'popup-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.02em' }}>
                {t('clipboard.pasteAndAsk')}
              </div>
              {CLIPBOARD_ACTIONS.map(({ id, icon: Icon, labelKey }) => (
                <button
                  key={id}
                  onClick={() => handleClipboardAction(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 13,
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                >
                  <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span>{t(labelKey)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span style={{ flex: 1 }} />
        {/* Queue button */}
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onClick={() => {
              const text = input.trim()
              if (!text) return
              addToQueue(text)
              setInput('')
              resizeTextarea()
              try { sessionStorage.removeItem('aipa:draft-input') } catch { /* ignore */ }
              textareaRef.current?.focus()
            }}
            disabled={!input.trim()}
            aria-label={t('taskQueue.addToQueue')}
            title={t('taskQueue.addToQueueShortcut')}
            style={{
              background: 'none',
              border: 'none',
              color: taskQueue.length > 0 ? '#a78bfa' : 'var(--input-toolbar-icon)',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              flexShrink: 0,
              opacity: input.trim() ? 1 : 0.4,
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={(e) => {
              if (input.trim()) {
                (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 92, 246, 0.10)'
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = taskQueue.length > 0 ? '#a78bfa' : 'var(--input-toolbar-icon)';
              (e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <ListPlus size={16} />
          </button>
          {taskQueue.length > 0 && (
            <span style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 14,
              height: 14,
              background: '#8b5cf6',
              color: '#ffffff',
              fontSize: 9,
              fontWeight: 600,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              {taskQueue.length > 9 ? '9+' : taskQueue.length}
            </span>
          )}
        </div>
      </div>
      {/* Quick reply chips */}
      <QuickReplyChips onInsert={(prompt) => {
        setInput(prev => {
          const sep = prev.trim() ? '\n' : ''
          return prev + sep + prompt
        })
        setTimeout(() => {
          textareaRef.current?.focus()
          const ta = textareaRef.current
          if (ta) {
            ta.selectionStart = ta.value.length
            ta.selectionEnd = ta.value.length
          }
        }, 0)
      }} />
      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div
          ref={inputWrapRef}
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            background: 'var(--input-field-bg)',
            borderRadius: 10,
            padding: '8px 14px',
            border: '1px solid var(--input-field-border)',
            transition: 'border-color 200ms',
          }}
        >
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
              {attachments.map(img => (
                <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--input-field-border)' }}
                  />
                  <button
                    onClick={() => removeAttachment(img.id)}
                    style={{
                      position: 'absolute', top: -4, right: -4,
                      width: 16, height: 16, borderRadius: '50%',
                      background: 'var(--error)', border: 'none',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, lineHeight: '1',
                    }}
                  >{'\u00d7'}</button>
                </div>
              ))}
            </div>
          )}
          {atQuery !== null && (
            <AtMentionPopup
              query={atQuery}
              onSelect={handleAtSelect}
              onDismiss={() => setAtQuery(null)}
              anchorRef={inputWrapRef as React.RefObject<HTMLElement>}
            />
          )}
          {slashQuery !== null && (
            <SlashCommandPopup
              query={slashQuery}
              onSelect={handleSlashSelect}
              onDismiss={() => setSlashQuery(null)}
              selectedIndex={slashIndex}
              onHover={setSlashIndex}
              extraCommands={customCommands}
            />
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragOver={(e) => e.preventDefault()}
            onFocus={() => {
              if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-focus)'
            }}
            onBlur={() => {
              if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-border)'
            }}
            placeholder={t(PLACEHOLDER_KEYS[placeholderIdx])}
            aria-label={t('chat.placeholder')}
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
        </div>
        <button
          onClick={isStreaming ? onAbort : handleSend}
          disabled={!isStreaming && !input.trim() && attachments.length === 0}
          title={isStreaming ? t('chat.stopGenerating') : t('chat.sendEnter')}
          style={{
            background: isStreaming ? 'var(--error)' : 'var(--accent)',
            border: 'none',
            borderRadius: 10,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: isStreaming || input.trim() || attachments.length > 0 ? 'pointer' : 'not-allowed',
            opacity: !isStreaming && !input.trim() && attachments.length === 0 ? 0.4 : 1,
            flexShrink: 0,
            transition: 'background 150ms, opacity 150ms',
            alignSelf: 'flex-end',
          }}
        >
          {isStreaming ? <Square size={14} /> : <Send size={14} />}
        </button>
      </div>
      {/* Compose status: word/char/token count */}
      {input.trim().length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          padding: '3px 4px 0',
          fontSize: 10,
          color: input.length > 10000
            ? 'var(--error)'
            : input.length > 5000
            ? 'var(--warning)'
            : 'var(--text-muted)',
          fontWeight: input.length > 10000 ? 600 : 400,
          opacity: 0.7,
          transition: 'color 200ms, opacity 200ms',
        }}>
          <span>{input.trim().split(/\s+/).filter(w => w.length > 0).length} {t('chat.words')}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>{input.length.toLocaleString()} {t('chat.chars')}{input.length > 10000 ? ` (${t('chat.veryLong')})` : input.length > 5000 ? ` (${t('chat.long')})` : ''}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>~{Math.ceil(input.length / 4)} tokens</span>
        </div>
      )}
    </div>
  )
}
