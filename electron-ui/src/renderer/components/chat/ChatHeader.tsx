import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, ClipboardCopy, Bookmark, BarChart3, Maximize2, Minimize2, Plus, RefreshCw, Pencil, FolderOpen, ChevronDown, Sparkles } from 'lucide-react'
import { useChatStore, useSessionStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import type { ConversationStats, BookmarkedMessage } from '../../hooks/useConversationStats'
import type { StandardChatMessage } from '../../types/app.types'
import type { Persona } from '../../types/app.types'

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
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showPersonaPicker, setShowPersonaPicker] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const bookmarksRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const personaPickerRef = useRef<HTMLDivElement>(null)
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

  // Close model picker on click outside
  useEffect(() => {
    if (!showModelPicker) return
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelPicker])

  // Close persona picker on click outside
  useEffect(() => {
    if (!showPersonaPicker) return
    const handler = (e: MouseEvent) => {
      if (personaPickerRef.current && !personaPickerRef.current.contains(e.target as Node)) {
        setShowPersonaPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPersonaPicker])

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

  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  const personas: Persona[] = usePrefsStore(s => s.prefs.personas) || []
  const activePersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const activePersona = personas.find(p => p.id === activePersonaId)

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

  /** Get short model display name */
  const getModelShortName = useCallback((modelId: string | undefined): string => {
    if (!modelId) return 'Claude'
    const opt = MODEL_OPTIONS.find(m => m.id === modelId)
    if (opt) {
      // Extract short name from model ID: "claude-sonnet-4-6" -> "Sonnet 4.6"
      const parts = modelId.replace('claude-', '').split('-')
      if (parts.length >= 2) {
        const family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
        const version = parts.slice(1).filter(p => /^\d/.test(p)).join('.')
        return version ? `${family} ${version}` : family
      }
    }
    return modelId.split('-').slice(0, 3).join('-')
  }, [])

  const handleModelSwitch = useCallback((modelId: string) => {
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    setShowModelPicker(false)
    const shortName = getModelShortName(modelId)
    useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: shortName }))
  }, [t, getModelShortName])

  const handlePersonaSwitch = useCallback((persona: Persona | null) => {
    setShowPersonaPicker(false)
    if (!persona) {
      // Deactivate persona
      usePrefsStore.getState().setPrefs({ activePersonaId: undefined, systemPrompt: '' })
      window.electronAPI.prefsSet('activePersonaId', undefined)
      window.electronAPI.prefsSet('systemPrompt', '')
      useUiStore.getState().addToast('info', t('persona.deactivated'))
    } else {
      // Activate persona
      usePrefsStore.getState().setPrefs({
        activePersonaId: persona.id,
        model: persona.model,
        systemPrompt: persona.systemPrompt,
      })
      window.electronAPI.prefsSet('activePersonaId', persona.id)
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', persona.systemPrompt)
      useUiStore.getState().addToast('success', t('persona.switchedTo', { name: persona.name }))
    }
  }, [t])

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

      {/* Model quick-switcher */}
      <div style={{ position: 'relative' }} ref={modelPickerRef}>
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          title={t('chat.switchModel')}
          style={{
            background: showModelPicker ? 'rgba(255,255,255,0.08)' : 'none',
            border: '1px solid transparent',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            flexShrink: 0,
            transition: 'color 150ms, background 150ms, border-color 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
          onMouseLeave={(e) => {
            if (!showModelPicker) {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'transparent'
            }
          }}
        >
          <span>{getModelShortName(model)}</span>
          <ChevronDown size={10} style={{ opacity: 0.6 }} />
        </button>
        {showModelPicker && (
          <div
            role="listbox"
            aria-label={t('chat.switchModel')}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 60,
              width: 220,
              background: 'var(--popup-bg)',
              border: '1px solid var(--popup-border)',
              borderRadius: 8,
              boxShadow: 'var(--popup-shadow)',
              padding: '4px 0',
              marginTop: 4,
              animation: 'popup-in 120ms ease-out',
            }}
          >
            <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
              {t('chat.switchModel')}
            </div>
            {MODEL_OPTIONS.map(opt => {
              const isActive = opt.id === model
              return (
                <button
                  key={opt.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleModelSwitch(opt.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    textAlign: 'left',
                    background: isActive ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'none',
                    border: 'none',
                    padding: '7px 12px',
                    cursor: 'pointer',
                    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'none' }}
                >
                  <span>{t(opt.labelKey)}</span>
                  {isActive && <span style={{ fontSize: 14 }}>&#10003;</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Persona quick-switcher */}
      {personas.length > 0 && (
        <div style={{ position: 'relative' }} ref={personaPickerRef}>
          <button
            onClick={() => setShowPersonaPicker(!showPersonaPicker)}
            title={activePersona ? t('persona.personaActive', { name: activePersona.name }) : t('persona.selectPersona')}
            style={{
              background: showPersonaPicker ? 'rgba(255,255,255,0.08)' : activePersona ? `${activePersona.color}18` : 'none',
              border: `1px solid ${activePersona ? activePersona.color : 'transparent'}`,
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              color: activePersona ? activePersona.color : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              transition: 'color 150ms, background 150ms, border-color 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = activePersona ? activePersona.color : 'var(--accent)'
              if (!activePersona) e.currentTarget.style.borderColor = 'var(--border)'
            }}
            onMouseLeave={(e) => {
              if (!showPersonaPicker) {
                e.currentTarget.style.color = activePersona ? activePersona.color : 'var(--text-muted)'
                if (!activePersona) e.currentTarget.style.borderColor = 'transparent'
              }
            }}
          >
            {activePersona ? (
              <>
                <span style={{ fontSize: 13 }}>{activePersona.emoji}</span>
                <span>{activePersona.name}</span>
              </>
            ) : (
              <>
                <Sparkles size={11} />
                <span>{t('persona.selectPersona')}</span>
              </>
            )}
            <ChevronDown size={10} style={{ opacity: 0.6 }} />
          </button>
          {showPersonaPicker && (
            <div
              role="listbox"
              aria-label={t('persona.selectPersona')}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 60,
                width: 240,
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                borderRadius: 8,
                boxShadow: 'var(--popup-shadow)',
                padding: '4px 0',
                marginTop: 4,
                animation: 'popup-in 120ms ease-out',
              }}
            >
              <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
                {t('persona.selectPersona')}
              </div>
              {/* No persona option */}
              <button
                role="option"
                aria-selected={!activePersonaId}
                onClick={() => handlePersonaSwitch(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  background: !activePersonaId ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'none',
                  border: 'none',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  color: !activePersonaId ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: !activePersonaId ? 600 : 400,
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => { if (activePersonaId) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { if (activePersonaId) e.currentTarget.style.background = 'none' }}
              >
                <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>-</span>
                <span>{t('persona.noPersona')}</span>
                {!activePersonaId && <span style={{ marginLeft: 'auto', fontSize: 14 }}>&#10003;</span>}
              </button>
              {/* Persona options */}
              {personas.map(p => {
                const isActive = p.id === activePersonaId
                return (
                  <button
                    key={p.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handlePersonaSwitch(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      textAlign: 'left',
                      background: isActive ? `${p.color}18` : 'none',
                      border: 'none',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      color: isActive ? p.color : 'var(--text-primary)',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'none' }}
                  >
                    <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{p.emoji}</span>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    {isActive && <span style={{ fontSize: 14 }}>&#10003;</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
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
                  {preview || t('chat.emptyPreview')}
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
              { label: t('chat.statsDuration'), value: t('chat.statsDurationValue', { min: String(conversationStats.durationMin) }) },
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
