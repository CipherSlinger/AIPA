// ChatInput — thin orchestrator after Iteration 432 decomposition
// Sub-modules: ChatInputAttachments, ChatInputPasteChips, ChatInputComposeStatus,
//              ChatInputSendButton, useChatInputKeyboard

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Archive } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import AtMentionPopup from './AtMentionPopup'
import NotePopup from './NotePopup'
import SlashCommandPopup from './SlashCommandPopup'
import QuickReplyChips from './QuickReplyChips'
import InputToolbar from './InputToolbar'
import ChatInputAttachments from './ChatInputAttachments'
import ChatInputPasteChips from './ChatInputPasteChips'
import ChatInputComposeStatus from './ChatInputComposeStatus'
import ChatInputSendButton from './ChatInputSendButton'
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
import { useChatInputKeyboard } from './useChatInputKeyboard'
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

  // Speech recognition (with auto-stop callback)
  const handleAutoStop = useCallback(() => {
    addToast('info', t('voice.autoStopped'))
  }, [addToast, t])

  const { listening, recordingSeconds, toggleSpeech } = useSpeechRecognition((transcript) => {
    setInput(prev => prev + transcript)
  }, handleAutoStop)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  // Multi-line mode: Enter adds newline, Ctrl+Enter sends (Iteration 418)
  const [multiLineMode, setMultiLineMode] = useState(() => {
    try { return localStorage.getItem('aipa:multi-line-mode') === 'true' } catch { return false }
  })
  const toggleMultiLine = useCallback(() => {
    setMultiLineMode(prev => {
      const next = !prev
      try { localStorage.setItem('aipa:multi-line-mode', String(next)) } catch { /* ignore */ }
      addToast('info', next ? t('input.multiLineOn') : t('input.multiLineOff'))
      return next
    })
  }, [addToast, t])

  // Text drag-and-drop state (Iteration 431)
  const [textDragOver, setTextDragOver] = useState(false)

  // Typing WPM tracking
  const { typingWpm, keystrokeTimestamps } = useTypingWpm()

  // Image/file attachments
  const { attachments, fileAttachments, handlePaste, addFiles, addFileAttachments, addImageAttachment, removeAttachment, removeFileAttachment, clearAttachments } = useImagePaste()

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
  const { ghostText, calcResult } = useInputCompletion(input, popups.slashQuery, popups.atQuery ?? popups.noteQuery, suggestion)

  // Paste detection (URL, long text, quote)
  const paste = usePasteDetection({
    setInput,
    textareaRef,
    handleImagePaste: handlePaste,
  })

  // Screenshot capture
  const handleScreenshot = useCallback(async () => {
    try {
      const dataUrl = await window.electronAPI.windowCaptureScreen()
      if (!dataUrl) {
        addToast('warning', t('toolbar.screenshotFailed'))
        return
      }
      addImageAttachment(`screenshot-${Date.now()}.png`, dataUrl, 'image/png')
      addToast('success', t('toolbar.screenshotAdded'))
      textareaRef.current?.focus()
    } catch {
      addToast('warning', t('toolbar.screenshotFailed'))
    }
  }, [addImageAttachment, addToast, t])

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
    popups.setNoteQuery(null)
    paste.setPastedUrl(null)
    paste.setPastedLongText(false)
    clearAttachments()
    resizeTextarea()
    clearDraft()
    await onSend(finalText, attachments.length > 0 ? attachments : undefined, fileAttachments.length > 0 ? fileAttachments : undefined)
  }

  // Keyboard handler (extracted to useChatInputKeyboard hook)
  const handleKeyDown = useChatInputKeyboard({
    input, setInput, textareaRef, popups, paste,
    ghostText, calcResult, dismissSuggestion,
    multiLineMode, navigateUp, navigateDown,
    handleSend, resizeTextarea,
  })

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

  // Active persona indicator (per-session, Iteration 407)
  const personas = prefs.personas || []
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const effectivePersonaId = sessionPersonaId || prefs.activePersonaId
  const activePersona = effectivePersonaId ? personas.find(p => p.id === effectivePersonaId) : undefined

  const hasContent = !!input.trim() || attachments.length > 0 || fileAttachments.length > 0

  return (
    <div style={{ padding: '8px 16px 12px', background: 'var(--input-bar-bg)', flexShrink: 0 }}>
      {/* Toolbar row */}
      <InputToolbar
        listening={listening}
        recordingSeconds={recordingSeconds}
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
        onScreenshot={handleScreenshot}
        fileAttachmentCount={fileAttachments.length}
        hasInput={!!input.trim()}
        inputText={input}
        multiLineMode={multiLineMode}
        onToggleMultiLine={toggleMultiLine}
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
          <ChatInputPasteChips paste={{ ...paste, onWrapAsBlock: input.length > 500 ? () => { setInput(prev => '```\n' + prev + '\n```'); paste.setPastedLongText(false) } : undefined }} inputLength={input.length} />
          {/* Popups */}
          {popups.atQuery !== null && <AtMentionPopup query={popups.atQuery} onSelect={popups.handleAtSelect} onDismiss={() => popups.setAtQuery(null)} anchorRef={inputWrapRef as React.RefObject<HTMLElement>} />}
          {popups.noteQuery !== null && <NotePopup query={popups.noteQuery} notes={popups.filteredNotes} categories={popups.noteCategories} selectedIndex={popups.noteIndex} onSelect={popups.handleNoteSelect} onDismiss={() => popups.setNoteQuery(null)} onHover={popups.setNoteIndex} />}
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
            {/* Text drop zone indicator (Iteration 431) */}
            {textDragOver && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0, 122, 204, 0.06)', border: '2px dashed var(--accent)',
                borderRadius: 8, pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                  {t('input.dropTextHere')}
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={paste.handleTextPaste}
              onDragOver={(e) => {
                e.preventDefault()
                if (e.dataTransfer.types.includes('text/plain')) {
                  setTextDragOver(true)
                }
              }}
              onDragLeave={() => setTextDragOver(false)}
              onDrop={(e) => {
                setTextDragOver(false)
                const droppedText = e.dataTransfer.getData('text/plain')
                if (droppedText && droppedText.trim()) {
                  e.preventDefault()
                  const trimmed = droppedText.trim()
                  setInput(prev => {
                    const sep = prev.length > 0 && !prev.endsWith('\n') ? '\n' : ''
                    return prev + sep + trimmed
                  })
                  if (trimmed.length > 500) {
                    setTimeout(() => { paste.setPastedLongText(true) }, 50)
                  }
                  setTimeout(() => textareaRef.current?.focus(), 0)
                }
              }}
              onFocus={() => { if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-focus)' }}
              onBlur={() => { setTextDragOver(false); if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-border)' }}
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
          {/* Character & word counter -- visible when input > 50 chars (Iteration 431) */}
          {input.length > 50 && (() => {
            const wordCount = input.trim().split(/\s+/).filter(Boolean).length
            return (
            <div style={{
              display: 'flex', justifyContent: 'flex-end',
              padding: '2px 0 0',
            }}>
              <span style={{
                fontSize: 10,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                color: input.length >= 50000
                  ? 'var(--error, #d9534f)'
                  : input.length >= 10000
                  ? 'var(--warning, #f0ad4e)'
                  : 'var(--text-muted)',
                opacity: input.length >= 10000 ? 1 : 0.6,
                transition: 'color 200ms ease',
                userSelect: 'none',
              }}>
                {wordCount} {t('chat.words')} | {input.length.toLocaleString()} {t('chat.chars')}
              </span>
            </div>
            )
          })()}
        </div>
        {/* Send / Stop button with progress ring */}
        <ChatInputSendButton
          isStreaming={isStreaming}
          inputLength={input.length}
          hasContent={hasContent}
          onSend={handleSend}
          onAbort={onAbort}
        />
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
