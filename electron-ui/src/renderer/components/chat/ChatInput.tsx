// ChatInput — thin orchestrator after Iteration 432 decomposition (further decomposed Iteration 455)
// Sub-modules: ChatInputAttachments, ChatInputPasteChips, ChatInputComposeStatus,
//              ChatInputSendButton, useChatInputKeyboard, ContextUsageMeter,
//              SnippetPopup, GhostTextOverlay, CharWordCounter

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import AtMentionPopup from './AtMentionPopup'
import NotePopup from './NotePopup'
import SlashCommandPopup from './SlashCommandPopup'
import QuickReplyChips from './QuickReplyChips'
import InputToolbar from './InputToolbar'
import PlanModeBanner from './PlanModeBanner'
import ChatInputAttachments from './ChatInputAttachments'
import ChatInputPasteChips from './ChatInputPasteChips'
import ChatInputComposeStatus from './ChatInputComposeStatus'
import ChatInputSendButton from './ChatInputSendButton'
import ContextUsageMeter from './ContextUsageMeter'
import SnippetPopup from './SnippetPopup'
import GhostTextOverlay from './GhostTextOverlay'
import CharWordCounter from './CharWordCounter'
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
import { estimateToolBreakdown } from '../../utils/tokenUtils'
import { StandardChatMessage } from '../../types/app.types'
import { matchesKeepGoingKeyword, matchesNegativeKeyword } from '../../hooks/usePromptKeywords'
import { useDoublePress } from '../../hooks/useDoublePress'
import { normalizeFullWidthDigits, normalizeFullWidthSpace } from '../../utils/stringUtils'
import { useVimMode } from '../../hooks/useVimMode'

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
  const messages = useChatStore(s => s.messages)
  const isPlanMode = useChatStore(s => s.isPlanMode)
  const setPlanMode = useChatStore(s => s.setPlanMode)

  // Plan Mode toggle: local UI state only — does NOT send any message to AI (Iteration 535)
  const handleTogglePlanMode = useCallback(() => {
    if (isStreaming) return
    const next = !isPlanMode
    setPlanMode(next)
    addToast('info', t(next ? 'plan.enabled' : 'plan.disabled'))
  }, [isPlanMode, isStreaming, setPlanMode, addToast, t])

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

  // Vim modal editing (Iteration 532)
  const vimEnabled = !!(prefs as any).vimMode
  const vim = useVimMode({ enabled: vimEnabled, textareaRef, setInput })

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Normalize full-width CJK digits/spaces to ASCII equivalents (sourcemap stringUtils)
    let val = normalizeFullWidthDigits(e.target.value)
    val = normalizeFullWidthSpace(val)
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

  // Keep-going detection (Iteration 490): detect "continue/继续/keep going" input
  const isKeepGoing = !isStreaming && input.trim().length > 0 && matchesKeepGoingKeyword(input)

  // Double-Escape on empty input = start new conversation (Iteration 493)
  const [escPending, setEscPending] = React.useState(false)
  const handleDoubleEscape = useDoublePress(
    setEscPending,
    () => { if (!input.trim() && !isStreaming) onNewConversation() },
  )

  // Negative keyword detection (Iteration 490): show friendly toast once per frustration event
  const negativeShownRef = React.useRef(false)
  React.useEffect(() => {
    if (!input.trim() || isStreaming) {
      negativeShownRef.current = false
      return
    }
    if (!negativeShownRef.current && matchesNegativeKeyword(input)) {
      negativeShownRef.current = true
      setTimeout(() => {
        addToast('info', t('input.negativeHint'))
      }, 800)
    }
  }, [input, isStreaming])

  return (
    <div style={{ margin: '0 16px 12px', background: 'rgba(15,15,25,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, boxShadow: '0 -4px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0, overflow: 'hidden' }}>
      {/* Toolbar row */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '6px 10px' }}>
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
        isPlanMode={isPlanMode}
        onTogglePlanMode={handleTogglePlanMode}
        isStreaming={isStreaming}
      />
      </div>
      {/* Context usage meter with compact button */}
      {lastContextUsage && lastContextUsage.total > 0 && (
        <ContextUsageMeter
          used={lastContextUsage.used}
          total={lastContextUsage.total}
          isStreaming={isStreaming}
          onCompact={() => onSend('/compact')}
          toolBreakdown={estimateToolBreakdown(messages as StandardChatMessage[])}
        />
      )}
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '8px 10px 8px' }}>
        <div
          ref={inputWrapRef}
          style={{
            flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', gap: 0,
            background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0',
            border: isPlanMode ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.07)', transition: 'border-color 0.15s ease',
          }}
        >
          {/* Plan Mode banner (Iteration 520) */}
          {isPlanMode && (
            <PlanModeBanner onExit={handleTogglePlanMode} />
          )}
          {/* Active persona indicator */}
          {activePersona && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginBottom: 4, fontSize: 11, color: activePersona.color, opacity: 0.8 }}>
              <Sparkles size={10} />
              <span style={{ fontWeight: 500 }}>{activePersona.emoji} {activePersona.name}</span>
            </div>
          )}
          {/* Attachments (images + files) */}
          {(attachments.length > 0 || fileAttachments.length > 0) && (
            <div style={{ padding: '6px 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <ChatInputAttachments
                attachments={attachments}
                fileAttachments={fileAttachments}
                onRemoveImage={removeAttachment}
                onRemoveFile={removeFileAttachment}
              />
            </div>
          )}
          {/* Paste action chips + quote preview */}
          <ChatInputPasteChips paste={{ ...paste, onWrapAsBlock: input.length > 500 ? () => { setInput(prev => '```\n' + prev + '\n```'); paste.setPastedLongText(false) } : undefined }} inputLength={input.length} />
          {/* Keep-going banner (Iteration 490) */}
          {isKeepGoing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', marginBottom: 4, fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.08)', borderRadius: 6 }}>
              <span style={{ flex: 1, opacity: 0.85 }}>{t('input.keepGoingHint')}</span>
              <button
                onClick={() => { handleSend() }}
                style={{ padding: '2px 8px', fontSize: 11, fontWeight: 500, background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))', color: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                {t('input.keepGoingSend')}
              </button>
            </div>
          )}
          {/* Double-Escape hint: press Esc again to start new chat (Iteration 493) */}
          {escPending && !input.trim() && !isStreaming && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', padding: '2px 6px', marginBottom: 4, opacity: 0.8 }}>
              {t('input.escAgainNewChat')}
            </div>
          )}
          {/* Popups */}
          {popups.atQuery !== null && <AtMentionPopup query={popups.atQuery} onSelect={popups.handleAtSelect} onDismiss={() => popups.setAtQuery(null)} anchorRef={inputWrapRef as React.RefObject<HTMLElement>} />}
          {popups.noteQuery !== null && <NotePopup query={popups.noteQuery} notes={popups.filteredNotes} categories={popups.noteCategories} selectedIndex={popups.noteIndex} onSelect={popups.handleNoteSelect} onDismiss={() => popups.setNoteQuery(null)} onHover={popups.setNoteIndex} />}
          {popups.slashQuery !== null && <SlashCommandPopup query={popups.slashQuery} onSelect={popups.handleSlashSelect} onDismiss={() => popups.setSlashQuery(null)} selectedIndex={popups.slashIndex} onHover={popups.setSlashIndex} extraCommands={popups.customCommands} />}
          {/* Text snippet popup */}
          {popups.snippetQuery !== null && (
            <SnippetPopup
              snippets={popups.filteredSnippets}
              selectedIndex={popups.snippetIndex}
              onSelect={popups.handleSnippetSelect}
              onHover={popups.setSnippetIndex}
            />
          )}
          {/* Textarea */}
          <div style={{ position: 'relative', flex: 1 }}>
            {/* Text drop zone indicator (Iteration 431) */}
            {textDragOver && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(99,102,241,0.06)', border: '2px dashed rgba(99,102,241,0.5)',
                borderRadius: 8, pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 500 }}>
                  {t('input.dropTextHere')}
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !input.trim() && !vimEnabled) handleDoubleEscape()
                vim.wrapKeyDown(e, handleKeyDown)
              }}
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
              onFocus={() => { if (inputWrapRef.current) inputWrapRef.current.style.borderColor = isPlanMode ? '#a78bfa' : 'rgba(99,102,241,0.45)' }}
              onBlur={() => { setTextDragOver(false); if (inputWrapRef.current) inputWrapRef.current.style.borderColor = isPlanMode ? '#a78bfa' : 'rgba(255,255,255,0.07)' }}
              placeholder={t(PLACEHOLDER_KEYS[placeholderIdx])}
              aria-label={t('chat.placeholder')}
              rows={1}
              style={{ flex: 1, width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.82)', resize: 'none', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, minHeight: 20, maxHeight: 160, overflow: 'auto', padding: '8px 14px 0' }}
            />
            {/* Ghost text autocomplete overlay */}
            <GhostTextOverlay input={input} ghostText={ghostText} />
          </div>
          {/* Separator between compose area and status row */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, marginBottom: 2 }} />
          {/* Character & word counter */}
          <CharWordCounter input={input} />
          {/* Vim mode indicator */}
          {vimEnabled && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 2 }}>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.8,
                padding: '1px 6px',
                borderRadius: 6,
                background: vim.mode === 'normal' ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))' : 'rgba(255,255,255,0.08)',
                color: vim.mode === 'normal' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                textTransform: 'uppercase',
                transition: 'background 0.15s ease, color 0.15s ease',
                userSelect: 'none',
              }}>
                {vim.mode === 'normal' ? 'NORMAL' : 'INSERT'}
              </span>
            </div>
          )}
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
