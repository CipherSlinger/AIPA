import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, ClipboardCopy, Maximize2, Minimize2, Plus, FolderOpen, FileText, TerminalSquare, DollarSign, RefreshCw } from 'lucide-react'
import { useChatStore, useSessionStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import ModelPicker from './ModelPicker'
import PersonaPicker from './PersonaPicker'
import BookmarksPanel from './BookmarksPanel'
import StatsPanel from './StatsPanel'
import ChangesPanel from './ChangesPanel'
import type { ConversationStats, BookmarkedMessage } from '../../hooks/useConversationStats'
import type { SessionChanges } from '../../hooks/useSessionChanges'

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
  sessionChanges: SessionChanges
  canRegenerate: boolean
  onToggleSearch: () => void
  onExport: () => void
  onCopyConversation: () => void
  onToggleFocus: () => void
  onNewConversation: () => void
  onRegenerate: () => void
  onScrollToMessage: (idx: number) => void
  onExportBookmarks: () => void
  onSummarize: () => void
}

/** Shared header button styling */
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

/** Inline session cost badge — shows total cost with color thresholds */
function CostBadge() {
  const t = useT()
  const totalCost = useChatStore(s => s.totalSessionCost)
  const addToast = useUiStore(s => s.addToast)

  if (totalCost < 0.01) return null

  const costStr = totalCost < 1 ? `$${totalCost.toFixed(3)}` : `$${totalCost.toFixed(2)}`
  const color = totalCost >= 5 ? 'var(--error)' : totalCost >= 1 ? 'var(--warning)' : 'var(--text-muted)'
  const bgColor = totalCost >= 5 ? 'rgba(239,68,68,0.12)' : totalCost >= 1 ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)'

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(costStr).then(() => {
          addToast('info', t('toolbar.costCopied'))
        }).catch(() => {})
      }}
      title={t('toolbar.sessionTotal', { total: totalCost.toFixed(4) })}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 8px',
        background: bgColor,
        border: `1px solid ${totalCost >= 5 ? 'rgba(239,68,68,0.3)' : totalCost >= 1 ? 'rgba(245,158,11,0.3)' : 'var(--card-border)'}`,
        borderRadius: 12,
        color,
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'monospace',
        flexShrink: 0,
        transition: 'background 150ms, border-color 150ms',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = totalCost >= 5 ? 'rgba(239,68,68,0.3)' : totalCost >= 1 ? 'rgba(245,158,11,0.3)' : 'var(--card-border)'
      }}
    >
      <DollarSign size={10} />
      {costStr}
    </button>
  )
}

