import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, ClipboardCopy, Maximize2, Minimize2, Plus, FolderOpen, FileText, FilePlus2, RefreshCw, MessageSquarePlus, X, GitBranch } from 'lucide-react'
import { useChatStore, useSessionStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import ModelPicker from './ModelPicker'
import PersonaPicker from './PersonaPicker'
import BookmarksPanel from './BookmarksPanel'
import StatsPanel from './StatsPanel'
import ChangesPanel from './ChangesPanel'
import { CostBadge, ContextBadge, ContextProgressBar } from './ContextIndicator'
import type { ConversationStats, BookmarkedMessage } from '../../hooks/useConversationStats'
import type { SessionChanges } from '../../hooks/useSessionChanges'
import SaveTemplateDialog from './SaveTemplateDialog'
import CompactButton from './CompactButton'
import WorktreeDialog from './WorktreeDialog'

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
  onCompact: (prompt: string) => void
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
  onCompact,
}: ChatHeaderProps) {
  const t = useT()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [showTempPrompt, setShowTempPrompt] = useState(false)
  const [tempDraft, setTempDraft] = useState('')
  const [showWorktree, setShowWorktree] = useState(false)
  const [isGitRepo, setIsGitRepo] = useState(false)
  const tempPromptRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const tempSystemPrompt = useChatStore(s => s.tempSystemPrompt)
  const setTempSystemPrompt = useChatStore(s => s.setTempSystemPrompt)

  // Close temp prompt popover on outside click
  useEffect(() => {
    if (!showTempPrompt) return
    const handler = (e: MouseEvent) => {
      if (tempPromptRef.current && !tempPromptRef.current.contains(e.target as Node)) {
        setShowTempPrompt(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTempPrompt])

  const openTempPrompt = useCallback(() => {
    setTempDraft(tempSystemPrompt || '')
    setShowTempPrompt(true)
  }, [tempSystemPrompt])

  const applyTempPrompt = useCallback(() => {
    setTempSystemPrompt(tempDraft.trim() || null)
    setShowTempPrompt(false)
  }, [tempDraft, setTempSystemPrompt])

  const clearTempPrompt = useCallback(() => {
    setTempSystemPrompt(null)
    setTempDraft('')
    setShowTempPrompt(false)
  }, [setTempSystemPrompt])
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  // Terminal removed (Iteration 404)

  // Check if current working dir is a git repo (for worktree button)
  useEffect(() => {
    if (!workingDir) { setIsGitRepo(false); return }
    window.electronAPI.worktreeIsGitRepo(workingDir)
      .then(({ isGit }) => setIsGitRepo(isGit))
      .catch(() => setIsGitRepo(false))
  }, [workingDir])

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
    <div style={{ flexShrink: 0 }}>
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 8,
        borderBottom: 'none',
        background: 'var(--chat-header-bg)',
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

      {/* Temp system prompt button (Iteration 523) */}
      <div ref={tempPromptRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={openTempPrompt}
          title={tempSystemPrompt ? t('systemPrompt.tempActive') : t('systemPrompt.tempButton')}
          style={{
            ...headerBtnStyle,
            color: tempSystemPrompt ? 'var(--accent)' : 'var(--chat-header-icon)',
            background: tempSystemPrompt ? 'rgba(59,130,246,0.12)' : 'none',
          }}
          onMouseEnter={(e) => hoverIn(e, !!tempSystemPrompt)}
          onMouseLeave={(e) => hoverOut(e, !!tempSystemPrompt)}
        >
          <MessageSquarePlus size={15} />
        </button>
        {showTempPrompt && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            background: 'var(--popup-bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 12, width: 300, zIndex: 200,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {t('systemPrompt.tempPopoverTitle')}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
              {t('systemPrompt.tempPopoverHint')}
            </div>
            <textarea
              autoFocus
              value={tempDraft}
              onChange={(e) => setTempDraft(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowTempPrompt(false) }}
              placeholder={t('systemPrompt.tempPlaceholder')}
              rows={4}
              style={{
                width: '100%', fontSize: 11, padding: '6px 8px',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 5, color: 'var(--text-primary)', resize: 'vertical',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
              {tempSystemPrompt && (
                <button
                  onClick={clearTempPrompt}
                  style={{
                    fontSize: 11, padding: '4px 10px', background: 'none',
                    border: '1px solid var(--border)', borderRadius: 4,
                    color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <X size={10} />{t('systemPrompt.tempClear')}
                </button>
              )}
              <button
                onClick={applyTempPrompt}
                style={{
                  fontSize: 11, padding: '4px 12px',
                  background: 'var(--accent)', border: 'none', borderRadius: 4,
                  color: '#fff', cursor: 'pointer',
                }}
              >
                {t('systemPrompt.tempSet')}
              </button>
            </div>
          </div>
        )}
      </div>

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

      {/* Save as Template */}
      <button
        onClick={() => setShowSaveTemplate(true)}
        disabled={messageCount === 0}
        title={t('convTemplate.saveAsTemplate')}
        style={{
          ...headerBtnStyle,
          cursor: messageCount === 0 ? 'not-allowed' : 'pointer',
          opacity: messageCount === 0 ? 0.3 : 1,
        }}
        onMouseEnter={(e) => hoverIn(e)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        <FilePlus2 size={15} />
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

      {/* Compact conversation context (Iteration 519: CompactButton with custom instruction popover) */}
      <CompactButton
        style={headerBtnStyle}
        onSend={onCompact}
        isStreaming={isStreaming}
        messageCount={messageCount}
        hoverIn={(e) => hoverIn(e)}
        hoverOut={(e) => hoverOut(e)}
      />

      {/* Git Worktree button — only shown in git repos */}
      {isGitRepo && (
        <button
          onClick={() => setShowWorktree(true)}
          title="Git Worktrees — work on isolated branches"
          style={headerBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <GitBranch size={15} />
        </button>
      )}

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
      <ContextBadge onNewConversation={onNewConversation} />

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

      {/* Save as Template dialog */}
      {showSaveTemplate && (
        <SaveTemplateDialog onClose={() => setShowSaveTemplate(false)} />
      )}

      {/* Worktree dialog */}
      {showWorktree && workingDir && (
        <WorktreeDialog
          cwd={workingDir}
          onClose={() => setShowWorktree(false)}
          onSwitchCwd={(newCwd, branch) => {
            // Switch working directory to the selected worktree
            usePrefsStore.getState().setPrefs({ workingDir: newCwd })
            window.electronAPI.prefsSet('workingDir', newCwd)
            setShowWorktree(false)
          }}
        />
      )}
    </div>
    <ContextProgressBar />
    <div style={{ height: 1, background: 'var(--border)' }} />
    </div>
  )
}
