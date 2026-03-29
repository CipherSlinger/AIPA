import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Square, X, MessageSquareQuote, Sparkles, Link2, FileText } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import AtMentionPopup from './AtMentionPopup'
import SlashCommandPopup, { SLASH_COMMANDS, SlashCommand } from './SlashCommandPopup'
import QuickReplyChips from './QuickReplyChips'
import InputToolbar from './InputToolbar'
import { PLACEHOLDER_KEYS } from './chatInputConstants'
import { useImagePaste, ImageAttachment } from '../../hooks/useImagePaste'
import { useChatInputDraft } from '../../hooks/useChatInputDraft'
import { useChatInputHistory } from '../../hooks/useChatInputHistory'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { PromptHistoryItem, TextSnippet } from '../../types/app.types'
import { useT } from '../../i18n'

interface ChatInputProps {
  isStreaming: boolean
  sessionId: string | null
  onSend: (text: string, attachments?: ImageAttachment[]) => Promise<void>
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
  const quotedText = useUiStore(s => s.quotedText)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const addToQueue = useChatStore(s => s.addToQueue)

  // Draft persistence (per-session)
  const { input, setInput, clearDraft } = useChatInputDraft({
    sessionId,
    onDraftRestored: () => addToast(t('chat.draftRestored'), 'info'),
  })

  // Input history navigation
  const { inputHistoryRef, addToHistory, navigateUp, navigateDown } = useChatInputHistory()

  // Speech recognition
  const { listening, toggleSpeech } = useSpeechRecognition((transcript) => {
    setInput(prev => prev + transcript)
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  // Typing speed (WPM) tracking
  const keystrokeTimestamps = useRef<number[]>([])
  const [typingWpm, setTypingWpm] = useState(0)
  const wpmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    wpmTimerRef.current = setInterval(() => {
      const now = Date.now()
      // Keep only keystrokes within last 10 seconds
      keystrokeTimestamps.current = keystrokeTimestamps.current.filter(t => now - t < 10000)
      const count = keystrokeTimestamps.current.length
      if (count < 2) { setTypingWpm(0); return }
      // Characters per minute, then convert to words (avg 5 chars/word)
      const span = (now - keystrokeTimestamps.current[0]) / 60000 // minutes
      if (span < 0.001) { setTypingWpm(0); return }
      const wpm = Math.round((count / 5) / span)
      setTypingWpm(wpm)
    }, 1000)
    return () => { if (wpmTimerRef.current) clearInterval(wpmTimerRef.current) }
  }, [])

  // @ mention state
  const [atQuery, setAtQuery] = useState<string | null>(null)

  // Slash command state
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [customCommands, setCustomCommands] = useState<{ name: string; description: string }[]>([])

  // Text snippet state (::keyword trigger)
  const [snippetQuery, setSnippetQuery] = useState<string | null>(null)
  const [snippetIndex, setSnippetIndex] = useState(0)
  const textSnippets: TextSnippet[] = usePrefsStore(s => s.prefs.textSnippets || [])
  const filteredSnippets = useMemo(() => {
    if (snippetQuery === null || textSnippets.length === 0) return []
    const q = snippetQuery.toLowerCase()
    return textSnippets.filter(s => s.keyword.toLowerCase().startsWith(q)).slice(0, 8)
  }, [snippetQuery, textSnippets])

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

  // Pending quote (shown as a visual banner above input)
  const [pendingQuote, setPendingQuote] = useState<string | null>(null)

