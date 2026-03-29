import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Upload, RefreshCw, AlertTriangle, ChevronDown } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useStreamJson } from '../../hooks/useStreamJson'
import { useStreamingTimer } from '../../hooks/useStreamingTimer'
import { useChatZoom } from '../../hooks/useChatZoom'
import { useConversationSearch } from '../../hooks/useConversationSearch'
import { useConversationStats } from '../../hooks/useConversationStats'
import { useConversationExport } from './useConversationExport'
import { useDragAndDrop } from './useDragAndDrop'
import { useChatPanelShortcuts } from './useChatPanelShortcuts'
import ChatHeader from './ChatHeader'
import ChatInput from './ChatInput'
import MessageList from './MessageList'
import SearchBar from './SearchBar'
import TaskQueuePanel from './TaskQueuePanel'
import ThinkingIndicator from './ThinkingIndicator'
import WelcomeScreen from './WelcomeScreen'
import FollowUpChips from './FollowUpChips'
import { getTemplateById } from '../../utils/promptTemplates'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import { useT } from '../../i18n'

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
    caseSensitive, roleFilter,
    handleSearch, handleSearchNavigate, handleSearchClose, setSearchOpen,
    toggleCaseSensitive, changeRoleFilter,
  } = useConversationSearch(messages)

  const { exportConversation, exportBookmarks, copyConversation } = useConversationExport(
    messages, currentSessionId, currentSessionTitle, prefs.model, bookmarkedMessages, addToast,
  )

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleFileDrop } = useDragAndDrop(addToast)

  useChatPanelShortcuts(exportConversation, copyConversation, setSearchOpen, sendMessage, abort)

  // Listen for external send prompt events (from SelectionToolbar)
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail as string
      if (prompt && !isStreaming) {
        sendMessage(prompt)
      }
    }
    window.addEventListener('aipa:sendPrompt', handler)
    return () => window.removeEventListener('aipa:sendPrompt', handler)
  }, [sendMessage, isStreaming])

  // Scroll-to-message state (for bookmarks panel)
  const [scrollToMessageIdx, setScrollToMessageIdx] = useState<number | undefined>(undefined)
  const [contextWarningDismissed, setContextWarningDismissed] = useState(false)

  // Context window usage warning
  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null
  const showContextWarning = contextPct !== null && contextPct >= 80 && !contextWarningDismissed

  useEffect(() => {
    setContextWarningDismissed(false)
  }, [currentSessionId])

  // Regeneration
  const canRegenerate = !isStreaming && messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'

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

  const [showRegenModels, setShowRegenModels] = useState(false)
  const regenModelRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showRegenModels) return
    const handler = (e: MouseEvent) => {
      if (regenModelRef.current && !regenModelRef.current.contains(e.target as Node)) setShowRegenModels(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRegenModels])

  const handleRegenerateWithModel = async (modelId: string) => {
    if (isStreaming) return
    setShowRegenModels(false)
    // Temporarily set model
    const prevModel = usePrefsStore.getState().prefs.model
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    const prompt = prepareRegeneration()
    if (prompt) {
      await sendMessage(prompt)
    }
    // Note: model stays as the new model after regeneration (intentional -- user chose it)
    void prevModel // suppress unused warning
  }

  const handleScrollToMessage = useCallback((idx: number) => {
    setScrollToMessageIdx(idx)
    setTimeout(() => setScrollToMessageIdx(undefined), 100)
  }, [])

  const sendText = async (text: string, templateId?: string) => {
    if (!text.trim() || isStreaming) return
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

  const handleSummarize = useCallback(async () => {
    if (isStreaming || messages.length < 2) return
    await sendMessage(t('chat.summarizePrompt'))
  }, [isStreaming, messages.length, sendMessage, t])

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
        onExportBookmarks={exportBookmarks}
        onSummarize={handleSummarize}
      />

      {/* Search bar */}
      {searchOpen && (
        <SearchBar
          onSearch={handleSearch}
          onNavigate={handleSearchNavigate}
          onClose={handleSearchClose}
          matchCount={searchMatches.length}
          currentMatch={currentMatchIdx}
          caseSensitive={caseSensitive}
          onToggleCaseSensitive={toggleCaseSensitive}
          roleFilter={roleFilter}
          onChangeRoleFilter={changeRoleFilter}
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
            isStreaming={isStreaming}
            searchQuery={searchQuery}
            searchCaseSensitive={caseSensitive}
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

      {/* Regenerate button with model picker */}
      {canRegenerate && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px 8px' }}>
          <div ref={regenModelRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              onClick={handleRegenerate}
              title={`${t('chat.regenerate')} (Ctrl+Shift+R)`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px 6px 16px',
                background: 'var(--action-btn-bg)',
                border: '1px solid var(--action-btn-border)',
                borderRight: 'none',
                borderRadius: '20px 0 0 20px',
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
              <kbd style={{
                fontSize: 9,
                opacity: 0.5,
                fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.06)',
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.1)',
                marginLeft: 2,
              }}>Ctrl+Shift+R</kbd>
            </button>
            <button
              onClick={() => setShowRegenModels(!showRegenModels)}
              title={t('chat.regenerateWithModel')}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 8px',
                background: showRegenModels ? 'var(--popup-item-hover)' : 'var(--action-btn-bg)',
                border: '1px solid var(--action-btn-border)',
                borderLeft: '1px solid var(--popup-border)',
                borderRadius: '0 20px 20px 0',
                cursor: 'pointer',
                color: showRegenModels ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12,
                transition: 'color 150ms ease, background 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.background = 'var(--popup-item-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = showRegenModels ? 'var(--accent)' : 'var(--text-muted)'
                e.currentTarget.style.background = showRegenModels ? 'var(--popup-item-hover)' : 'var(--action-btn-bg)'
              }}
            >
              <ChevronDown size={12} />
            </button>
            {showRegenModels && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: 4,
                  background: 'var(--popup-bg)',
                  border: '1px solid var(--popup-border)',
                  borderRadius: 8,
                  boxShadow: 'var(--popup-shadow)',
                  padding: '4px 0',
                  minWidth: 200,
                  zIndex: 100,
                  animation: 'popup-in 0.15s ease',
                }}
              >
                <div style={{ padding: '4px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('chat.regenerateWithModel')}
                </div>
                {MODEL_OPTIONS.map(m => {
                  const currentModel = usePrefsStore.getState().prefs.model || 'claude-sonnet-4-6'
                  const isCurrent = m.id === currentModel
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleRegenerateWithModel(m.id)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        padding: '6px 12px',
                        background: 'none',
                        border: 'none',
                        color: isCurrent ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: isCurrent ? 600 : 400,
                        lineHeight: 1.4,
                        transition: 'background 100ms',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                    >
                      <span>{t(m.labelKey)}</span>
                      {isCurrent && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t('chat.currentModel')}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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
        sessionId={currentSessionId}
        onSend={sendMessage}
        onAbort={abort}
        onNewConversation={newConversation}
      />
    </div>
  )
}
