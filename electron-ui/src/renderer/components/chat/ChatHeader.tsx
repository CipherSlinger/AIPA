import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, ClipboardCopy, Bookmark, BarChart3, Maximize2, Minimize2, Plus, RefreshCw, Pencil } from 'lucide-react'
import { useChatStore, useSessionStore } from '../../store'
import { useT } from '../../i18n'
import type { ConversationStats, BookmarkedMessage } from '../../hooks/useConversationStats'
import type { StandardChatMessage } from '../../types/app.types'

interface ChatHeaderProps {
  sessionTitle: string | null
  sessionId: string | null
  model: string | undefined
  isStreaming: boolean
  elapsedStr: string | null
  messageCount: number
  searchOpen: boolean
  focusMode: boolean
  bookmarkedMessages: BookmarkedMessage[]
  conversationStats: ConversationStats
  canRegenerate: boolean
  onToggleSearch: () => void
  onExport: () => void
  onCopyConversation: () => void
  onToggleFocus: () => void
  onNewConversation: () => void
  onRegenerate: () => void
  onScrollToMessage: (idx: number) => void
}

export default function ChatHeader({
  sessionTitle,
  sessionId,
  model,
  isStreaming,
  elapsedStr,
  messageCount,
  searchOpen,
  focusMode,
  bookmarkedMessages,
  conversationStats,
  canRegenerate,
  onToggleSearch,
  onExport,
  onCopyConversation,
  onToggleFocus,
  onNewConversation,
  onRegenerate,
  onScrollToMessage,
}: ChatHeaderProps) {
  const t = useT()
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const bookmarksRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

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

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleTitleClick = useCallback(() => {
    if (!sessionId || isStreaming) return
    const currentTitle = sessionTitle || ''
    setEditTitleValue(currentTitle)
    setIsEditingTitle(true)
  }, [sessionId, sessionTitle, isStreaming])

  const commitTitleEdit = useCallback(() => {
    const newTitle = editTitleValue.trim()
    setIsEditingTitle(false)
    if (!newTitle || !sessionId || newTitle === sessionTitle) return
    // Rename via IPC and update stores
    window.electronAPI.sessionRename(sessionId, newTitle)
    useChatStore.getState().setSessionTitle(newTitle)
    // Refresh session list to reflect the new title
    window.electronAPI.sessionList().then((list: any) => {
      if (list) {
        useSessionStore.getState().setSessions(list)
      }
    }).catch(() => {})
  }, [editTitleValue, sessionId, sessionTitle])

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false)
  }, [])

  const headerBtnStyle: React.CSSProperties = {
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
  }

  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>, active = false) => {
    if (!active) {
      (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-header-icon-hover)'
      ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
    }
  }

  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>, active = false, defaultColor = 'var(--chat-header-icon)') => {
    if (!active) {
      (e.currentTarget as HTMLButtonElement).style.color = defaultColor
      ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
    }
  }

  return (
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
      {/* Session title -- editable on click */}
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          value={editTitleValue}
          onChange={(e) => setEditTitleValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTitleEdit()
            if (e.key === 'Escape') cancelTitleEdit()
          }}
          onBlur={commitTitleEdit}
          maxLength={100}
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-bright)',
            background: 'var(--input-field-bg)',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            padding: '2px 8px',
            outline: 'none',
            fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
      ) : (
        <span
          onClick={handleTitleClick}
          title={sessionId ? t('chat.clickToRename') : undefined}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--chat-header-title)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: sessionId && !isStreaming ? 'pointer' : 'default',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => { if (sessionId && !isStreaming) (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--chat-header-title)' }}
        >
          {sessionTitle
            ? sessionTitle
            : sessionId
            ? `Session: ${sessionId.slice(0, 8)}...`
            : `${model?.split('-').slice(0, 3).join('-') || 'claude'}`}
        </span>
      )}

      {/* Search toggle */}
      <button
        onClick={onToggleSearch}
        title={`${t('chat.searchConversation')} (Ctrl+F)`}
        style={{
          ...headerBtnStyle,
          background: searchOpen ? 'var(--accent)' : 'none',
          color: searchOpen ? '#fff' : 'var(--chat-header-icon)',
        }}
        onMouseEnter={(e) => hoverIn(e, searchOpen)}
        onMouseLeave={(e) => hoverOut(e, searchOpen)}
      >
        <Search size={15} />
      </button>

      {/* Export */}
      <button
        onClick={onExport}
        disabled={messageCount === 0}
        title={`${t('chat.export')} (Ctrl+Shift+E)`}
        style={{
          ...headerBtnStyle,
          cursor: messageCount === 0 ? 'not-allowed' : 'pointer',
          opacity: messageCount === 0 ? 0.3 : 1,
        }}
        onMouseEnter={(e) => hoverIn(e)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        <Download size={15} />
      </button>

      {/* Copy conversation */}
      <button
        onClick={onCopyConversation}
        disabled={messageCount === 0}
        title={`${t('chat.copyConversation')} (Ctrl+Shift+X)`}
        style={{
          ...headerBtnStyle,
          cursor: messageCount === 0 ? 'not-allowed' : 'pointer',
          opacity: messageCount === 0 ? 0.3 : 1,
        }}
        onMouseEnter={(e) => hoverIn(e)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        <ClipboardCopy size={15} />
      </button>

      {/* Bookmarks dropdown */}
      <div style={{ position: 'relative' }} ref={bookmarksRef}>
        <button
          onClick={() => setShowBookmarks(!showBookmarks)}
          title={`${t('chat.bookmarks')} (${bookmarkedMessages.length})`}
          style={{
            ...headerBtnStyle,
            background: showBookmarks ? 'var(--accent)' : 'none',
            color: showBookmarks ? '#fff' : bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--chat-header-icon)',
            opacity: bookmarkedMessages.length === 0 && !showBookmarks ? 0.5 : 1,
            position: 'relative',
          }}
          onMouseEnter={(e) => hoverIn(e, showBookmarks)}
          onMouseLeave={(e) => hoverOut(e, showBookmarks, bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--chat-header-icon)')}
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
              {t('chat.bookmarks')}
            </div>
            {bookmarkedMessages.map(({ msg, idx }) => {
              const std = msg as StandardChatMessage
              const preview = (std.content || '').slice(0, 80).replace(/\n/g, ' ')
              return (
                <button
                  key={msg.id}
                  onClick={() => {
                    onScrollToMessage(idx)
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
          disabled={messageCount === 0}
          style={{
            ...headerBtnStyle,
            background: showStats ? 'var(--accent)' : 'none',
            color: showStats ? '#fff' : 'var(--chat-header-icon)',
            cursor: messageCount === 0 ? 'not-allowed' : 'pointer',
            opacity: messageCount === 0 ? 0.3 : 1,
          }}
          onMouseEnter={(e) => hoverIn(e, showStats)}
          onMouseLeave={(e) => hoverOut(e, showStats)}
        >
          <BarChart3 size={15} />
        </button>
        {showStats && messageCount > 0 && (
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

      {/* Focus mode toggle */}
      <button
        onClick={onToggleFocus}
        title={focusMode ? `${t('chat.exitFocusMode')} (Ctrl+Shift+F)` : `${t('chat.focusMode')} (Ctrl+Shift+F)`}
        style={{
          ...headerBtnStyle,
          background: focusMode ? 'var(--accent)' : 'none',
          color: focusMode ? '#fff' : 'var(--chat-header-icon)',
        }}
        onMouseEnter={(e) => hoverIn(e, focusMode)}
        onMouseLeave={(e) => hoverOut(e, focusMode)}
      >
        {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>

      {/* Streaming elapsed timer + spinner */}
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

      {/* New conversation */}
      <button
        onClick={onNewConversation}
        title={t('chat.newConversation')}
        style={headerBtnStyle}
        onMouseEnter={(e) => hoverIn(e)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}