  // URL paste detection chips
  const [pastedUrl, setPastedUrl] = useState<string | null>(null)
  const urlChipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long text paste detection
  const [pastedLongText, setPastedLongText] = useState<boolean>(false)
  const longTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const URL_REGEX = /https?:\/\/[^\s<>'"]+/i

  const handleTextPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Let useImagePaste handle image pastes first
    handlePaste(e)
    // Detect URL in pasted text
    const text = e.clipboardData.getData('text/plain')
    if (text) {
      const match = text.match(URL_REGEX)
      if (match) {
        setPastedUrl(match[0])
        // Auto-dismiss after 8 seconds
        if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
        urlChipTimerRef.current = setTimeout(() => setPastedUrl(null), 8000)
      }
      // Detect long text paste (>500 chars, no URL already shown)
      if (text.length > 500 && !match) {
        setPastedLongText(true)
        if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
        longTextTimerRef.current = setTimeout(() => setPastedLongText(false), 12000)
      }
    }
  }, [handlePaste])

  const handleUrlAction = useCallback((action: string) => {
    if (!pastedUrl) return
    setInput(prev => {
      // Replace the URL with "action: URL" pattern
      const actionPrefix = `${action}: ${pastedUrl}\n`
      if (prev.includes(pastedUrl)) {
        return actionPrefix + prev.replace(pastedUrl, '').trim()
      }
      return actionPrefix + prev.trim()
    })
    setPastedUrl(null)
    if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
    textareaRef.current?.focus()
  }, [pastedUrl])

  const handleLongTextAction = useCallback((action: string) => {
    setInput(prev => {
      return `${action}:\n\n${prev}`
    })
    setPastedLongText(false)
    if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
    textareaRef.current?.focus()
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current)
      if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current)
    }
  }, [])

  // Handle quote reply: store as pending quote instead of raw markdown injection
  useEffect(() => {
    if (!quotedText) return
    setPendingQuote(quotedText)
    setQuotedText(null)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [quotedText, setQuotedText])

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

  const handleSend = async () => {
    const text = input.trim()
    if (!text && attachments.length === 0 || isStreaming) return
    let finalText = text || t('chat.describeImage')
    if (pendingQuote) {
      const quotedLines = pendingQuote.split('\n').map((l: string) => `> ${l}`).join('\n')
      finalText = quotedLines + '\n\n' + finalText
      setPendingQuote(null)
    }
    if (text) addToHistory(text)
    setInput('')
    setAtQuery(null)
    setPastedUrl(null)
    setPastedLongText(false)
    clearAttachments()
    resizeTextarea()
    clearDraft()
    await onSend(finalText, attachments.length > 0 ? attachments : undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) return
    if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) return
    // Snippet popup keyboard navigation
    if (snippetQuery !== null && filteredSnippets.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSnippetIndex(i => Math.min(i + 1, filteredSnippets.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSnippetIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSnippetSelect(filteredSnippets[snippetIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSnippetQuery(null); return }
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && atQuery === null && slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        const result = navigateUp(input, true)
        if (result !== null) { e.preventDefault(); setInput(result) }
      }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && atQuery === null && slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === input.length) {
        const result = navigateDown(true)
        if (result !== null) { e.preventDefault(); setInput(result) }
      }
    }
    // Tab: accept ghost text autocomplete
    if (e.key === 'Tab' && !e.shiftKey && ghostText) {
      e.preventDefault()
      setInput(prev => prev.trimStart() + ghostText)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.ctrlKey && !e.shiftKey && e.key === 'u') { e.preventDefault(); setInput('') }
    // Escape: dismiss URL chips, long text chips, then quote preview
    if (e.key === 'Escape' && atQuery === null && slashQuery === null) {
      if (pastedUrl) { e.preventDefault(); setPastedUrl(null); if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current); return }
      if (pastedLongText) { e.preventDefault(); setPastedLongText(false); if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current); return }
      if (pendingQuote) { e.preventDefault(); setPendingQuote(null); return }
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
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@([^\s]*)$/)
    if (atMatch) { setAtQuery(atMatch[1]) } else { setAtQuery(null) }
    const slashMatch = textBefore.match(/(?:^|\s)(\/[^\s]*)$/)
    if (slashMatch) { setSlashQuery(slashMatch[1].slice(1)); setSlashIndex(0); setAtQuery(null) }
    else if (!atMatch) { setSlashQuery(null) }
    // Detect ::keyword for text snippets
    const snippetMatch = textBefore.match(/::(\w*)$/)
    if (snippetMatch && !atMatch && !slashMatch) { setSnippetQuery(snippetMatch[1]); setSnippetIndex(0) }
    else { setSnippetQuery(null) }
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

  const handleSnippetSelect = (snippet: TextSnippet) => {
    const cursor = textareaRef.current?.selectionStart ?? input.length
    const textBefore = input.slice(0, cursor)
    const textAfter = input.slice(cursor)
    const snippetMatch = textBefore.match(/::(\w*)$/)
    if (snippetMatch) {
      const replaced = textBefore.slice(0, textBefore.length - snippetMatch[0].length) + snippet.content + textAfter
      setInput(replaced)
    }
    setSnippetQuery(null)
    textareaRef.current?.focus()
  }

  const handleSlashSelect = async (cmd: SlashCommand) => {
    setSlashQuery(null)
    setInput('')
    if (cmd.clientOnly) {
      if (cmd.name === '/clear') onNewConversation()
      else if (cmd.name === '/help') {
        useChatStore.getState().addMessage({
          id: `help-${Date.now()}`, role: 'assistant',
          content: `**${t('command.availableCommands')}:**\n\n` + SLASH_COMMANDS.map(c => `- \`${c.name}\` — ${c.description}`).join('\n'),
          timestamp: Date.now(),
        } as any)
      }
      return
    }
    const isBuiltin = SLASH_COMMANDS.some(c => c.name === cmd.name)
    if (isBuiltin) { await onSend(cmd.name) }
    else { setInput(cmd.name + ' '); textareaRef.current?.focus() }
  }

  // Load custom slash commands once when popup opens
  const slashPopupOpen = slashQuery !== null
  useEffect(() => {
    if (!slashPopupOpen) return
    window.electronAPI.fsListCommands(prefs.workingDir || '').then((cmds: { name: string; description: string; source: string }[]) => {
      setCustomCommands(cmds.map(c => ({
        name: c.name,
        description: c.description + (c.source === 'project' ? ` ${t('command.sourceProject')}` : ` ${t('command.sourceUser')}`),
      })))
    }).catch(() => {})
  }, [slashPopupOpen, prefs.workingDir])

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
          clearDraft()
          textareaRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [input, addToQueue, resizeTextarea])

  // Inline prompt autocomplete from history
  const promptHistory: PromptHistoryItem[] = prefs.promptHistory || []
  const ghostText = useMemo(() => {
    const trimmed = input.trimStart()
    if (trimmed.length < 3 || slashQuery !== null || atQuery !== null) return ''
    const lower = trimmed.toLowerCase()
    // Find the most-used matching history entry
    let best: PromptHistoryItem | null = null
    for (const item of promptHistory) {
      const itemLower = item.text.toLowerCase()
      if (itemLower.startsWith(lower) && itemLower !== lower) {
        if (!best || item.count > best.count || (item.count === best.count && item.lastUsedAt > best.lastUsedAt)) {
          best = item
        }
      }
    }
    if (!best) return ''
    // Return only the suffix (the part after what's already typed)
    return best.text.slice(trimmed.length)
  }, [input, promptHistory, slashQuery, atQuery])

  // Active persona indicator
  const personas = prefs.personas || []
  const activePersona = prefs.activePersonaId ? personas.find(p => p.id === prefs.activePersonaId) : undefined

  return (
    <div style={{ padding: '8px 16px 12px', background: 'var(--input-bar-bg)', flexShrink: 0 }}>
      {/* Toolbar row */}
      <InputToolbar
        listening={listening}
        toggleSpeech={toggleSpeech}
        onAtClick={() => { setInput(prev => prev + '@'); setAtQuery(''); textareaRef.current?.focus() }}
        onSlashClick={() => { setInput('/'); setSlashQuery(''); setSlashIndex(0); textareaRef.current?.focus() }}
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
        onInsertText={(text) => {
          setInput(prev => {
            const sep = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
            return prev + sep + text
          })
          setTimeout(() => textareaRef.current?.focus(), 0)
        }}
        hasInput={!!input.trim()}
        inputText={input}
      />
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
          {/* Image attachments */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
              {attachments.map(img => (
                <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={img.dataUrl} alt={img.name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--input-field-border)' }} />
                  <button onClick={() => removeAttachment(img.id)} style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--error)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, lineHeight: '1' }}>{'\u00d7'}</button>
                </div>
              ))}
            </div>
          )}
          {/* URL paste quick action chips */}
          {pastedUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
              <Link2 size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pastedUrl}</span>
              {[
                { key: 'summarize', label: t('chat.urlAction.summarize') },
                { key: 'explain', label: t('chat.urlAction.explain') },
                { key: 'translate', label: t('chat.urlAction.translate') },
              ].map(action => (
                <button
                  key={action.key}
                  onClick={() => handleUrlAction(action.label)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 500,
                    background: 'rgba(0, 122, 204, 0.1)',
                    border: '1px solid rgba(0, 122, 204, 0.25)',
                    borderRadius: 10,
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    transition: 'background 150ms, border-color 150ms',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.2)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.1)'; e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.25)' }}
                >
                  {action.label}
                </button>
              ))}
              <button
                onClick={() => { setPastedUrl(null); if (urlChipTimerRef.current) clearTimeout(urlChipTimerRef.current) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.6 }}
              >
                <X size={12} />
              </button>
            </div>
          )}
          {/* Long text paste quick action chips */}
          {pastedLongText && !pastedUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 4, flexWrap: 'wrap' }}>
              <FileText size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {t('chat.longPaste', { count: String(input.length) })}
              </span>
              {[
                { key: 'summarize', label: t('chat.urlAction.summarize') },
                { key: 'explain', label: t('chat.urlAction.explain') },
                { key: 'translate', label: t('chat.urlAction.translate') },
                { key: 'rewrite', label: t('clipboard.rewrite') },
              ].map(action => (
                <button
                  key={action.key}
                  onClick={() => handleLongTextAction(action.label)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 500,
                    background: 'rgba(0, 122, 204, 0.1)',
                    border: '1px solid rgba(0, 122, 204, 0.25)',
                    borderRadius: 10,
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    transition: 'background 150ms, border-color 150ms',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.2)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.1)'; e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.25)' }}
                >
                  {action.label}
                </button>
              ))}
              <button
                onClick={() => { setPastedLongText(false); if (longTextTimerRef.current) clearTimeout(longTextTimerRef.current) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.6 }}
              >
                <X size={12} />
              </button>
            </div>
          )}
          {/* Pending quote preview banner */}
          {pendingQuote && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', marginBottom: 6, background: 'rgba(0, 122, 204, 0.08)', borderLeft: '3px solid var(--accent)', borderRadius: 4, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <MessageSquareQuote size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
                {pendingQuote.length > 150 ? pendingQuote.slice(0, 150) + '...' : pendingQuote}
              </div>
              <button
                onClick={() => setPendingQuote(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4, flexShrink: 0, transition: 'color 150ms' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                title={t('common.close')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {/* Popups */}
          {atQuery !== null && <AtMentionPopup query={atQuery} onSelect={handleAtSelect} onDismiss={() => setAtQuery(null)} anchorRef={inputWrapRef as React.RefObject<HTMLElement>} />}
          {slashQuery !== null && <SlashCommandPopup query={slashQuery} onSelect={handleSlashSelect} onDismiss={() => setSlashQuery(null)} selectedIndex={slashIndex} onHover={setSlashIndex} extraCommands={customCommands} />}
          {/* Text snippet popup */}
          {snippetQuery !== null && filteredSnippets.length > 0 && (
            <div
              className="popup-enter"
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                width: 320,
                maxHeight: 240,
                overflowY: 'auto',
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                borderRadius: 8,
                boxShadow: 'var(--popup-shadow)',
                padding: '4px 0',
                zIndex: 50,
              }}
            >
              <div style={{ padding: '4px 10px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
                {t('snippet.title')}
              </div>
              {filteredSnippets.map((snippet, idx) => (
                <button
                  key={snippet.id}
                  onClick={() => handleSnippetSelect(snippet)}
                  onMouseEnter={() => setSnippetIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 10px',
                    background: idx === snippetIndex ? 'var(--popup-item-hover)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 0,
                  }}
                >
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                    minWidth: 48,
                  }}>
                    ::{snippet.keyword}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    lineHeight: 1.4,
                    opacity: 0.8,
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
              onPaste={handleTextPaste}
              onDragOver={(e) => e.preventDefault()}
              onFocus={() => { if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-focus)' }}
              onBlur={() => { if (inputWrapRef.current) inputWrapRef.current.style.borderColor = 'var(--input-field-border)' }}
              placeholder={t(PLACEHOLDER_KEYS[placeholderIdx])}
              aria-label={t('chat.placeholder')}
              rows={1}
              style={{ flex: 1, width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', resize: 'none', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, minHeight: 20, maxHeight: 160, overflow: 'auto' }}
            />
            {/* Ghost text autocomplete overlay */}
            {ghostText && input.trimStart().length >= 3 && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  pointerEvents: 'none',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'transparent',
                  overflow: 'hidden',
                  maxHeight: 160,
                }}
              >
                <span style={{ visibility: 'hidden' }}>{input}</span>
                <span style={{ color: 'var(--text-muted)', opacity: 0.45 }}>{ghostText}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.35, marginLeft: 4 }}>Tab</span>
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
                position: 'absolute',
                top: -4,
                left: -4,
                transform: 'rotate(-90deg)',
                pointerEvents: 'none',
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
            disabled={!isStreaming && !input.trim() && attachments.length === 0}
            title={isStreaming ? t('chat.stopGenerating') : t('chat.sendEnter')}
            style={{
              background: isStreaming ? 'var(--error)' : 'var(--accent)', border: 'none', borderRadius: 10, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              cursor: isStreaming || input.trim() || attachments.length > 0 ? 'pointer' : 'not-allowed',
              opacity: !isStreaming && !input.trim() && attachments.length === 0 ? 0.4 : 1,
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
      {/* Compose status */}
      {input.trim().length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '3px 4px 0', fontSize: 10,
          color: input.length > 10000 ? 'var(--error)' : input.length > 5000 ? 'var(--warning)' : 'var(--text-muted)',
          fontWeight: input.length > 10000 ? 600 : 400, opacity: 0.7, transition: 'color 200ms, opacity 200ms',
        }}>
          <span>{input.trim().split(/\s+/).filter(w => w.length > 0).length} {t('chat.words')}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>{input.length.toLocaleString()} {t('chat.chars')}{input.length > 10000 ? ` (${t('chat.veryLong')})` : input.length > 5000 ? ` (${t('chat.long')})` : ''}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>{t('message.approxTokens', { count: String(Math.ceil(input.length / 4)) })}</span>
          {typingWpm > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>|</span>
              <span style={{ color: typingWpm > 60 ? 'var(--accent)' : 'var(--text-muted)' }}>{typingWpm} {t('chat.wpm')}</span>
            </>
          )}
        </div>
      )}
      {/* Input history hint */}
      {input.length === 0 && inputHistoryRef.current.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 0', fontSize: 10, color: 'var(--text-muted)', opacity: 0.4 }}>
          <span>{t('chat.inputHistoryHint')}</span>
        </div>
      )}
    </div>
  )
}
