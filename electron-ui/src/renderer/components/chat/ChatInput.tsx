// ChatInput — thin orchestrator after Iteration 314 decomposition
// Sub-modules: ChatInputAttachments, ChatInputPasteChips, ChatInputComposeStatus

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Sparkles, Archive } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import AtMentionPopup from './AtMentionPopup'
import SlashCommandPopup from './SlashCommandPopup'
import QuickReplyChips from './QuickReplyChips'
import InputToolbar from './InputToolbar'
import ChatInputAttachments from './ChatInputAttachments'
import ChatInputPasteChips from './ChatInputPasteChips'
import ChatInputComposeStatus from './ChatInputComposeStatus'
import { PLACEHOLDER_KEYS } from './chatInputConstants'
import { useImagePaste, ImageAttachment, FileAttachment } from '../../hooks/useImagePaste'
import { useChatInputDraft } from '../../hooks/useChatInputDraft'
import { useChatInputHistory } from '../../hooks/useChatInputHistory'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { useTypingWpm } from './useTypingWpm'
import { useInputPopups } from './useInputPopups'
import { useInputCompletion } from './useInputCompletion'
import { usePasteDetection } from './usePasteDetection'
import { usePromptSuggestion } from '../../hooks/usePromptSuggestion'
import { useT } from '../../i18n'

interface ChatInputProps {
  isStreaming: boolean
  sessionId: string | null
  onSend: (text: string, attachments?: ImageAttachment[], fileAttachments?: FileAttachment[]) => Promise<void>
  onAbort: () => void
  onNewConversation: () => void
}

