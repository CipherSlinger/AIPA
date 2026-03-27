import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Square, Plus, Mic, MicOff, Download, Upload, Maximize2, Minimize2, Bookmark, BarChart3, ListPlus, AtSign, TerminalSquare, Search, Bot, FolderSearch, Bug, Sparkles, FileCode2, Settings, Terminal, FolderOpen, Keyboard, RefreshCw, ClipboardCopy } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { useStreamJson } from '../../hooks/useStreamJson'
import MessageList from './MessageList'
import SearchBar from './SearchBar'
import AtMentionPopup from './AtMentionPopup'
import SlashCommandPopup, { SLASH_COMMANDS, SlashCommand } from './SlashCommandPopup'
import { useImagePaste } from '../../hooks/useImagePaste'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import TaskQueuePanel from './TaskQueuePanel'
import QuickReplyChips from './QuickReplyChips'
import { useT } from '../../i18n'

// Placeholder suggestion i18n keys
const PLACEHOLDER_KEYS = [
  'chat.placeholders.default',
  'chat.placeholders.analyzeCode',
  'chat.placeholders.describeBug',
  'chat.placeholders.explainFunction',
  'chat.placeholders.writeTest',
  'chat.placeholders.refactorFile',
  'chat.placeholders.buildFeature',
  'chat.placeholders.reviewPR',
]

// Constants for drag-and-drop file handling
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_COUNT = 10