/** Compact context window usage indicator */
function ContextBadge() {
  const t = useT()
  const ctx = useChatStore(s => s.lastContextUsage)
  const addToast = useUiStore(s => s.addToast)

  if (!ctx || ctx.total === 0) return null

  const pct = Math.round((ctx.used / ctx.total) * 100)
  if (pct < 5) return null // Don't show when nearly empty

  const color = pct >= 90 ? 'var(--error)' : pct >= 70 ? 'var(--warning)' : 'var(--text-muted)'
  const barColor = pct >= 90 ? 'var(--error)' : pct >= 70 ? 'var(--warning)' : 'var(--accent)'

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(t('toolbar.contextUsed', { percent: String(pct), used: String(ctx.used), total: String(ctx.total) })).then(() => {
          addToast('info', t('toolbar.tokensCopied'))
        }).catch(() => {})
      }}
      title={t('toolbar.contextUsed', { percent: String(pct), used: String(ctx.used), total: String(ctx.total) })}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--card-border)',
        borderRadius: 12,
        color,
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'monospace',
        flexShrink: 0,
        transition: 'border-color 150ms',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)' }}
    >
      <span style={{ fontSize: 9, opacity: 0.7 }}>{t('toolbar.context')}</span>
      <div style={{
        width: 30, height: 4, background: 'rgba(255,255,255,0.08)',
        borderRadius: 2, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: barColor,
          borderRadius: 2, transition: 'width 0.3s ease',
        }} />
      </div>
      <span>{pct}%</span>
    </button>
  )
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
  sessionChanges,
  canRegenerate,
  onToggleSearch,
  onExport,
  onCopyConversation,
  onToggleFocus,
  onNewConversation,
  onRegenerate,
  onScrollToMessage,
  onExportBookmarks,
  onSummarize,
}: ChatHeaderProps) {
  const t = useT()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  const terminalOpen = useUiStore(s => s.terminalOpen)

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
    window.electronAPI.sessionRename(sessionId, newTitle)
    useChatStore.getState().setSessionTitle(newTitle)
    window.electronAPI.sessionList().then((list: any) => {
      if (list) {
        useSessionStore.getState().setSessions(list)
      }
    }).catch(() => {})
  }, [editTitleValue, sessionId, sessionTitle])

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false)
  }, [])

  /** Truncate a path to show only the last N segments */
  const truncatePath = useCallback((p: string, maxSegments = 2): string => {
    if (!p) return ''
    const sep = p.includes('\\') ? '\\' : '/'
    const segments = p.split(sep).filter(Boolean)
    if (segments.length <= maxSegments) return p
    return '...' + sep + segments.slice(-maxSegments).join(sep)
  }, [])

  const handleChangeDir = useCallback(async () => {
    const p = await window.electronAPI.fsShowOpenDialog()
    if (p) {
      usePrefsStore.getState().setPrefs({ workingDir: p })
      useChatStore.getState().setWorkingDir(p)
      window.electronAPI.prefsSet('workingDir', p)
    }
  }, [])

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
      {/* Title + working dir column */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
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
            width: '100%',
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
            ? t('chat.sessionPrefix', { id: sessionId.slice(0, 8) })
            : `${model?.split('-').slice(0, 3).join('-') || 'claude'}`}
        </span>
      )}

      {/* Working directory indicator */}
      <span
        onClick={handleChangeDir}
        title={`${t('chat.workingDir')}: ${workingDir || t('chat.workingDirDefault')}\n${t('chat.clickToChangeDir')}`}
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          transition: 'color 150ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
        {workingDir ? truncatePath(workingDir) : t('chat.workingDirDefault')}
      </span>
      </div>

      {/* Model quick-switcher (extracted) */}
      <ModelPicker model={model} />

      {/* Persona quick-switcher (extracted) */}
      <PersonaPicker />

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

      {/* Summarize conversation */}
      <button
        onClick={onSummarize}
        disabled={messageCount < 2 || isStreaming}
        title={t('chat.summarize')}
        style={{
          ...headerBtnStyle,
          cursor: messageCount < 2 || isStreaming ? 'not-allowed' : 'pointer',
          opacity: messageCount < 2 || isStreaming ? 0.3 : 1,
        }}
        onMouseEnter={(e) => hoverIn(e)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        <FileText size={15} />
      </button>

      {/* Regenerate last response */}
      <button
        onClick={onRegenerate}
        disabled={!canRegenerate || isStreaming}
        title={`${t('chat.regenerate')} (Ctrl+Shift+R)`}
        style={{
          ...headerBtnStyle,
          cursor: !canRegenerate || isStreaming ? 'not-allowed' : 'pointer',
          opacity: !canRegenerate || isStreaming ? 0.3 : 1,
        }}
        onMouseEnter={(e) => hoverIn(e)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        <RefreshCw size={15} />
      </button>

      {/* Bookmarks dropdown (extracted) */}
      <BookmarksPanel
        bookmarkedMessages={bookmarkedMessages}
        onScrollToMessage={onScrollToMessage}
        onExportBookmarks={bookmarkedMessages.length > 0 ? onExportBookmarks : undefined}
        headerBtnStyle={headerBtnStyle}
        hoverIn={hoverIn}
        hoverOut={hoverOut}
      />

      {/* Session changes panel (extracted) */}
      <ChangesPanel
        sessionChanges={sessionChanges}
        headerBtnStyle={headerBtnStyle}
        hoverIn={hoverIn}
        hoverOut={hoverOut}
      />

      {/* Stats popover (extracted) */}
      <StatsPanel
        messageCount={messageCount}
        conversationStats={conversationStats}
        headerBtnStyle={headerBtnStyle}
        hoverIn={hoverIn}
        hoverOut={hoverOut}
      />

      {/* Terminal toggle — opens PTY with current session context */}
      <button
        onClick={() => {
          const ui = useUiStore.getState()
          const chatStore = useChatStore.getState()
          // Store the current Claude session ID so the PTY can resume it
          if (chatStore.currentSessionId && !ui.terminalOpen) {
            ui.setTerminalResumeSessionId(chatStore.currentSessionId)
          }
          ui.toggleTerminal()
        }}
        title={`${t('chat.openTerminal')} (Ctrl+\`)`}
        style={{
          ...headerBtnStyle,
          background: terminalOpen ? 'var(--accent)' : 'none',
          color: terminalOpen ? '#fff' : 'var(--chat-header-icon)',
        }}
        onMouseEnter={(e) => hoverIn(e, terminalOpen)}
        onMouseLeave={(e) => hoverOut(e, terminalOpen)}
      >
        <TerminalSquare size={15} />
      </button>

      {/* Focus mode toggle */}
      <button
        onClick={onToggleFocus}
        title={focusMode ? `${t('chat.exitFocusMode')} (Ctrl+Shift+O)` : `${t('chat.focusMode')} (Ctrl+Shift+O)`}
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

      {/* Session cost badge — visible when cost > $0.01, color-coded by threshold */}
      <CostBadge />

      {/* Context window usage indicator — visible when > 5% used */}
      <ContextBadge />

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