export default function ChatInput({
  isStreaming,
  sessionId,
  onSend,
  onAbort,
  onNewConversation,
}: ChatInputProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const addToast = useUiStore(s => s.addToast)
  const addToQueue = useChatStore(s => s.addToQueue)
  const lastContextUsage = useChatStore(s => s.lastContextUsage)

  // Draft persistence (per-session)
  const { input, setInput, clearDraft } = useChatInputDraft({
    sessionId,
    onDraftRestored: () => addToast('info', t('chat.draftRestored')),
  })

  // Input history navigation
  const { inputHistoryRef, addToHistory, navigateUp, navigateDown } = useChatInputHistory()

  // Speech recognition
  const { listening, toggleSpeech } = useSpeechRecognition((transcript) => {
    setInput(prev => prev + transcript)
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  // Typing WPM tracking
  const { typingWpm, keystrokeTimestamps } = useTypingWpm()

  // Image/file attachments
  const { attachments, fileAttachments, handlePaste, addFiles, addFileAttachments, removeAttachment, removeFileAttachment, clearAttachments } = useImagePaste()

  // Input popups (@mention, /slash, ::snippet)
  const popups = useInputPopups({
    input,
    setInput,
    textareaRef,
    onSend,
    onNewConversation,
  })

  // Ghost text autocomplete + inline calculator
  const { suggestion, dismissSuggestion } = usePromptSuggestion(input, isStreaming)
  const { ghostText, calcResult } = useInputCompletion(input, popups.slashQuery, popups.atQuery, suggestion)

  // Paste detection (URL, long text, quote)
  const paste = usePasteDetection({
    setInput,
    textareaRef,
    handleImagePaste: handlePaste,
  })

  // Rotating placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  useEffect(() => {
    if (input.length > 0) return
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_KEYS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [input])

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

  // Textarea auto-resize
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [])

  useEffect(() => { resizeTextarea() }, [input, resizeTextarea])

  // Focus input on mount
  useEffect(() => { textareaRef.current?.focus() }, [])

  // Listen for focus request from global shortcut (Ctrl+L)
  useEffect(() => {
    const handler = () => textareaRef.current?.focus()
    window.addEventListener('aipa:focusInput', handler)
    return () => window.removeEventListener('aipa:focusInput', handler)
  }, [])

  // Listen for text insertion requests (e.g., from file browser @mention)
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail as string
      if (text) {
        setInput(prev => prev + text)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('aipa:insertText', handler)
    return () => window.removeEventListener('aipa:insertText', handler)
  }, [])

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
          clearDraft()
          textareaRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [input, addToQueue, resizeTextarea])

  // --- Core handlers ---

  const handleSend = async () => {
    const text = input.trim()
    if (!text && attachments.length === 0 && fileAttachments.length === 0 || isStreaming) return
    let finalText = text || (attachments.length > 0 ? t('chat.describeImage') : t('chat.analyzeFiles'))
    if (paste.pendingQuote) {
      const quotedLines = paste.pendingQuote.split('\n').map((l: string) => `> ${l}`).join('\n')
      finalText = quotedLines + '\n\n' + finalText
      paste.setPendingQuote(null)
    }
    // Inject file contents as context into the prompt
    if (fileAttachments.length > 0) {
      const fileContextParts: string[] = []
      for (const file of fileAttachments) {
        if (file.content) {
          const truncated = file.content.length > 50000 ? file.content.slice(0, 50000) + '\n... (truncated)' : file.content
          fileContextParts.push(`<file path="${file.path}" name="${file.name}">\n${truncated}\n</file>`)
        } else {
          fileContextParts.push(`<file path="${file.path}" name="${file.name}">(binary file, content not shown)</file>`)
        }
      }
      finalText = fileContextParts.join('\n\n') + '\n\n' + finalText
    }
    if (text) addToHistory(text)
    setInput('')
    popups.setAtQuery(null)
    paste.setPastedUrl(null)
    paste.setPastedLongText(false)
    clearAttachments()
    resizeTextarea()
    clearDraft()
    await onSend(finalText, attachments.length > 0 ? attachments : undefined, fileAttachments.length > 0 ? fileAttachments : undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popups.atQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) return
    if (popups.slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) return
    // Snippet popup keyboard navigation
    if (popups.snippetQuery !== null && popups.filteredSnippets.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); popups.setSnippetIndex(i => Math.min(i + 1, popups.filteredSnippets.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); popups.setSnippetIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); popups.handleSnippetSelect(popups.filteredSnippets[popups.snippetIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); popups.setSnippetQuery(null); return }
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && popups.atQuery === null && popups.slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        const result = navigateUp(input, true)
        if (result !== null) { e.preventDefault(); setInput(result) }
      }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && popups.atQuery === null && popups.slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === input.length) {
        const result = navigateDown(true)
        if (result !== null) { e.preventDefault(); setInput(result) }
      }
    }
    // Tab: accept ghost text autocomplete, or accept calculator result
    if (e.key === 'Tab' && !e.shiftKey && ghostText) {
      e.preventDefault()
      if (input.trim()) {
        setInput(prev => prev.trimStart() + ghostText)
      } else {
        setInput(ghostText)
      }
      dismissSuggestion()
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && calcResult) {
      e.preventDefault()
      setInput(calcResult)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape' && input.trim().length > 0) { e.preventDefault(); setInput(''); resizeTextarea(); return }
    if (e.key === 'Escape' && ghostText && !input.trim()) { e.preventDefault(); dismissSuggestion(); return }
    if (e.ctrlKey && !e.shiftKey && e.key === 'u') { e.preventDefault(); setInput('') }
    // Markdown formatting shortcuts
    if (e.ctrlKey && !e.shiftKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = input.substring(start, end)
      const wrapper = e.key === 'b' ? '**' : '*'
      if (selected) {
        const newText = input.substring(0, start) + wrapper + selected + wrapper + input.substring(end)
        setInput(newText)
        setTimeout(() => {
          ta.selectionStart = start + wrapper.length
          ta.selectionEnd = end + wrapper.length
        }, 0)
      } else {
        const newText = input.substring(0, start) + wrapper + wrapper + input.substring(end)
        setInput(newText)
        setTimeout(() => {
          ta.selectionStart = start + wrapper.length
          ta.selectionEnd = start + wrapper.length
        }, 0)
      }
      return
    }
    // Ctrl+Shift+U: Cycle text case (UPPER -> lower -> Title -> original)
    if (e.ctrlKey && e.shiftKey && e.key === 'U') {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = input.substring(start, end)
      if (!selected) return
      let transformed: string
      if (selected === selected.toUpperCase() && selected !== selected.toLowerCase()) {
        transformed = selected.toLowerCase()
      } else if (selected === selected.toLowerCase() && selected !== selected.toUpperCase()) {
        transformed = selected.replace(/\b\w/g, c => c.toUpperCase())
      } else {
        transformed = selected.toUpperCase()
      }
      const newText = input.substring(0, start) + transformed + input.substring(end)
      setInput(newText)
      setTimeout(() => {
        ta.selectionStart = start
        ta.selectionEnd = start + transformed.length
      }, 0)
      return
    }
    // Escape: dismiss URL chips, long text chips, then quote preview
    if (e.key === 'Escape' && popups.atQuery === null && popups.slashQuery === null) {
      if (paste.pastedUrl) { e.preventDefault(); paste.setPastedUrl(null); if (paste.urlChipTimerRef.current) clearTimeout(paste.urlChipTimerRef.current); return }
      if (paste.pastedLongText) { e.preventDefault(); paste.setPastedLongText(false); if (paste.longTextTimerRef.current) clearTimeout(paste.longTextTimerRef.current); return }
      if (paste.pendingQuote) { e.preventDefault(); paste.setPendingQuote(null); return }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    // Track keystrokes for WPM calculation
    if (val.length > input.length) {
      const now = Date.now()
      for (let i = 0; i < val.length - input.length; i++) {
        keystrokeTimestamps.current.push(now)
      }
    }
    setInput(val)
    const cursor = e.target.selectionStart
    popups.parsePopupTriggers(val, cursor)
  }

  // Active persona indicator
  const personas = prefs.personas || []
  const activePersona = prefs.activePersonaId ? personas.find(p => p.id === prefs.activePersonaId) : undefined

  return (
    <div style={{ padding: '8px 16px 12px', background: 'var(--input-bar-bg)', flexShrink: 0 }}>
      {/* Toolbar row */}
      <InputToolbar
        listening={listening}
        toggleSpeech={toggleSpeech}
        onAtClick={() => { setInput(prev => prev + '@'); popups.setAtQuery(''); textareaRef.current?.focus() }}
        onSlashClick={() => { setInput('/'); popups.setSlashQuery(''); popups.setSlashIndex(0); textareaRef.current?.focus() }}
        onQueueClick={() => {
          const text = input.trim()
          if (!text) return
          addToQueue(text)
          setInput('')
          resizeTextarea()
          clearDraft()
          textareaRef.current?.focus()
        }}
        onSend={onSend}
        onAttachFiles={async () => {
          const paths = await window.electronAPI.fsShowOpenFileDialog(
            [{ name: t('toolbar.allFiles'), extensions: ['*'] }],
            true
          )
          if (paths && paths.length > 0) {
            await addFileAttachments(paths)
          }
          textareaRef.current?.focus()
        }}
        fileAttachmentCount={fileAttachments.length}
        hasInput={!!input.trim()}
        inputText={input}
      />
      {/* Context usage meter with compact button */}
      {lastContextUsage && lastContextUsage.total > 0 && (() => {
        const pct = Math.round((lastContextUsage.used / lastContextUsage.total) * 100)
        if (pct < 40) return null
        const barColor = pct >= 85 ? 'var(--error)' : pct >= 70 ? '#f97316' : pct >= 55 ? 'var(--warning)' : 'var(--accent)'
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', marginBottom: 4,
          }}>
            <div style={{
              flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor,
                borderRadius: 2, transition: 'width 300ms ease, background 300ms ease',
              }} />
            </div>
            <span style={{ fontSize: 9, color: barColor, fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {pct}%
            </span>
            {pct >= 60 && !isStreaming && (
              <button
                onClick={() => onSend('/compact')}
                title={t('chat.compactHint')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '1px 6px', fontSize: 9, fontWeight: 500,
                  background: 'rgba(0, 122, 204, 0.08)', border: '1px solid rgba(0, 122, 204, 0.2)',
                  borderRadius: 8, color: 'var(--accent)', cursor: 'pointer',
                  transition: 'background 150ms, border-color 150ms', whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.15)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.08)'; e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.2)' }}
              >
                <Archive size={9} />
                {t('chat.compactBtn')}
              </button>
            )}
          </div>
        )
      })()}
      {/* Quick reply chips */}
      <QuickReplyChips onInsert={(prompt) => {
        setInput(prev => {
          const sep = prev.trim() ? '\n' : ''
          return prev + sep + prompt
        })
        setTimeout(() => {
          textareaRef.current?.focus()
          const ta = textareaRef.current
          if (ta) { ta.selectionStart = ta.value.length; ta.selectionEnd = ta.value.length }
        }, 0)
      }} />
      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div
          ref={inputWrapRef}
          style={{
            flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', gap: 0,
            background: 'var(--input-field-bg)', borderRadius: 10, padding: '8px 14px',
            border: '1px solid var(--input-field-border)', transition: 'border-color 200ms',
          }}
        >
          {/* Active persona indicator */}
          {activePersona && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginBottom: 4, fontSize: 11, color: activePersona.color, opacity: 0.8 }}>
              <Sparkles size={10} />
              <span style={{ fontWeight: 500 }}>{activePersona.emoji} {activePersona.name}</span>
            </div>
          )}
          {/* Attachments (images + files) */}
          <ChatInputAttachments
            attachments={attachments}
            fileAttachments={fileAttachments}
            onRemoveImage={removeAttachment}
            onRemoveFile={removeFileAttachment}
          />
          {/* Paste action chips + quote preview */}
          <ChatInputPasteChips paste={paste} inputLength={input.length} />
          {/* Popups */}
          {popups.atQuery !== null && <AtMentionPopup query={popups.atQuery} onSelect={popups.handleAtSelect} onDismiss={() => popups.setAtQuery(null)} anchorRef={inputWrapRef as React.RefObject<HTMLElement>} />}
          {popups.slashQuery !== null && <SlashCommandPopup query={popups.slashQuery} onSelect={popups.handleSlashSelect} onDismiss={() => popups.setSlashQuery(null)} selectedIndex={popups.slashIndex} onHover={popups.setSlashIndex} extraCommands={popups.customCommands} />}
          {/* Text snippet popup */}
          {popups.snippetQuery !== null && popups.filteredSnippets.length > 0 && (
            <div
              className="popup-enter"
              style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
                width: 320, maxHeight: 240, overflowY: 'auto',
                background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
                borderRadius: 8, boxShadow: 'var(--popup-shadow)', padding: '4px 0', zIndex: 50,
              }}
            >
              <div style={{ padding: '4px 10px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
                {t('snippet.title')}
              </div>
              {popups.filteredSnippets.map((snippet, idx) => (
                <button
                  key={snippet.id}
                  onClick={() => popups.handleSnippetSelect(snippet)}
                  onMouseEnter={() => popups.setSnippetIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 10px',
                    background: idx === popups.snippetIndex ? 'var(--popup-item-hover)' : 'transparent',
                    border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', borderRadius: 0,
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                    fontFamily: 'monospace', flexShrink: 0, minWidth: 48,
                  }}>
                    ::{snippet.keyword}
                  </span>
                  <span style={{
                    fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    lineHeight: 1.4, opacity: 0.8,
                  }}>
                    {snippet.content.length > 80 ? snippet.content.slice(0, 80) + '...' : snippet.content}
                  </span>
                </button>
              ))}
            </div>
          )}
          {/* Textarea */}
          <div style={{ position: 'relative', flex: 1 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={paste.handleTextPaste}
              onDragOver={(e) => e.preventDefault()}
              onFocus={() => { if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-focus)' }}
              onBlur={() => { if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-border)' }}
              placeholder={t(PLACEHOLDER_KEYS[placeholderIdx])}
              aria-label={t('chat.placeholder')}
              rows={1}
              style={{ flex: 1, width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', resize: 'none', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, minHeight: 20, maxHeight: 160, overflow: 'auto' }}
            />
            {/* Ghost text autocomplete overlay */}
            {ghostText && (input.trimStart().length >= 3 || !input.trim()) && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none',
                  fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word', color: 'transparent', overflow: 'hidden', maxHeight: 160,
                  opacity: input.trim() ? 1 : 0.45,
                  fontStyle: input.trim() ? 'normal' : 'italic',
                  transition: 'opacity 0.3s ease-in',
                }}
              >
                {input.trim() ? (
                  <>
                    <span style={{ visibility: 'hidden' }}>{input}</span>
                    <span style={{ color: 'var(--text-muted)', opacity: 0.45 }}>{ghostText}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.35, marginLeft: 4 }}>Tab</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--text-secondary)' }}>{ghostText}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, marginLeft: 6 }}>Tab</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Send / Stop button with progress ring */}
        <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-end' }}>
          {/* Progress ring (only when input has content and not streaming) */}
          {!isStreaming && input.length > 0 && (
            <svg
              width={44}
              height={44}
              style={{
                position: 'absolute', top: -4, left: -4,
                transform: 'rotate(-90deg)', pointerEvents: 'none',
              }}
            >
              <circle
                cx={22}
                cy={22}
                r={20}
                fill="none"
                stroke={
                  input.length > 10000 ? 'var(--error)'
                    : input.length > 8000 ? '#f97316'
                    : input.length > 5000 ? 'var(--warning)'
                    : 'var(--accent)'
                }
                strokeWidth={2}
                strokeDasharray={2 * Math.PI * 20}
                strokeDashoffset={2 * Math.PI * 20 * (1 - Math.min(input.length / 12000, 1))}
                strokeLinecap="round"
                opacity={0.6}
                style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease' }}
              />
            </svg>
          )}
          <button
            onClick={isStreaming ? onAbort : handleSend}
            disabled={!isStreaming && !input.trim() && attachments.length === 0 && fileAttachments.length === 0}
            title={isStreaming ? t('chat.stopGenerating') : t('chat.sendEnter')}
            style={{
              background: isStreaming ? 'var(--error)' : 'var(--accent)', border: 'none', borderRadius: 10, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              cursor: isStreaming || input.trim() || attachments.length > 0 || fileAttachments.length > 0 ? 'pointer' : 'not-allowed',
              opacity: !isStreaming && !input.trim() && attachments.length === 0 && fileAttachments.length === 0 ? 0.4 : 1,
              flexShrink: 0, transition: 'background 150ms, opacity 150ms', position: 'relative',
            }}
          >
            {isStreaming ? <Square size={14} /> : <Send size={14} />}
            {!isStreaming && (
              <span style={{ position: 'absolute', bottom: -14, fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>Enter</span>
            )}
          </button>
        </div>
      </div>
      {/* Compose status + calculator + history hint */}
      <ChatInputComposeStatus
        input={input}
        typingWpm={typingWpm}
        calcResult={calcResult}
        hasInputHistory={inputHistoryRef.current.length > 0}
      />
    </div>
  )
}
