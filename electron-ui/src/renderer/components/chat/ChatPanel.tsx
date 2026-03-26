import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Square, Plus, Mic, MicOff, Download, Upload, Maximize2, Minimize2, Bookmark } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { useStreamJson } from '../../hooks/useStreamJson'
import MessageList from './MessageList'
import SearchBar from './SearchBar'
import AtMentionPopup from './AtMentionPopup'
import SlashCommandPopup, { SLASH_COMMANDS, SlashCommand } from './SlashCommandPopup'
import { useImagePaste } from '../../hooks/useImagePaste'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'

// Constants for drag-and-drop file handling
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_COUNT = 10

export default function ChatPanel() {
  const { messages, isStreaming, currentSessionId, currentSessionTitle } = useChatStore()
  const { prefs } = usePrefsStore()
  const { addToast } = useUiStore()
  const focusMode = useUiStore(s => s.focusMode)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)

  // Compute bookmarked messages
  const bookmarkedMessages = useMemo(() => {
    return messages
      .map((msg, idx) => ({ msg, idx }))
      .filter(({ msg }) => msg.role !== 'permission' && msg.role !== 'plan' && (msg as StandardChatMessage).bookmarked)
  }, [messages])
  const { sendMessage, abort, respondPermission, grantToolPermission, newConversation } = useStreamJson()
  const [input, setInput] = useState(() => {
    // Restore draft from sessionStorage
    try {
      return sessionStorage.getItem('aipa:draft-input') || ''
    } catch { return '' }
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // @ mention state
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

  // Slash command state
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [customCommands, setCustomCommands] = useState<{ name: string; description: string }[]>([])

  // Speech recognition state
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Input history (sent messages)
  const inputHistoryRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)
  const tempInputRef = useRef('')

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // Bookmarks dropdown state
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [scrollToMessageIdx, setScrollToMessageIdx] = useState<number | undefined>(undefined)
  const bookmarksRef = useRef<HTMLDivElement>(null)

  // Streaming elapsed timer
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (isStreaming && !streamStartTime) {
      setStreamStartTime(Date.now())
    } else if (!isStreaming && streamStartTime) {
      setStreamStartTime(null)
      setElapsed(0)
    }
  }, [isStreaming])

  useEffect(() => {
    if (!streamStartTime) return
    const tick = () => setElapsed(Math.floor((Date.now() - streamStartTime) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [streamStartTime])

  const elapsedStr = useMemo(() => {
    if (!isStreaming || elapsed < 1) return null
    const m = Math.floor(elapsed / 60)
    const s = elapsed % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }, [isStreaming, elapsed])

  const { attachments, handlePaste, addFiles, removeAttachment, clearAttachments } = useImagePaste()

  // Conversation search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<number[]>([])
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchMatches([])
      setCurrentMatchIdx(0)
      return
    }
    const lower = query.toLowerCase()
    const matches: number[] = []
    messages.forEach((msg, idx) => {
      if (msg.role === 'permission' || msg.role === 'plan') return
      const content = (msg as StandardChatMessage).content || ''
      if (content.toLowerCase().includes(lower)) {
        matches.push(idx)
      }
    })
    setSearchMatches(matches)
    setCurrentMatchIdx(0)
  }, [messages])

  const handleSearchNavigate = useCallback((direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return
    setCurrentMatchIdx(prev => {
      if (direction === 'next') return (prev + 1) % searchMatches.length
      return (prev - 1 + searchMatches.length) % searchMatches.length
    })
  }, [searchMatches.length])

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchMatches([])
    setCurrentMatchIdx(0)
  }, [])

  const handleSend = async () => {
    const text = input.trim()
    if (!text && attachments.length === 0 || isStreaming) return
    // Save to input history
    if (text) {
      inputHistoryRef.current = [text, ...inputHistoryRef.current.filter(h => h !== text)].slice(0, 50)
      historyIdxRef.current = -1
    }
    setInput('')
    setAtQuery(null)
    clearAttachments()
    resizeTextarea()
    try { sessionStorage.removeItem('aipa:draft-input') } catch { /* ignore */ }
    await sendMessage(text || 'Describe this image', attachments.length > 0 ? attachments : undefined)
  }

  const sendText = async (text: string) => {
    if (!text.trim() || isStreaming) return
    await sendMessage(text.trim())
  }

  // ── Export conversation ──────────────────────────
  const exportConversation = useCallback(async () => {
    if (messages.length === 0) return
    const now = new Date()
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `aipa-export-${ts}`
    const filePath = await window.electronAPI.fsShowSaveDialog(defaultName, [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'JSON', extensions: ['json'] },
    ])
    if (!filePath) return // user cancelled

    const isJson = filePath.toLowerCase().endsWith('.json')
    let content: string

    if (isJson) {
      content = JSON.stringify(messages, null, 2)
    } else {
      content = formatMarkdown(messages, currentSessionId, now)
    }

    const result = await window.electronAPI.fsWriteFile(filePath, content)
    if (result?.error) {
      addToast('error', `Export failed: ${result.error}`)
    } else {
      addToast('success', 'Conversation exported successfully')
    }
  }, [messages, currentSessionId, addToast])

  // Keyboard shortcut: Ctrl+Shift+E for export
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        exportConversation()
      }
      // Ctrl+F: Open search
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exportConversation])

  // Listen for export trigger from CommandPalette
  useEffect(() => {
    const handler = () => exportConversation()
    window.addEventListener('aipa:export', handler)
    return () => window.removeEventListener('aipa:export', handler)
  }, [exportConversation])

  // Close bookmarks dropdown on click outside
  useEffect(() => {
    if (!showBookmarks) return
    const handler = (e: MouseEvent) => {
      if (bookmarksRef.current && !bookmarksRef.current.contains(e.target as Node)) {
        setShowBookmarks(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBookmarks])

  // Listen for slash command from CommandPalette
  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent).detail as string
      if (cmd) sendMessage(cmd)
    }
    window.addEventListener('aipa:slashCommand', handler)
    return () => window.removeEventListener('aipa:slashCommand', handler)
  }, [])

  // ── File drag-and-drop ──────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    if (files.length > MAX_FILE_COUNT) {
      addToast('warning', `Too many files (max ${MAX_FILE_COUNT}). First ${MAX_FILE_COUNT} processed.`)
    }

    const processFiles = files.slice(0, MAX_FILE_COUNT)
    const imageFiles: File[] = []
    const pathFiles: string[] = []

    for (const file of processFiles) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const isImage = IMAGE_EXTENSIONS.includes(ext)

      if (isImage) {
        if (file.size > MAX_FILE_SIZE) {
          addToast('error', `${file.name} is too large (max 10MB)`)
          continue
        }
        imageFiles.push(file)
      } else {
        // Electron File objects have a .path property with the full absolute path
        const filePath = (file as any).path as string
        if (filePath) {
          pathFiles.push(filePath)
        }
      }
    }

    // Attach images via the existing image paste mechanism
    if (imageFiles.length > 0) {
      addFiles(imageFiles)
    }

    // Insert @paths for non-image files
    if (pathFiles.length > 0) {
      const atPaths = pathFiles.map(p => `@${p}`).join(' ')
      setInput(prev => {
        const sep = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
        return prev + sep + atPaths
      })
      // Focus textarea after inserting paths
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [addFiles, addToast])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      // Let AtMentionPopup handle these keys
      return
    }
    if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      return // SlashCommandPopup handles these keys via useEffect
    }
    // Input history navigation (only when cursor is at line boundaries)
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

    // Detect @ trigger
    const cursor = e.target.selectionStart
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@([^\s]*)$/)
    if (atMatch) {
      setAtQuery(atMatch[1])
    } else {
      setAtQuery(null)
    }

    // Detect / trigger (at start of input or after whitespace)
    const slashMatch = textBefore.match(/(?:^|\s)(\/[^\s]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1].slice(1)) // strip leading /
      setSlashIndex(0)
      setAtQuery(null)
    } else if (!atMatch) {
      setSlashQuery(null)
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

  const handleSlashSelect = async (cmd: SlashCommand) => {
    setSlashQuery(null)
    setInput('')
    if (cmd.clientOnly) {
      if (cmd.name === '/clear') {
        newConversation()
      } else if (cmd.name === '/help') {
        useChatStore.getState().addMessage({
          id: `help-${Date.now()}`,
          role: 'assistant',
          content: '**Available Commands:**\n\n' + SLASH_COMMANDS.map(c => `- \`${c.name}\` — ${c.description}`).join('\n'),
          timestamp: Date.now(),
        } as any)
      }
      return
    }
    // Send to CLI (built-in commands like /compact) or custom commands (fill input for user to confirm)
    const isBuiltin = SLASH_COMMANDS.some(c => c.name === cmd.name)
    if (isBuiltin) {
      await sendMessage(cmd.name)
    } else {
      // Custom command: fill input, user can add parameters before sending
      setInput(cmd.name + ' ')
      textareaRef.current?.focus()
    }
  }

  // Load custom slash commands when popup opens
  useEffect(() => {
    if (slashQuery === null) return
    window.electronAPI.fsListCommands(prefs.workingDir || '').then((cmds: { name: string; description: string; source: string }[]) => {
      setCustomCommands(cmds.map(c => ({
        name: c.name,
        description: c.description + (c.source === 'project' ? ' [Project]' : ' [User]'),
      })))
    }).catch(() => {})
  }, [slashQuery])

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

  // Listen for focus request from global shortcut (Ctrl+L)
  useEffect(() => {
    const handler = () => textareaRef.current?.focus()
    window.addEventListener('aipa:focusInput', handler)
    return () => window.removeEventListener('aipa:focusInput', handler)
  }, [])

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

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-primary)', position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleFileDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 8,
            zIndex: 50,
            background: 'rgba(0, 122, 204, 0.15)',
            border: '3px dashed var(--accent)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            animation: 'drop-zone-pulse 1.5s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        >
          <Upload size={48} style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-bright)' }}>
            Drop files here
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Images attached, other files referenced via @path
          </div>
        </div>
      )}

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
          {currentSessionTitle
            ? currentSessionTitle
            : currentSessionId
            ? `Session: ${currentSessionId.slice(0, 8)}...`
            : `${prefs.model?.split('-').slice(0, 3).join('-') || 'claude'}`}
        </span>
        {prefs.workingDir && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={prefs.workingDir}>
            {prefs.workingDir.split(/[/\\]/).pop()}
          </span>
        )}
        <button
          onClick={exportConversation}
          disabled={messages.length === 0}
          title="Export conversation (Ctrl+Shift+E)"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            opacity: messages.length === 0 ? 0.3 : 1,
          }}
        >
          <Download size={14} />
        </button>
        {/* Bookmarks dropdown */}
        <div style={{ position: 'relative' }} ref={bookmarksRef}>
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            title={`Bookmarks (${bookmarkedMessages.length})`}
            style={{
              background: showBookmarks ? 'var(--accent)' : 'none',
              border: 'none',
              color: showBookmarks ? '#fff' : bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              borderRadius: 3,
              padding: '2px 4px',
              opacity: bookmarkedMessages.length === 0 && !showBookmarks ? 0.4 : 1,
            }}
          >
            <Bookmark size={13} />
            {bookmarkedMessages.length > 0 && (
              <span style={{ fontSize: 9 }}>{bookmarkedMessages.length}</span>
            )}
          </button>
          {showBookmarks && bookmarkedMessages.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                zIndex: 60,
                width: 280,
                maxHeight: 300,
                overflowY: 'auto',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                padding: '4px 0',
                marginTop: 4,
              }}
            >
              <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                Bookmarks
              </div>
              {bookmarkedMessages.map(({ msg, idx }) => {
                const std = msg as StandardChatMessage
                const preview = (std.content || '').slice(0, 80).replace(/\n/g, ' ')
                return (
                  <button
                    key={msg.id}
                    onClick={() => {
                      setScrollToMessageIdx(idx)
                      // Reset after a tick so it can be triggered again for same idx
                      setTimeout(() => setScrollToMessageIdx(undefined), 100)
                      setShowBookmarks(false)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, var(--bg-active))')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>
                      {std.role === 'user' ? 'You' : 'Claude'}
                    </span>
                    {preview || '(empty)'}
                  </button>
                )
              })}
            </div>
          )}
          {showBookmarks && bookmarkedMessages.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                zIndex: 60,
                width: 200,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                padding: '16px 12px',
                marginTop: 4,
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              No bookmarks yet.
              <div style={{ fontSize: 10, marginTop: 4 }}>Right-click a message to bookmark it.</div>
            </div>
          )}
        </div>
        <button
          onClick={toggleFocusMode}
          title={focusMode ? 'Exit focus mode (Ctrl+Shift+F)' : 'Focus mode (Ctrl+Shift+F)'}
          style={{
            background: focusMode ? 'var(--accent)' : 'none',
            border: 'none',
            color: focusMode ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
            padding: '2px 4px',
          }}
        >
          {focusMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        {elapsedStr && (
          <span style={{
            fontSize: 10,
            color: 'var(--success)',
            fontFamily: 'monospace',
            flexShrink: 0,
            minWidth: 32,
            textAlign: 'right',
          }}>
            {elapsedStr}
          </span>
        )}
        <button
          onClick={newConversation}
          title="New conversation"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <SearchBar
          onSearch={handleSearch}
          onNavigate={handleSearchNavigate}
          onClose={handleSearchClose}
          matchCount={searchMatches.length}
          currentMatch={currentMatchIdx}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {messages.length === 0 ? (
            <WelcomeScreen onSuggestion={sendText} />
          ) : (
          <MessageList
            messages={messages}
            onPermission={respondPermission}
            onGrantPermission={grantToolPermission}
            sessionId={currentSessionId}
            searchQuery={searchQuery}
            highlightedMessageIdx={searchMatches.length > 0 ? searchMatches[currentMatchIdx] : undefined}
            scrollToMessageIdx={scrollToMessageIdx}
          />
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
            flexDirection: 'column',
            gap: 0,
            background: 'var(--bg-input)',
            borderRadius: 6,
            padding: '8px 12px',
            border: '1px solid var(--border)',
          }}
        >
          {/* Image attachment preview */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
              {attachments.map(img => (
                <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
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
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {/* Input row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
              placeholder="Send a message... (@ files, / commands, paste images, Enter to send)"
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
              title={listening ? 'Stop recording' : 'Voice input'}
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
              disabled={!isStreaming && !input.trim() && attachments.length === 0}
              title={isStreaming ? 'Stop generating' : 'Send (Ctrl+Enter)'}
              style={{
                background: isStreaming ? 'var(--error)' : 'var(--accent)',
                border: 'none',
                borderRadius: 4,
                padding: '6px 10px',
                color: '#fff',
                cursor: isStreaming || input.trim() || attachments.length > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                opacity: !isStreaming && !input.trim() && attachments.length === 0 ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              {isStreaming ? <Square size={14} /> : <Send size={14} />}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>
          <span>@ files | Enter send | Shift+Enter newline | Ctrl+L focus | Ctrl+Shift+P commands</span>
          {input.length > 0 && (
            <span style={{ flexShrink: 0 }}>
              {input.length} chars
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  const { messages, pendingToolUses } = useChatStore()

  // Determine what Claude is currently doing
  let activityLabel = 'Thinking'
  if (pendingToolUses.size > 0) {
    const [, firstTool] = Array.from(pendingToolUses.entries())[0]
    const toolLabels: Record<string, string> = {
      Bash: 'Running command',
      Read: 'Reading file',
      Write: 'Writing file',
      Edit: 'Editing file',
      MultiEdit: 'Editing files',
      Glob: 'Searching files',
      Grep: 'Searching content',
      WebFetch: 'Fetching web page',
      WebSearch: 'Searching the web',
      LS: 'Listing directory',
    }
    activityLabel = toolLabels[firstTool.name] || `Using ${firstTool.name}`
  } else {
    // Check if last message has streaming content
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
      activityLabel = 'Writing'
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, padding: '10px 16px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
        {activityLabel}...
      </span>
    </div>
  )
}

function WelcomeScreen({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    { emoji: '\u{1F4C1}', text: 'Analyze the code structure of this project' },
    { emoji: '\u{1F41B}', text: 'Help me find and fix this bug' },
    { emoji: '\u2728', text: 'Help me implement a new feature' },
    { emoji: '\u{1F4DD}', text: 'Write a script to automate a task' },
  ]

  const shortcuts = [
    { keys: 'Ctrl+Shift+P', desc: 'Command palette' },
    { keys: 'Ctrl+B', desc: 'Toggle sidebar' },
    { keys: 'Ctrl+`', desc: 'Toggle terminal' },
    { keys: 'Ctrl+L', desc: 'Focus input' },
    { keys: '@file', desc: 'Reference files' },
    { keys: '/cmd', desc: 'Slash commands' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 20, padding: '0 20px' }}>
      <div style={{ fontSize: 56 }}>{'\u{1F916}'}</div>
      <div style={{ fontSize: 24, color: 'var(--text-primary)', fontWeight: 600 }}>Hello! I'm Claude</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
        Your AI assistant, ready to help
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
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
              maxWidth: 140,
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

      {/* Keyboard shortcuts hint */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {shortcuts.map(({ keys, desc }) => (
          <div key={keys} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <kbd style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
            }}>{keys}</kbd>
            <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Settings', action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('settings') } },
          { label: 'Terminal', action: () => useUiStore.getState().toggleTerminal() },
          { label: 'Files', action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('files') } },
          { label: 'Shortcuts', action: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' })) },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '4px 12px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Markdown export formatter ──────────────────────
function formatMarkdown(messages: ChatMessage[], sessionId: string | null, exportDate: Date): string {
  const dateStr = exportDate.toISOString().replace('T', ' ').slice(0, 19)
  const lines: string[] = [
    '# AIPA Conversation',
    `_Exported: ${dateStr}_`,
    `_Session: ${sessionId || 'New conversation'}_`,
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    if (msg.role === 'permission') continue // skip permission cards
    if (msg.role === 'plan') {
      lines.push('**Plan**', '', (msg as any).planContent || '', '', '---', '')
      continue
    }

    const std = msg as StandardChatMessage
    const ts = new Date(std.timestamp).toLocaleTimeString()
    const role = std.role === 'user' ? 'User' : std.role === 'assistant' ? 'Assistant' : 'System'

    lines.push(`**${role}** (${ts})`, '')
    lines.push(std.content || '', '')

    // Tool uses
    if (std.toolUses && std.toolUses.length > 0) {
      for (const tool of std.toolUses) {
        const toolLabel = tool.name || 'Unknown tool'
        lines.push(`<details>`)
        lines.push(`<summary>Tool: ${toolLabel}</summary>`)
        lines.push('')
        lines.push('**Input:**')
        lines.push('```json')
        lines.push(JSON.stringify(tool.input, null, 2))
        lines.push('```')
        if (tool.result !== undefined) {
          const resultStr = typeof tool.result === 'string'
            ? tool.result
            : JSON.stringify(tool.result, null, 2)
          const truncated = resultStr.length > 500
            ? resultStr.slice(0, 500) + '\n... (truncated)'
            : resultStr
          lines.push('')
          lines.push(`**Result** (${tool.status}):`)
          lines.push('```')
          lines.push(truncated)
          lines.push('```')
        }
        lines.push('</details>')
        lines.push('')
      }
    }

    // Thinking blocks
    if (std.thinking) {
      lines.push('<details>')
      lines.push('<summary>Thinking</summary>')
      lines.push('')
      lines.push(std.thinking)
      lines.push('</details>')
      lines.push('')
    }

    lines.push('---', '')
  }

  return lines.join('\n')
}
