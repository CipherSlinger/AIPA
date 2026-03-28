import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Upload, RefreshCw, AlertTriangle } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useStreamJson } from '../../hooks/useStreamJson'
import { useStreamingTimer } from '../../hooks/useStreamingTimer'
import { useChatZoom } from '../../hooks/useChatZoom'
import { useConversationSearch } from '../../hooks/useConversationSearch'
import { useConversationStats } from '../../hooks/useConversationStats'
import ChatHeader from './ChatHeader'
import ChatInput from './ChatInput'
import MessageList from './MessageList'
import SearchBar from './SearchBar'
import TaskQueuePanel from './TaskQueuePanel'
import ThinkingIndicator from './ThinkingIndicator'
import WelcomeScreen from './WelcomeScreen'
import FollowUpChips from './FollowUpChips'
import { formatMarkdown } from '../../utils/formatMarkdown'
import { formatHtml } from '../../utils/formatHtml'
import { getTemplateById } from '../../utils/promptTemplates'
import { useT } from '../../i18n'

// Constants for drag-and-drop file handling
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_COUNT = 10

export default function ChatPanel() {
  const t = useT()
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const prefs = usePrefsStore(s => s.prefs)
  const addToast = useUiStore(s => s.addToast)
  const focusMode = useUiStore(s => s.focusMode)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)
  const prepareRegeneration = useChatStore(s => s.prepareRegeneration)
  const lastContextUsage = useChatStore(s => s.lastContextUsage)

  const { sendMessage, abort, respondPermission, grantToolPermission, newConversation } = useStreamJson()

  // Extracted hooks
  const { elapsedStr } = useStreamingTimer(isStreaming)
  const { chatZoom, resetZoom } = useChatZoom()
  const { bookmarkedMessages, conversationStats } = useConversationStats(messages)
  const {
    searchOpen, searchQuery, searchMatches, currentMatchIdx,
    handleSearch, handleSearchNavigate, handleSearchClose, setSearchOpen,
  } = useConversationSearch(messages)

  // Scroll-to-message state (for bookmarks panel)
  const [scrollToMessageIdx, setScrollToMessageIdx] = useState<number | undefined>(undefined)

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [contextWarningDismissed, setContextWarningDismissed] = useState(false)

  // Context window usage warning
  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null
  const showContextWarning = contextPct !== null && contextPct >= 80 && !contextWarningDismissed

  // Reset context warning when session changes
  useEffect(() => {
    setContextWarningDismissed(false)
  }, [currentSessionId])

  // Regeneration
  const canRegenerate = !isStreaming && messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'

  // Compute last assistant message content for follow-up suggestions
  const lastAssistantContent = useMemo(() => {
    if (isStreaming || messages.length === 0) return ''
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      return (last as StandardChatMessage).content || ''
    }
    return ''
  }, [messages, isStreaming])

  const handleRegenerate = async () => {
    if (isStreaming) return
    const prompt = prepareRegeneration()
    if (prompt) {
      await sendMessage(prompt)
    }
  }

  // ── Export conversation ──────────────────────────
  const exportConversation = useCallback(async () => {
    if (messages.length === 0) return
    const now = new Date()
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `aipa-export-${ts}`
    const filePath = await window.electronAPI.fsShowSaveDialog(defaultName, [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'JSON', extensions: ['json'] },
    ])
    if (!filePath) return

    const isJson = filePath.toLowerCase().endsWith('.json')
    const isHtml = filePath.toLowerCase().endsWith('.html') || filePath.toLowerCase().endsWith('.htm')
    let content: string

    if (isJson) {
      content = JSON.stringify(messages, null, 2)
    } else if (isHtml) {
      content = formatHtml(messages, currentSessionId, now, currentSessionTitle, prefs.model)
    } else {
      content = formatMarkdown(messages, currentSessionId, now, currentSessionTitle, prefs.model)
    }

    const result = await window.electronAPI.fsWriteFile(filePath, content)
    if (result?.error) {
      addToast('error', t('chat.exportFailed', { error: result.error }))
    } else {
      addToast('success', t('chat.exportSuccess'))
    }
  }, [messages, currentSessionId, addToast, t])

  // ── Copy conversation to clipboard ──────────────────────────
  const copyConversation = useCallback(async () => {
    if (messages.length === 0) return
    const md = formatMarkdown(messages, currentSessionId, new Date(), currentSessionTitle, prefs.model)
    try {
      await navigator.clipboard.writeText(md)
      addToast('success', t('chat.copiedToClipboard'))
    } catch {
      addToast('error', t('chat.copyFailed'))
    }
  }, [messages, currentSessionId, addToast, t])

  // ── Global keyboard shortcuts ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        exportConversation()
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        e.preventDefault()
        copyConversation()
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // Ctrl+Shift+F: Global cross-session search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        // Open sidebar to history tab and trigger global search focus
        const uiState = useUiStore.getState()
        if (!uiState.sidebarOpen || uiState.sidebarTab !== 'history') {
          uiState.setActiveNavItem('history')
        }
        // Dispatch custom event so SessionList can focus search input
        window.dispatchEvent(new CustomEvent('aipa:globalSearchFocus'))
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        const state = useChatStore.getState()
        if (!state.isStreaming && state.messages.length >= 2 && state.messages[state.messages.length - 1]?.role === 'assistant') {
          const prompt = state.prepareRegeneration()
          if (prompt) sendMessage(prompt)
        }
      }
      // Escape to stop streaming (only when no popup/modal is active)
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const state = useChatStore.getState()
        if (state.isStreaming) {
          // Don't intercept if user is in an input/textarea or a modal is open
          const activeEl = document.activeElement
          const inInput = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement
          const hasModal = document.querySelector('[role="dialog"]') || document.querySelector('.lightbox-overlay')
          if (!inInput && !hasModal) {
            e.preventDefault()
            abort()
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exportConversation, copyConversation, setSearchOpen, sendMessage, abort])

  // Listen for export trigger from CommandPalette
  useEffect(() => {
    const handler = () => exportConversation()
    window.addEventListener('aipa:export', handler)
    return () => window.removeEventListener('aipa:export', handler)
  }, [exportConversation])

  // Listen for slash command from CommandPalette
  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent).detail as string
      if (cmd) sendMessage(cmd)
    }
    window.addEventListener('aipa:slashCommand', handler)
    return () => window.removeEventListener('aipa:slashCommand', handler)
  }, [sendMessage])

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
      addToast('warning', t('chat.tooManyFiles', { max: String(MAX_FILE_COUNT) }))
    }

    const processFiles = files.slice(0, MAX_FILE_COUNT)
    const imageFiles: File[] = []
    const pathFiles: string[] = []

    for (const file of processFiles) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const isImage = IMAGE_EXTENSIONS.includes(ext)

      if (isImage) {
        if (file.size > MAX_FILE_SIZE) {
          addToast('error', t('chat.fileTooLarge', { name: file.name }))
          continue
        }
        imageFiles.push(file)
      } else {
        const filePath = (file as any).path as string
        if (filePath) {
          pathFiles.push(filePath)
        }
      }
    }

    // Dispatch to ChatInput via CustomEvent
    const atPaths = pathFiles.length > 0 ? pathFiles.map(p => `@${p}`).join(' ') : undefined
    window.dispatchEvent(new CustomEvent('aipa:dropFiles', {
      detail: { imageFiles, atPaths }
    }))
  }, [addToast, t])

  // Scroll-to-message handler for bookmarks
  const handleScrollToMessage = useCallback((idx: number) => {
    setScrollToMessageIdx(idx)
    setTimeout(() => setScrollToMessageIdx(undefined), 100)
  }, [])

  const sendText = async (text: string, templateId?: string) => {
    if (!text.trim() || isStreaming) return
    // Auto-activate prompt template if suggestion card provides one
    if (templateId) {
      const template = getTemplateById(templateId)
      if (template && template.prompt) {
        usePrefsStore.getState().setPrefs({ systemPrompt: template.prompt })
        window.electronAPI.prefsSet('systemPrompt', template.prompt)
        addToast('info', t('chat.templateActivated', { name: t(template.labelKey) }))
      }
    }
    await sendMessage(text.trim())
  }

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
            {t('chat.dragDropHint')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('chat.dragDropSubHint')}
          </div>
        </div>
      )}

      {/* Chat Header */}
      <ChatHeader
        sessionTitle={currentSessionTitle}
        sessionId={currentSessionId}
        model={prefs.model}
        isStreaming={isStreaming}
        elapsedStr={elapsedStr}
        messageCount={messages.length}
        searchOpen={searchOpen}
        focusMode={focusMode}
        bookmarkedMessages={bookmarkedMessages}
        conversationStats={conversationStats}
        canRegenerate={canRegenerate}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
        onExport={exportConversation}
        onCopyConversation={copyConversation}
        onToggleFocus={toggleFocusMode}
        onNewConversation={newConversation}
        onRegenerate={handleRegenerate}
        onScrollToMessage={handleScrollToMessage}
      />

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

      {/* Context window warning banner */}
      {showContextWarning && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: contextPct! >= 90 ? 'rgba(248, 113, 113, 0.15)' : 'rgba(251, 191, 36, 0.15)',
            borderBottom: `1px solid ${contextPct! >= 90 ? 'rgba(248, 113, 113, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
            fontSize: 12,
            color: contextPct! >= 90 ? '#f87171' : '#fbbf24',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {t('chat.contextWarning', { percent: String(contextPct) })}
          </span>
          <button
            onClick={() => newConversation()}
            style={{
              background: contextPct! >= 90 ? 'rgba(248, 113, 113, 0.2)' : 'rgba(251, 191, 36, 0.2)',
              border: `1px solid ${contextPct! >= 90 ? 'rgba(248, 113, 113, 0.4)' : 'rgba(251, 191, 36, 0.4)'}`,
              borderRadius: 4,
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: 11,
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {t('chat.newConversation')}
          </button>
          <button
            onClick={() => setContextWarningDismissed(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              opacity: 0.6,
              padding: '2px 4px',
              fontSize: 14,
              lineHeight: 1,
              flexShrink: 0,
            }}
            title={t('error.dismiss')}
          >
            x
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'hidden', zoom: chatZoom !== 100 ? `${chatZoom}%` : undefined }}>
          {messages.length === 0 ? (
            <WelcomeScreen
              onSuggestion={sendText}
              onOpenSession={(sessionId) => {
                window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: sessionId }))
              }}
            />
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

      {/* Regenerate button */}
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

      {/* Follow-up suggestion chips */}
      {lastAssistantContent && !isStreaming && (
        <FollowUpChips
          lastAssistantContent={lastAssistantContent}
          onSelect={(prompt) => sendMessage(prompt)}
        />
      )}

      {/* Zoom indicator */}
      {chatZoom !== 100 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 16px 4px' }}>
          <button
            onClick={resetZoom}
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

      {/* Task Queue Panel */}
      <TaskQueuePanel />

      {/* Input bar */}
      <ChatInput
        isStreaming={isStreaming}
        onSend={sendMessage}
        onAbort={abort}
        onNewConversation={newConversation}
      />
    </div>
  )
}
