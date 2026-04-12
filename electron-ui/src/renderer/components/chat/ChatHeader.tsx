import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, ClipboardCopy, Maximize2, Minimize2, Plus, FolderOpen, FileText, FilePlus2, RefreshCw, MessageSquarePlus, X, GitBranch, Building2 } from 'lucide-react'
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

/** Shared header button styling — ghost glass */
const headerBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.45)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 8,
  padding: '4px 6px',
  flexShrink: 0,
  transition: 'all 0.15s ease',
}

const hoverIn = (e: React.MouseEvent<HTMLButtonElement>, active = false) => {
  if (!active) {
    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.82)'
    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.09)'
    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.16)'
  }
}

const hoverOut = (e: React.MouseEvent<HTMLButtonElement>, active = false, defaultColor = 'rgba(255,255,255,0.45)') => {
  if (!active) {
    (e.currentTarget as HTMLButtonElement).style.color = defaultColor
    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.10)'
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
  const activeTabId = useChatStore(s => s.activeTabId)
  const tabs = useChatStore(s => s.tabs)
  const setTabCwd = useChatStore(s => s.setTabCwd)
  const currentTab = tabs.find(t => t.id === activeTabId)
  // Effective working dir: per-tab override > global prefs
  const effectiveWorkingDir = currentTab?.cwd || workingDir
  // Terminal removed (Iteration 404)

  // Check if current working dir is a git repo (for worktree button)
  useEffect(() => {
    if (!effectiveWorkingDir) { setIsGitRepo(false); return }
    window.electronAPI.worktreeIsGitRepo(effectiveWorkingDir)
      .then(({ isGit }) => setIsGitRepo(isGit))
      .catch(() => setIsGitRepo(false))
  }, [effectiveWorkingDir])

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Handle /rename slash command
  useEffect(() => {
    const handleRename = () => {
      if (!sessionId || isStreaming) return
      setEditTitleValue(sessionTitle || '')
      setIsEditingTitle(true)
    }
    window.addEventListener('aipa:renameSession', handleRename)
    return () => window.removeEventListener('aipa:renameSession', handleRename)
  }, [sessionId, sessionTitle, isStreaming])

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
      if (activeTabId) {
        // Set cwd on current tab only (per-tab override)
        setTabCwd(activeTabId, p)
      } else {
        // No tabs open — fall back to global prefs
        usePrefsStore.getState().setPrefs({ workingDir: p })
        useChatStore.getState().setWorkingDir(p)
        window.electronAPI.prefsSet('workingDir', p)
      }
    }
  }, [activeTabId, setTabCwd])

  return (
    <div style={{ flexShrink: 0 }}>
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(15,15,25,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
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
            color: 'rgba(255,255,255,0.82)',
            background: 'rgba(255,255,255,0.05)',
            border: 'none',
            borderBottom: '2px solid rgba(99,102,241,0.7)',
            borderRadius: 6,
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
            letterSpacing: '-0.01em',
            color: 'rgba(255,255,255,0.82)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: sessionId && !isStreaming ? 'pointer' : 'not-allowed',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => { if (sessionId && !isStreaming) (e.currentTarget as HTMLElement).style.color = '#818cf8' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.82)' }}
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
        title={`${t('chat.workingDir')}: ${effectiveWorkingDir || t('chat.workingDirDefault')}${currentTab?.cwd ? '' : ' (global)'}
${t('chat.clickToChangeDir')}`}
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#818cf8')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
      >
        <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
        {effectiveWorkingDir ? truncatePath(effectiveWorkingDir) : t('chat.workingDirDefault')}
        {!currentTab?.cwd && effectiveWorkingDir && (
          <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }}>(global)</span>
        )}
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
            color: tempSystemPrompt ? '#818cf8' : 'rgba(255,255,255,0.45)',
            background: tempSystemPrompt ? 'rgba(99,102,241,0.15)' : 'transparent',
          }}
          onMouseEnter={(e) => hoverIn(e, !!tempSystemPrompt)}
          onMouseLeave={(e) => hoverOut(e, !!tempSystemPrompt)}
        >
          <MessageSquarePlus size={15} />
        </button>
        {showTempPrompt && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            background: 'rgba(15,15,25,0.97)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: 12, width: 300, zIndex: 200,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.82)', marginBottom: 4, letterSpacing: '-0.01em' }}>
              {t('systemPrompt.tempPopoverTitle')}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
              {t('systemPrompt.tempPopoverHint')}
            </div>
            <textarea
              autoFocus
              value={tempDraft}
              onChange={(e) => setTempDraft(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowTempPrompt(false) }}
              placeholder={t('systemPrompt.tempPlaceholder')}
              rows={4}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
              style={{
                width: '100%', fontSize: 11, padding: '6px 8px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, color: 'rgba(255,255,255,0.82)', resize: 'vertical',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
              {tempSystemPrompt && (
                <button
                  onClick={clearTempPrompt}
                  style={{
                    fontSize: 11, padding: '4px 10px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8,
                    color: 'rgba(255,255,255,0.60)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <X size={10} />{t('systemPrompt.tempClear')}
                </button>
              )}
              <button
                onClick={applyTempPrompt}
                style={{
                  fontSize: 11, padding: '4px 12px',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))', border: 'none', borderRadius: 8,
                  color: 'rgba(255,255,255,0.95)', cursor: 'pointer', transition: 'all 0.15s ease',
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
          background: searchOpen ? 'rgba(99,102,241,0.15)' : 'transparent',
          color: searchOpen ? '#818cf8' : 'rgba(255,255,255,0.45)',
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

      {/* Return to org chart */}
      <button
        onClick={onToggleFocus}
        title={t('dept.backToOrgChart')}
        style={headerBtnStyle}
        onMouseEnter={(e) => hoverIn(e, false)}
        onMouseLeave={(e) => hoverOut(e, false)}
      >
        <Building2 size={15} />
      </button>

      {/* Session cost badge — visible when cost > $0.01, color-coded by threshold */}
      <CostBadge />

      {/* Context window usage indicator — visible when > 5% used */}
      <ContextBadge onNewConversation={onNewConversation} />

      {/* Streaming elapsed timer + spinner */}
      {elapsedStr && (
        <span style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.38)',
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.9)',
              boxShadow: '0 0 6px rgba(34,197,94,0.5)',
              display: 'inline-block',
              flexShrink: 0,
              animation: 'pulse 1.5s ease-in-out infinite',
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
      {showWorktree && effectiveWorkingDir && (
        <WorktreeDialog
          cwd={effectiveWorkingDir}
          onClose={() => setShowWorktree(false)}
          onSwitchCwd={(newCwd, branch) => {
            // Switch working directory for this tab only (per-tab cwd)
            if (activeTabId) {
              setTabCwd(activeTabId, newCwd)
            } else {
              usePrefsStore.getState().setPrefs({ workingDir: newCwd })
              window.electronAPI.prefsSet('workingDir', newCwd)
            }
            setShowWorktree(false)
          }}
        />
      )}
    </div>
    <ContextProgressBar />
    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}
