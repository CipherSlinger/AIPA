import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Upload, AlertTriangle, StickyNote, X, Check } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore, getTabScrollTop } from '../../store'
import { StandardChatMessage, Note, NoteCategory } from '../../types/app.types'
import { useStreamJson } from '../../hooks/useStreamJson'
import { useStreamingTimer } from '../../hooks/useStreamingTimer'
import { useChatZoom } from '../../hooks/useChatZoom'
import { useConversationSearch } from '../../hooks/useConversationSearch'
import { useConversationStats } from '../../hooks/useConversationStats'
import { useSessionChanges } from '../../hooks/useSessionChanges'
import { useConversationExport } from './useConversationExport'
import { useDragAndDrop } from './useDragAndDrop'
import { useChatPanelShortcuts } from './useChatPanelShortcuts'
import { useChatPanelEvents } from './useChatPanelEvents'
import ChatHeader from './ChatHeader'
import ChatInput from './ChatInput'
import MessageList from './MessageList'
import SearchBar from './SearchBar'
import TaskQueuePanel from './TaskQueuePanel'
import TaskDashboard from './TaskDashboard'
import ThinkingIndicator from './ThinkingIndicator'
import WelcomeScreen from './WelcomeScreen'
import FollowUpChips from './FollowUpChips'
import TokenUsageBar from './TokenUsageBar'
import IdleReturnDialog from './IdleReturnDialog'
import PinnedNoteStrip from './PinnedNoteStrip'
import RegenerateButton from './RegenerateButton'
import CompareView from './CompareView'
import SpeculationCard from './SpeculationCard'
import SpeculationStatusBar from './SpeculationStatusBar'
import TabBar from './TabBar'
import ExportDialog from './ExportDialog'
import ToolApprovalDialog from './ToolApprovalDialog'
import PlanApprovalCard from './PlanApprovalCard'
import DreamTaskCard from './DreamTaskCard'
import { getTemplateById } from '../../utils/promptTemplates'
import { useT } from '../../i18n'
import { useIdleReturn } from '../../hooks/useIdleReturn'
import { useAwaySummary } from '../../hooks/useAwaySummary'
import { useSpeculation } from '../../hooks/useSpeculation'

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
  const sessionNotes = useUiStore(s => s.sessionNotes)
  const setSessionNote = useUiStore(s => s.setSessionNote)
  const removeSessionNote = useUiStore(s => s.removeSessionNote)
  const pinnedNoteIds = useUiStore(s => s.pinnedNoteIds)
  const removePinnedNoteId = useUiStore(s => s.removePinnedNoteId)
  const prepareRegeneration = useChatStore(s => s.prepareRegeneration)
  const lastContextUsage = useChatStore(s => s.lastContextUsage)
  const totalSessionCost = useChatStore(s => s.totalSessionCost)
  const pendingPlanApproval = useChatStore(s => s.pendingPlanApproval)
  const setPendingPlanApproval = useChatStore(s => s.setPendingPlanApproval)
  const dreamEvents = useChatStore(s => s.dreamEvents)
  // Tab state (Iteration 515)
  const activeTabId = useChatStore(s => s.activeTabId)
  const setTabScrollTop = useChatStore(s => s.setTabScrollTop)
  const tabCount = useChatStore(s => s.tabs.length)

  // Keep the active tab title in sync with session title changes
  const updateTabTitle = useChatStore(s => s.updateTabTitle)
  useEffect(() => {
    if (activeTabId && currentSessionTitle) {
      updateTabTitle(activeTabId, currentSessionTitle)
    }
  }, [activeTabId, currentSessionTitle, updateTabTitle])

  const { sendMessage, abort, respondPermission, respondHookCallback, respondElicitation, grantToolPermission, alwaysAllowTool, alwaysDenyTool, newConversation } = useStreamJson()

  // Extracted hooks
  const { elapsedStr } = useStreamingTimer(isStreaming)
  const { chatZoom, resetZoom } = useChatZoom()
  const { bookmarkedMessages, conversationStats } = useConversationStats(messages)
  const sessionChanges = useSessionChanges(messages)
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

  // Export dialog state
  const [showExport, setShowExport] = useState(false)

  useChatPanelShortcuts(() => setShowExport(true), copyConversation, setSearchOpen, sendMessage, abort)

  // Idle return detection
  const { showDialog: showIdleDialog, idleDuration, awaySummary, summaryLoading, dismiss: dismissIdle, suppressForever: suppressIdleForever } = useIdleReturn()

  // Away summary — injects summary card into chat after 5min of window blur (Iteration 481)
  useAwaySummary(isStreaming)

  // Speculation — pre-executes prompt suggestions in an isolated sandbox (Iteration 489)
  const speculationCwd = prefs.workingDir || ''
  const { status: specStatus, result: specResult, accept: specAccept, reject: specReject, abortCurrent: specAbort } = useSpeculation(
    isStreaming,
    speculationCwd,
  )

  // Pinned note editing state (Iteration 434)
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')

  // Compare mode (Iteration 456): shows two branches side by side
  const [compareMode, setCompareMode] = useState<{ sessionA: string; sessionB: string; forkMessageIndex?: number; titleA?: string; titleB?: string } | null>(null)

  // Event listeners + budget warning (extracted Iteration 441)
  useChatPanelEvents(
    currentSessionId, isStreaming, totalSessionCost, prefs.maxBudgetUsd,
    sendMessage, sessionNotes, setEditingNote, setNoteText, newConversation,
  )

  // Scroll-to-message state (for bookmarks panel)
  const [scrollToMessageIdx, setScrollToMessageIdx] = useState<number | undefined>(undefined)
  const [contextWarningDismissed, setContextWarningDismissed] = useState(false)

  const currentNote = currentSessionId ? sessionNotes[currentSessionId] : undefined

  // Pinned note from Notes panel (Iteration 439)
  const pinnedNoteId = currentSessionId ? pinnedNoteIds[currentSessionId] : undefined
  const allNotes: Note[] = prefs.notes || []
  const noteCategories: NoteCategory[] = prefs.noteCategories || []
  const pinnedNote = pinnedNoteId ? allNotes.find(n => n.id === pinnedNoteId) : undefined

  // Context window usage warning
  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null
  const showContextWarning = contextPct !== null && contextPct >= 80 && !contextWarningDismissed

  useEffect(() => {
    setContextWarningDismissed(false)
  }, [currentSessionId])

  // Handle slash command events dispatched from useInputPopups
  useEffect(() => {
    const handleOpenExport = () => setShowExport(true)
    window.addEventListener('aipa:openExport', handleOpenExport)
    return () => window.removeEventListener('aipa:openExport', handleOpenExport)
  }, [])

  // Regeneration
  const canRegenerate = !isStreaming && messages.length >= 2 && messages[messages.length - 1]?.role === 'assistant'

  // STABILITY (Iteration 308): Use a stable selector to avoid recomputing on every
  // streaming RAF flush. During streaming, messages array reference changes every frame
  // but we only need this value when streaming STOPS. Depend on isStreaming + length +
  // last message role, NOT the full messages array, to prevent unnecessary re-renders.
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined
  const lastMsgRole = lastMsg?.role
  const lastMsgContent = lastMsgRole === 'assistant' ? (lastMsg as StandardChatMessage).content || '' : ''
  const lastAssistantContent = useMemo(() => {
    if (isStreaming || messages.length === 0) return ''
    return lastMsgContent
  }, [isStreaming, messages.length, lastMsgContent])

  const handleRegenerate = async () => {
    if (isStreaming) return
    const prompt = prepareRegeneration()
    if (prompt) {
      await sendMessage(prompt)
    }
  }

  const handleRegenerateWithModel = async (modelId: string) => {
    if (isStreaming) return
    // Temporarily set model
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    const prompt = prepareRegeneration()
    if (prompt) {
      await sendMessage(prompt)
    }
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

  // Fork handler (Iteration 456)
  const handleFork = useCallback(async (msgIdx: number) => {
    if (!currentSessionId || isStreaming) return
    try {
      const result = await window.electronAPI.sessionFork(currentSessionId, msgIdx) as { sessionId?: string } | string | null
      const newSessionId = typeof result === 'string' ? result : (result as { sessionId?: string })?.sessionId
      if (!newSessionId) {
        addToast('error', t('fork.forkFailed'))
        return
      }
      // Record fork metadata in prefs
      const forkingMsg = messages[msgIdx] as StandardChatMessage
      const forkKey = `${currentSessionId}:${forkingMsg?.id || msgIdx}`
      const existingForkMap = prefs.forkMap || {}
      const updatedForkMap = {
        ...existingForkMap,
        [forkKey]: {
          sourceSessionId: currentSessionId,
          forkMessageIndex: msgIdx,
          forkedSessionId: newSessionId,
          forkedSessionTitle: `(Fork from ${currentSessionTitle || currentSessionId.slice(0, 8)})`,
        },
      }
      usePrefsStore.getState().setPrefs({ forkMap: updatedForkMap })
      window.electronAPI.prefsSet('forkMap', updatedForkMap)
      addToast('success', t('fork.switchingToast'))
      // Open the forked session
      window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: newSessionId }))
    } catch {
      addToast('error', t('fork.forkFailed'))
    }
  }, [currentSessionId, currentSessionTitle, isStreaming, messages, prefs.forkMap, addToast, t])

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-chat)', position: 'relative', borderRight: '1px solid var(--border)' }}
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
            background: 'rgba(99,102,241,0.12)',
            border: '3px dashed rgba(99,102,241,0.55)',
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
          <Upload size={48} style={{ color: '#818cf8' }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('chat.dragDropHint')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('chat.dragDropSubHint')}
          </div>
        </div>
      )}

      {/* Tab Bar (Iteration 515) — only visible with 2+ tabs */}
      <TabBar />

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
        sessionChanges={sessionChanges}
        canRegenerate={canRegenerate}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
        onExport={() => setShowExport(true)}
        onCopyConversation={copyConversation}
        onToggleFocus={() => useUiStore.getState().setMainView('department')}
        onNewConversation={newConversation}
        onRegenerate={handleRegenerate}
        onScrollToMessage={handleScrollToMessage}
        onExportBookmarks={exportBookmarks}
        onSummarize={handleSummarize}
        onCompact={sendMessage}
      />

      {/* Token usage progress bar */}
      <TokenUsageBar />

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

      {/* Pinned Note banner (Iteration 434) */}
      {currentSessionId && editingNote && !currentNote && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          background: 'rgba(99,102,241,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(99,102,241,0.15)',
          fontSize: 12,
          flexShrink: 0,
          minHeight: 28,
        }}>
          <StickyNote size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
          <input
            autoFocus
            onChange={e => setNoteText(e.target.value.slice(0, 200))}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (noteText.trim()) setSessionNote(currentSessionId, noteText.trim())
                setEditingNote(false)
              }
              if (e.key === 'Escape') setEditingNote(false)
            }}
            placeholder={t('session.addNote')}
            maxLength={200}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            style={{
              flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '2px 6px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{noteText.length}/200</span>
          <button onClick={() => { if (noteText.trim()) setSessionNote(currentSessionId, noteText.trim()); setEditingNote(false) }}
            style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', display: 'flex', padding: 2 }}>
            <Check size={12} />
          </button>
          <button onClick={() => setEditingNote(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
            <X size={12} />
          </button>
        </div>
      )}
      {currentSessionId && currentNote && !editingNote && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          background: 'rgba(99,102,241,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(99,102,241,0.15)',
          fontSize: 12,
          flexShrink: 0,
          minHeight: 28,
        }}>
          <StickyNote size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
          <span
            style={{ flex: 1, color: 'var(--text-secondary)', fontStyle: 'italic', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => { setNoteText(currentNote || ''); setEditingNote(true) }}
            title={t('session.editNote')}
          >
            {currentNote}
          </span>
          <button
            onClick={() => { removeSessionNote(currentSessionId); setEditingNote(false) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2, opacity: 0.5 }}
            title={t('session.removeNote')}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Pinned note strip (Iteration 439) */}
      {pinnedNote && currentSessionId && (
        <PinnedNoteStrip
          note={pinnedNote}
          categories={noteCategories}
          onUnpin={() => removePinnedNoteId(currentSessionId)}
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
              borderRadius: 6,
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: 11,
              fontWeight: 500,
              flexShrink: 0,
              transition: 'all 0.15s ease',
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
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            title={t('error.dismiss')}
          >
            <X size={13} />
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
            onAlwaysAllow={alwaysAllowTool}
            onAlwaysDeny={alwaysDenyTool}
            onRespondHookCallback={respondHookCallback}
            onRespondElicitation={respondElicitation}
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
            onFork={handleFork}
          />
          )}
        </div>
        {isStreaming && <ThinkingIndicator />}
      </div>

      {/* Regenerate button with model picker (extracted Iteration 441) */}
      {canRegenerate && (
        <RegenerateButton
          onRegenerate={handleRegenerate}
          onRegenerateWithModel={handleRegenerateWithModel}
        />
      )}

      {/* Speculative preview card — shows pre-executed result for next likely prompt (Iteration 489) */}
      {(specStatus === 'running' || specStatus === 'ready') && !isStreaming && (
        <SpeculationCard
          status={specStatus}
          result={specResult}
          onAccept={async () => {
            const accepted = await specAccept()
            if (accepted) {
              // Inject the speculated exchange into the main session as if the user sent it
              sendMessage(accepted.prompt)
            }
          }}
          onReject={specReject}
        />
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
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#818cf8'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
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

      {/* Task Dashboard — visual task flow (Iteration 550) */}
      <TaskDashboard />

      {/* Task Queue Panel */}
      <TaskQueuePanel />

      {/* Speculation status bar — compact banner above input while speculation runs/is ready */}
      {!isStreaming && (specStatus === 'running' || specStatus === 'ready') && (
        <SpeculationStatusBar
          status={specStatus}
          result={specResult}
          onAccept={async () => {
            const accepted = await specAccept()
            if (accepted) {
              sendMessage(accepted.prompt)
            }
          }}
          onReject={specReject}
          onAbort={specAbort}
        />
      )}

      {/* Plan Approval Card — multi-agent plan approval protocol (P3-3) */}
      {pendingPlanApproval && (
        <PlanApprovalCard
          sessionId={pendingPlanApproval.sessionId}
          requestId={pendingPlanApproval.requestId}
          from={pendingPlanApproval.from}
          planContent={pendingPlanApproval.planContent}
          planFilePath={pendingPlanApproval.planFilePath}
          onApprove={(requestId) => {
            window.electronAPI?.cliRespondPlanApproval?.({
              sessionId: pendingPlanApproval.sessionId,
              requestId,
              approved: true,
            })
            setPendingPlanApproval(null)
          }}
          onReject={(requestId, feedback) => {
            window.electronAPI?.cliRespondPlanApproval?.({
              sessionId: pendingPlanApproval.sessionId,
              requestId,
              approved: false,
              feedback,
            })
            setPendingPlanApproval(null)
          }}
        />
      )}

      {/* Dream Task Card — memory consolidation events (P3-2) */}
      {dreamEvents.length > 0 && (
        <DreamTaskCard events={dreamEvents} />
      )}

      {/* Input bar */}
      <ChatInput
        isStreaming={isStreaming}
        sessionId={currentSessionId}
        onSend={sendMessage}
        onAbort={abort}
        onNewConversation={newConversation}
      />

      {/* Idle return dialog */}
      {showIdleDialog && (
        <IdleReturnDialog
          idleDuration={idleDuration}
          awaySummary={awaySummary}
          summaryLoading={summaryLoading}
          onContinue={dismissIdle}
          onNewConversation={newConversation}
          onNeverAsk={suppressIdleForever}
        />
      )}

      {/* Compare View (Iteration 456) */}
      {compareMode && (
        <CompareView
          sessionA={compareMode.sessionA}
          sessionB={compareMode.sessionB}
          titleA={compareMode.titleA}
          titleB={compareMode.titleB}
          forkMessageIndex={compareMode.forkMessageIndex}
          onClose={() => setCompareMode(null)}
        />
      )}

      {/* Export Dialog */}
      {showExport && (
        <ExportDialog onClose={() => setShowExport(false)} />
      )}

      {/* Tool Approval Dialog — floating modal for permission requests (non-bypass modes) */}
      <ToolApprovalDialog onRespond={respondPermission} />
    </div>
  )
}
