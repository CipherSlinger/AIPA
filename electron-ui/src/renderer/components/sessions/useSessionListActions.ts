// useSessionListActions — extracted from SessionList.tsx (Iteration 221)
// Session CRUD, rename, fork, export, global search, multi-select logic
import { useState, useCallback, useEffect } from 'react'
import { SessionListItem, StandardChatMessage, ChatMessage } from '../../types/app.types'
import { useSessionStore, useChatStore, useUiStore, usePrefsStore } from '../../store'
import { parseSessionMessages, generateSmartTitle } from './sessionUtils'
import { useT } from '../../i18n'

export function useSessionListActions() {
  const sessions = useSessionStore(s => s.sessions)
  const setSessions = useSessionStore(s => s.setSessions)
  const setLoading = useSessionStore(s => s.setLoading)
  const clearMessages = useChatStore(s => s.clearMessages)
  const loadHistory = useChatStore(s => s.loadHistory)
  const setSessionId = useChatStore(s => s.setSessionId)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const isStreaming = useChatStore(s => s.isStreaming)
  const addToast = useUiStore(s => s.addToast)
  const t = useT()

  // ── Multi-select mode ──
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
  }, [])

  const toggleSelectId = (sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  // Exit select mode on Escape
  useEffect(() => {
    if (!selectMode) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectMode()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectMode, exitSelectMode])

  // ── Rename state ──
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Global search state ──
  const [globalSearchResults, setGlobalSearchResults] = useState<{ sessionId: string; title?: string; project: string; matchType: 'title' | 'content'; snippet: string; timestamp: number }[]>([])
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [showGlobalResults, setShowGlobalResults] = useState(false)
  const [lastGlobalQuery, setLastGlobalQuery] = useState('')

  const handleGlobalSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setGlobalSearchResults([])
      setShowGlobalResults(false)
      return
    }
    setIsGlobalSearching(true)
    setShowGlobalResults(true)
    setLastGlobalQuery(query)
    try {
      const results = await window.electronAPI.sessionSearch(query, 20)
      setGlobalSearchResults(results)
    } catch {
      setGlobalSearchResults([])
    }
    setIsGlobalSearching(false)
  }, [])

  // ── Session operations ──
  const loadSessions = async () => {
    setLoading(true)
    const list = await window.electronAPI.sessionList()
    setSessions(list || [])
    setLoading(false)
  }

  const openSession = async (session: SessionListItem) => {
    if (renamingId === session.sessionId) return
    const raw = await window.electronAPI.sessionLoad(session.sessionId)
    const chatMessages = parseSessionMessages(raw)
    clearMessages()
    loadHistory(chatMessages)
    setSessionId(session.sessionId)
    // Restore per-session persona (Iteration 407)
    try {
      const savedPersonaId = localStorage.getItem(`aipa:session-persona:${session.sessionId}`)
      if (savedPersonaId) {
        const personas = usePrefsStore.getState().prefs.personas || []
        const persona = personas.find(p => p.id === savedPersonaId)
        if (persona) {
          useChatStore.getState().setSessionPersonaId(savedPersonaId)
          const resolvedPrompt = persona.presetKey
            ? t(`persona.presetPrompt.${persona.presetKey}`)
            : persona.systemPrompt
          usePrefsStore.getState().setPrefs({ model: persona.model, systemPrompt: resolvedPrompt, outputStyle: persona.outputStyle || 'default' })
          window.electronAPI.prefsSet('model', persona.model)
          window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
          window.electronAPI.prefsSet('outputStyle', persona.outputStyle || 'default')
        }
      }
    } catch { /* ignore localStorage errors */ }
  }

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (confirmDeleteId === sessionId) {
      setConfirmDeleteId(null)
      await window.electronAPI.sessionDelete(sessionId)
      addToast('success', t('session.deleted'))
      loadSessions()
    } else {
      setConfirmDeleteId(sessionId)
      setTimeout(() => setConfirmDeleteId(prev => prev === sessionId ? null : prev), 3000)
    }
  }

  const forkSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    const messages = await window.electronAPI.sessionLoad(session.sessionId)
    const newId = await window.electronAPI.sessionFork(session.sessionId, messages.length - 1)
    if (newId) {
      addToast('success', t('session.forked'))
      await loadSessions()
    } else {
      addToast('error', t('session.forkFailed'))
    }
  }

  const duplicateSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    try {
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      const title = session.title || session.lastPrompt || t('session.untitledSession')
      // Load into chat as a new session (no CLI resume ID)
      clearMessages()
      loadHistory(chatMessages)
      // Don't set a session ID — this creates an "unsaved" new session
      // that will get its own ID when the user sends the first message
      useChatStore.getState().setSessionTitle(`${title} (${t('session.copy')})`)
      addToast('success', t('session.duplicated'))
    } catch {
      addToast('error', t('session.duplicateFailed'))
    }
  }

  const regenerateTitle = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    try {
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      const newTitle = generateSmartTitle(chatMessages)
      if (newTitle) {
        await window.electronAPI.sessionRename(session.sessionId, newTitle)
        await loadSessions()
        addToast('success', t('session.titleRegenerated'))
      }
    } catch {
      addToast('error', t('session.titleRegenerateFailed'))
    }
  }

  const exportSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    try {
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      const title = session.title || session.lastPrompt || t('session.untitledSession')
      const lines: string[] = [`# ${title}\n`]
      lines.push(`_Exported: ${new Date().toLocaleString()} | Messages: ${chatMessages.length}_\n`)
      lines.push('---\n')
      for (const msg of chatMessages) {
        if (msg.role === 'user') {
          lines.push(`## You\n`)
          lines.push((msg as StandardChatMessage).content + '\n')
        } else if (msg.role === 'assistant') {
          lines.push(`## Claude\n`)
          lines.push((msg as StandardChatMessage).content + '\n')
        }
      }
      const markdown = lines.join('\n')
      const sanitizedTitle = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
      const filePath = await window.electronAPI.fsShowSaveDialog(`${sanitizedTitle}.md`, [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ])
      if (!filePath) return
      const result = await window.electronAPI.fsWriteFile(filePath, markdown)
      if (result?.error) {
        addToast('error', t('chat.exportFailed', { error: result.error }))
      } else {
        addToast('success', t('chat.exportSuccess'))
      }
    } catch (err) {
      addToast('error', t('chat.exportFailed', { error: String(err) }))
    }
  }

  const startRename = (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    setRenamingId(session.sessionId)
    setRenameValue(session.title || session.lastPrompt || '')
  }

  const commitRename = async (sessionId: string) => {
    if (renameValue.trim()) {
      await window.electronAPI.sessionRename(sessionId, renameValue.trim())
      await loadSessions()
    }
    setRenamingId(null)
  }

  const handleOpenGlobalResult = useCallback(async (sessionId: string) => {
    const raw = await window.electronAPI.sessionLoad(sessionId)
    const chatMessages = parseSessionMessages(raw)
    clearMessages()
    loadHistory(chatMessages)
    setSessionId(sessionId)
    setShowGlobalResults(false)
  }, [clearMessages, loadHistory, setSessionId])

  const bulkDelete = async () => {
    const toDelete = [...selectedIds]
    for (const id of toDelete) {
      await window.electronAPI.sessionDelete(id)
    }
    addToast('success', t('session.bulkDeleted', { count: String(toDelete.length) }))
    exitSelectMode()
    loadSessions()
  }

  const deleteAll = async () => {
    if (!sessions.length) return
    const ok = window.confirm(t('session.deleteAllConfirm', { count: String(sessions.length) }))
    if (!ok) return
    for (const s of sessions) {
      await window.electronAPI.sessionDelete(s.sessionId)
    }
    loadSessions()
  }

  return {
    // Multi-select
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    confirmBulkDelete,
    setConfirmBulkDelete,
    exitSelectMode,
    toggleSelectId,
    bulkDelete,
    // Rename
    renamingId,
    renameValue,
    setRenameValue,
    setRenamingId,
    confirmDeleteId,
    startRename,
    commitRename,
    // Global search
    globalSearchResults,
    isGlobalSearching,
    showGlobalResults,
    setShowGlobalResults,
    lastGlobalQuery,
    handleGlobalSearch,
    handleOpenGlobalResult,
    // Session operations
    loadSessions,
    openSession,
    deleteSession,
    forkSession,
    duplicateSession,
    regenerateTitle,
    exportSession,
    deleteAll,
    // Passthrough
    currentSessionId,
    isStreaming,
    sessions,
  }
}