export default function ChatPanel() {
  const t = useT()
  const { messages, isStreaming, currentSessionId, currentSessionTitle } = useChatStore()
  const { prefs } = usePrefsStore()
  const { addToast } = useUiStore()
  const focusMode = useUiStore(s => s.focusMode)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)
  const quotedText = useUiStore(s => s.quotedText)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const taskQueue = useChatStore(s => s.taskQueue)
  const addToQueue = useChatStore(s => s.addToQueue)
  const prepareRegeneration = useChatStore(s => s.prepareRegeneration)

  // Chat zoom (Ctrl+= / Ctrl+- / Ctrl+0)
  const [chatZoom, setChatZoom] = useState(100) // percentage

  // Compute bookmarked messages
  const bookmarkedMessages = useMemo(() => {
    return messages
      .map((msg, idx) => ({ msg, idx }))
      .filter(({ msg }) => msg.role !== 'permission' && msg.role !== 'plan' && (msg as StandardChatMessage).bookmarked)
  }, [messages])

  // Compute conversation statistics
  const conversationStats = useMemo(() => {
    const userMsgs = messages.filter(m => m.role === 'user')
    const assistantMsgs = messages.filter(m => m.role === 'assistant')
    const totalWords = messages.reduce((sum, m) => {
      if (m.role === 'permission' || m.role === 'plan') return sum
      const content = (m as StandardChatMessage).content || ''
      return sum + content.split(/\s+/).filter(w => w.length > 0).length
    }, 0)
    const toolUseCount = messages.reduce((sum, m) => {
      if (m.role === 'permission' || m.role === 'plan') return sum
      return sum + ((m as StandardChatMessage).toolUses?.length || 0)
    }, 0)
    const firstTs = messages.length > 0 ? messages[0].timestamp : 0
    const lastTs = messages.length > 0 ? messages[messages.length - 1].timestamp : 0
    const durationMs = lastTs - firstTs
    const durationMin = Math.max(1, Math.round(durationMs / 60000))
    return {
      total: messages.filter(m => m.role !== 'permission' && m.role !== 'plan').length,
      user: userMsgs.length,
      assistant: assistantMsgs.length,
      totalWords,
      toolUseCount,
      durationMin,
    }
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

  // Handle quote reply: prepend quoted text to input
  useEffect(() => {
    if (!quotedText) return
    const lines = quotedText.split('\n').map((l: string) => `> ${l}`).join('\n')
    setInput((prev: string) => {
      const separator = prev.trim() ? '\n\n' : ''
      return `${lines}${separator}${prev}`
    })
    setQuotedText(null)
    // Focus the textarea
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [quotedText, setQuotedText])

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

  // Rotating placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  useEffect(() => {
    if (input.length > 0) return // Don't rotate when user has typed something
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_KEYS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [input.length > 0])

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // Bookmarks dropdown state
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [scrollToMessageIdx, setScrollToMessageIdx] = useState<number | undefined>(undefined)
  const bookmarksRef = useRef<HTMLDivElement>(null)
  const [showStats, setShowStats] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  // Streaming elapsed timer — uses ref for start time to avoid re-render loops
  const streamStartRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (isStreaming) {
      if (!streamStartRef.current) {
        streamStartRef.current = Date.now()
      }
      const tick = () => {
        if (streamStartRef.current) {
          setElapsed(Math.floor((Date.now() - streamStartRef.current) / 1000))
        }
      }
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    } else {
      streamStartRef.current = null
      setElapsed(0)
    }
  }, [isStreaming])

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

  // ── Regenerate last response ────────────────────
  const handleRegenerate = async () => {
    if (isStreaming) return
    const prompt = prepareRegeneration()
    if (prompt) {
      await sendMessage(prompt)
    }
  }

  // Compute whether regeneration is available
  const canRegenerate = !isStreaming && messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'

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
      addToast('success', t('chat.exportSuccess'))
    }
  }, [messages, currentSessionId, addToast])

  // ── Copy conversation to clipboard ──────────────────────────
  const copyConversation = useCallback(async () => {
    if (messages.length === 0) return
    const md = formatMarkdown(messages, currentSessionId, new Date())
    try {
      await navigator.clipboard.writeText(md)
      addToast('success', t('chat.copiedToClipboard'))
    } catch {
      addToast('error', t('chat.copyFailed'))
    }
  }, [messages, currentSessionId, addToast, t])

  // Keyboard shortcut: Ctrl+Shift+E for export
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        exportConversation()
      }
      // Ctrl+Shift+X: Copy conversation to clipboard
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        e.preventDefault()
        copyConversation()
      }
      // Ctrl+F: Open search
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // Ctrl+Shift+Q: Add current input to queue
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
      // Ctrl+Shift+R: Regenerate last response
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        const state = useChatStore.getState()
        if (!state.isStreaming && state.messages.length >= 2 && state.messages[state.messages.length - 1]?.role === 'assistant') {
          const prompt = state.prepareRegeneration()
          if (prompt) sendMessage(prompt)
        }
      }
      // Ctrl+= / Ctrl+-: Chat zoom
      if (e.ctrlKey && !e.shiftKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setChatZoom(z => {
          const next = Math.min(z + 10, 150)
          return next
        })
      }
      if (e.ctrlKey && !e.shiftKey && e.key === '-') {
        e.preventDefault()
        setChatZoom(z => {
          const next = Math.max(z - 10, 70)
          return next
        })
      }
      if (e.ctrlKey && !e.shiftKey && e.key === '0') {
        e.preventDefault()
        setChatZoom(100)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exportConversation, copyConversation, input, addToQueue])

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

  // Close stats dropdown on click outside
  useEffect(() => {
    if (!showStats) return
    const handler = (e: MouseEvent) => {
      if (statsRef.current && !statsRef.current.contains(e.target as Node)) {
        setShowStats(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showStats])

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
      style={{ background: 'var(--bg-chat)', position: 'relative' }}
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

      {/* Chat Header */}
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          background: 'var(--chat-header-bg)',
          flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--chat-header-title)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentSessionTitle
            ? currentSessionTitle
            : currentSessionId
            ? `Session: ${currentSessionId.slice(0, 8)}...`
            : `${prefs.model?.split('-').slice(0, 3).join('-') || 'claude'}`}
        </span>
        {/* Action icons — right side */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          title={`${t('chat.searchConversation')} (Ctrl+F)`}
          style={{
            background: searchOpen ? 'var(--accent)' : 'none',
            border: 'none',
            color: searchOpen ? '#fff' : 'var(--chat-header-icon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={(e) => { if (!searchOpen) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' } }}
          onMouseLeave={(e) => { if (!searchOpen) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' } }}
        >
          <Search size={15} />
        </button>
        <button
          onClick={exportConversation}
          disabled={messages.length === 0}
          title={`${t('chat.export')} (Ctrl+Shift+E)`}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--chat-header-icon)',
            cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            opacity: messages.length === 0 ? 0.3 : 1,
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Download size={15} />
        </button>
        <button
          onClick={copyConversation}
          disabled={messages.length === 0}
          title={`${t('chat.copyConversation')} (Ctrl+Shift+X)`}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--chat-header-icon)',
            cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            opacity: messages.length === 0 ? 0.3 : 1,
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <ClipboardCopy size={15} />
        </button>
        {/* Bookmarks dropdown */}
        <div style={{ position: 'relative' }} ref={bookmarksRef}>
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            title={`${t('chat.bookmarks')} (${bookmarkedMessages.length})`}
            style={{
              background: showBookmarks ? 'var(--accent)' : 'none',
              border: 'none',
              color: showBookmarks ? '#fff' : bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--chat-header-icon)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              flexShrink: 0,
              opacity: bookmarkedMessages.length === 0 && !showBookmarks ? 0.5 : 1,
              transition: 'background 150ms, color 150ms',
              position: 'relative',
            }}
            onMouseEnter={(e) => { if (!showBookmarks) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' } }}
            onMouseLeave={(e) => { if (!showBookmarks) { (e.currentTarget as HTMLButtonElement).style.color = bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' } }}
          >
            <Bookmark size={15} />
            {bookmarkedMessages.length > 0 && (
              <span style={{
                position: 'absolute',
                top: 2,
                right: 2,
                fontSize: 9,
                fontWeight: 600,
                color: '#fff',
                background: 'var(--warning)',
                borderRadius: '50%',
                width: 14,
                height: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}>{bookmarkedMessages.length > 9 ? '9+' : bookmarkedMessages.length}</span>
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
                background: 'var(--input-field-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
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
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>
                      {std.role === 'user' ? t('chat.you') : t('chat.claude')}
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
                background: 'var(--input-field-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                padding: '16px 12px',
                marginTop: 4,
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              {t('chat.noBookmarks')}
              <div style={{ fontSize: 10, marginTop: 4 }}>{t('chat.bookmarkHint')}</div>
            </div>
          )}
        </div>
        {/* Stats popover */}
        <div style={{ position: 'relative' }} ref={statsRef}>
          <button
            onClick={() => setShowStats(!showStats)}
            title={t('chat.stats')}
            disabled={messages.length === 0}
            style={{
              background: showStats ? 'var(--accent)' : 'none',
              border: 'none',
              color: showStats ? '#fff' : 'var(--chat-header-icon)',
              cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              flexShrink: 0,
              opacity: messages.length === 0 ? 0.3 : 1,
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={(e) => { if (!showStats) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' } }}
            onMouseLeave={(e) => { if (!showStats) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' } }}
          >
            <BarChart3 size={15} />
          </button>
          {showStats && messages.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                zIndex: 60,
                width: 220,
                background: 'var(--input-field-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                padding: '12px 14px',
                marginTop: 4,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 10 }}>
                {t('chat.conversationStats')}
              </div>
              {[
                { label: t('chat.statsMessages'), value: conversationStats.total },
                { label: t('chat.statsYourMessages'), value: conversationStats.user },
                { label: t('chat.statsClaudeMessages'), value: conversationStats.assistant },
                { label: t('chat.statsTotalWords'), value: conversationStats.totalWords.toLocaleString() },
                { label: t('chat.statsToolUses'), value: conversationStats.toolUseCount },
                { label: t('chat.statsDuration'), value: `~${conversationStats.durationMin} min` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
                </div>
              ))}
              {useChatStore.getState().totalSessionCost > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('chat.statsSessionCost')}</span>
                  <span style={{ color: 'var(--success)', fontWeight: 500 }}>${useChatStore.getState().totalSessionCost.toFixed(4)}</span>
                </div>
              )}
              {/* Collapse/Expand all actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <button
                  onClick={() => { useChatStore.getState().collapseAll(); setShowStats(false) }}
                  style={{
                    flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '4px 0', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {t('chat.collapseAll')}
                </button>
                <button
                  onClick={() => { useChatStore.getState().expandAll(); setShowStats(false) }}
                  style={{
                    flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '4px 0', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {t('chat.expandAll')}
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={toggleFocusMode}
          title={focusMode ? `${t('chat.exitFocusMode')} (Ctrl+Shift+F)` : `${t('chat.focusMode')} (Ctrl+Shift+F)`}
          style={{
            background: focusMode ? 'var(--accent)' : 'none',
            border: 'none',
            color: focusMode ? '#fff' : 'var(--chat-header-icon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={(e) => { if (!focusMode) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' } }}
          onMouseLeave={(e) => { if (!focusMode) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' } }}
        >
          {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        {elapsedStr && (
          <span style={{
            fontSize: 10,
            color: 'var(--success)',
            fontFamily: 'monospace',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: '2px solid var(--success)',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {elapsedStr}
          </span>
        )}
        <button
          onClick={newConversation}
          title={t('chat.newConversation')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--chat-header-icon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Plus size={15} />
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
        <div style={{ flex: 1, overflow: 'hidden', zoom: chatZoom !== 100 ? `${chatZoom}%` : undefined }}>
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
            onEdit={async (msgId, newContent) => {
              if (isStreaming) return
              useChatStore.getState().editMessageAndTruncate(msgId, newContent)
              await sendMessage(newContent)
            }}
          />
          )}
        </div>
        {isStreaming && <ThinkingIndicator />}
      </div>

      {/* Regenerate button — shown below last assistant message when not streaming */}
      {canRegenerate && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px 8px' }}>
          <button
            onClick={handleRegenerate}
            title={t('chat.regenerate')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              background: 'var(--action-btn-bg)',
              border: '1px solid var(--action-btn-border)',
              borderRadius: 20,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 500,
              transition: 'color 150ms ease, border-color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.color = 'var(--accent)'
              el.style.borderColor = 'var(--accent)'
              el.style.background = 'var(--popup-item-hover)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.color = 'var(--text-muted)'
              el.style.borderColor = 'var(--action-btn-border)'
              el.style.background = 'var(--action-btn-bg)'
            }}
          >
            <RefreshCw size={14} />
            <span>{t('chat.regenerate')}</span>
          </button>
        </div>
      )}

      {/* Zoom indicator -- shown when zoom is not 100% */}
      {chatZoom !== 100 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 16px 4px' }}>
          <button
            onClick={() => setChatZoom(100)}
            title={t('chat.resetZoom')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 12,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 11,
              transition: 'color 150ms ease, border-color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent)'
              e.currentTarget.style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {chatZoom}%
          </button>
        </div>
      )}

      {/* Task Queue Panel -- between messages and input */}
      <TaskQueuePanel />

      {/* Input bar */}
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
          {/* Spacer */}
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
                color: taskQueue.length > 0
                  ? '#a78bfa'
                  : input.trim()
                  ? 'var(--input-toolbar-icon)'
                  : 'var(--input-toolbar-icon)',
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
            {/* Badge */}
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
            // Position cursor at end
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
            {/* Image attachment preview */}
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
            onClick={isStreaming ? abort : handleSend}
            disabled={!isStreaming && !input.trim() && attachments.length === 0}
            title={isStreaming ? 'Stop generating' : 'Send (Enter)'}
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
        {/* Compose status: word/char count */}
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
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  const { messages, pendingToolUses } = useChatStore()
  const [elapsed, setElapsed] = useState(0)

  // Elapsed timer
  useEffect(() => {
    setElapsed(0)
    const id = setInterval(() => setElapsed(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Determine what Claude is currently doing
  let activityLabel = t('message.thinking')
  if (pendingToolUses.size > 0) {
    const [, firstTool] = Array.from(pendingToolUses.entries())[0]
    const toolLabels: Record<string, string> = {
      Bash: t('message.runningCommand'),
      Read: t('message.readingFile'),
      Write: t('message.writingFile'),
      Edit: t('message.editingFile'),
      MultiEdit: t('message.editingFiles'),
      Glob: t('message.searchingFiles'),
      Grep: t('message.searchingContent'),
      WebFetch: t('message.fetchingWebPage'),
      WebSearch: t('message.searchingWeb'),
      LS: t('message.listingDirectory'),
    }
    activityLabel = toolLabels[firstTool.name] || t('message.usingTool', { tool: firstTool.name })
  } else {
    // Check if last message has streaming content
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
      activityLabel = t('message.writing')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 16px',
        alignItems: 'flex-start',
      }}
      aria-live="polite"
      aria-label={`${activityLabel}...`}
      className="message-enter-left"
    >
      {/* Mini AI avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--bubble-ai)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Bot size={16} color="var(--bubble-ai-text)" />
      </div>

      {/* Mini bubble */}
      <div
        style={{
          background: 'var(--bubble-ai)',
          borderRadius: '2px 12px 12px 12px',
          padding: '8px 14px',
          minWidth: 80,
          maxWidth: 200,
        }}
      >
        {/* Dots + activity label row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: `dot-wave 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2, whiteSpace: 'nowrap' }}>
            {activityLabel}...
          </span>
        </div>

        {/* Elapsed timer */}
        <div style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          opacity: 0.7,
          marginTop: 3,
        }}>
          {elapsed}s
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    { icon: FolderSearch, text: 'Analyze code structure' },
    { icon: Bug, text: 'Find and fix a bug' },
    { icon: Sparkles, text: 'Implement a new feature' },
    { icon: FileCode2, text: 'Write an automation script' },
  ]

  const shortcuts = [
    { keys: 'Ctrl+Shift+P', desc: 'Command palette' },
    { keys: 'Ctrl+B', desc: 'Toggle sidebar' },
    { keys: 'Ctrl+`', desc: 'Toggle terminal' },
    { keys: 'Ctrl+L', desc: 'Focus input' },
    { keys: '@file', desc: 'Reference files' },
    { keys: '/cmd', desc: 'Slash commands' },
  ]

  const quickActions = [
    { label: 'Settings', icon: Settings, action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('settings') } },
    { label: 'Terminal', icon: Terminal, action: () => useUiStore.getState().toggleTerminal() },
    { label: 'Files', icon: FolderOpen, action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('files') } },
    { label: 'Shortcuts', icon: Keyboard, action: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' })) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 24, padding: '0 20px' }}>
      {/* Hero icon */}
      <div className="onboard-icon" style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'rgba(0,122,204,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Bot size={48} color="var(--accent)" strokeWidth={1.5} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: 'var(--text-bright)', fontWeight: 700, letterSpacing: '-0.02em' }}>Hello! I'm AIPA</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, maxWidth: 360, lineHeight: 1.7 }}>
          Your AI-powered assistant for coding, analysis, and creative work.
        </div>
      </div>

      {/* Suggestion cards */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {suggestions.map(({ icon: Icon, text }) => (
          <button
            key={text}
            onClick={() => onSuggestion(text)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: '20px 16px',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: 12,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13,
              minWidth: 130,
              maxWidth: 150,
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(0,122,204,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon size={24} color="var(--accent)" />
            </div>
            <span style={{ textAlign: 'center', lineHeight: 1.4 }}>{text}</span>
          </button>
        ))}
      </div>

      {/* Keyboard shortcuts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, auto)',
        gap: '8px 20px',
        padding: '14px 20px',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 10,
      }}>
        {shortcuts.map(({ keys, desc }) => (
          <div key={keys} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <kbd style={{
              background: 'var(--popup-bg)',
              border: '1px solid var(--popup-border)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}>{keys}</kbd>
            <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* Quick action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {quickActions.map(({ label, icon: QIcon, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              padding: '5px 14px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
            }}
          >
            <QIcon size={12} />
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
