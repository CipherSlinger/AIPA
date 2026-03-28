import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Trash2, RefreshCw, MessageSquare, GitBranch, Pencil, ArrowUpDown, Star, Search, Tag, Check, Download, CheckSquare, Square, X, Clock, Globe } from 'lucide-react'
import { SessionListItem, SessionMessage, StandardChatMessage, ToolUseInfo, ChatMessage } from '../../types/app.types'
import { useSessionStore, useChatStore, useUiStore, usePrefsStore } from '../../store'
import { SkeletonSessionRow } from '../ui/Skeleton'
import { formatDistanceToNow } from 'date-fns'
import { useT } from '../../i18n'

// ── Tag preset colors ──
const TAG_PRESETS = [
  { id: 'tag-1', color: '#3b82f6', defaultKey: 'tags.work' },
  { id: 'tag-2', color: '#22c55e', defaultKey: 'tags.personal' },
  { id: 'tag-3', color: '#f59e0b', defaultKey: 'tags.research' },
  { id: 'tag-4', color: '#ef4444', defaultKey: 'tags.debug' },
  { id: 'tag-5', color: '#8b5cf6', defaultKey: 'tags.docs' },
  { id: 'tag-6', color: '#6b7280', defaultKey: 'tags.archive' },
]

// ── Session avatar color palette ──
const SESSION_AVATAR_COLORS = [
  '#4a90d9',  // blue
  '#50b86e',  // green
  '#e67e22',  // orange
  '#9b59b6',  // purple
  '#e74c3c',  // red
  '#1abc9c',  // teal
  '#f39c12',  // amber
  '#34495e',  // slate
]

function hashSessionId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getSessionAvatarColor(sessionId: string): string {
  return SESSION_AVATAR_COLORS[hashSessionId(sessionId) % SESSION_AVATAR_COLORS.length]
}

function formatSessionDuration(firstTs: number | undefined, lastTs: number): string | null {
  if (!firstTs || firstTs >= lastTs) return null
  const diffMs = lastTs - firstTs
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
}

function parseSessionMessages(raw: SessionMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  // Map tool_use_id → result message index so tool_results can be attached
  const toolUseIdToMsgIdx = new Map<string, number>()

  for (const entry of raw) {
    if (entry.type === 'user') {
      const msg = entry.message as Record<string, unknown> | undefined
      if (!msg) continue
      const content = msg.content
      // Check if this user message is only tool_results (attach to prior assistant messages)
      if (Array.isArray(content)) {
        const blocks = content as Record<string, unknown>[]
        const hasOnlyToolResults = blocks.length > 0 && blocks.every(b => b.type === 'tool_result')
        if (hasOnlyToolResults) {
          for (const block of blocks) {
            const toolUseId = block.tool_use_id as string
            const msgIdx = toolUseIdToMsgIdx.get(toolUseId)
            if (msgIdx !== undefined) {
              const target = result[msgIdx] as StandardChatMessage
              if (target?.toolUses) {
                target.toolUses = target.toolUses.map(t =>
                  t.id === toolUseId
                    ? { ...t, result: block.content, status: block.is_error ? 'error' as const : 'done' as const }
                    : t
                )
              }
            }
          }
          continue
        }
        // Mixed content: extract text
        const textBlock = blocks.find(b => b.type === 'text')
        const text = (textBlock?.text as string) || ''
        if (!text.trim()) continue
        result.push({
          id: `hist-user-${entry.timestamp || Date.now()}-${result.length}`,
          role: 'user',
          content: text,
          timestamp: entry.timestamp ? new Date(String(entry.timestamp)).getTime() : Date.now(),
        } as StandardChatMessage)
      } else if (typeof content === 'string') {
        if (!content.trim()) continue
        result.push({
          id: `hist-user-${entry.timestamp || Date.now()}-${result.length}`,
          role: 'user',
          content,
          timestamp: entry.timestamp ? new Date(String(entry.timestamp)).getTime() : Date.now(),
        } as StandardChatMessage)
      }

    } else if (entry.type === 'assistant') {
      const msg = entry.message as Record<string, unknown> | undefined
      if (!msg) continue
      const content = msg.content as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(content)) continue

      let text = ''
      let thinking = ''
      const toolUses: ToolUseInfo[] = []

      for (const block of content) {
        if (block.type === 'text') text += (block.text as string) || ''
        else if (block.type === 'thinking') thinking += (block.thinking as string) || ''
        else if (block.type === 'tool_use') {
          const toolId = block.id as string
          toolUses.push({
            id: toolId,
            name: block.name as string,
            input: (block.input ?? {}) as Record<string, unknown>,
            status: 'done',
          })
        }
      }

      if (!text.trim() && toolUses.length === 0 && !thinking) continue

      const msgIdx = result.length
      for (const tu of toolUses) {
        toolUseIdToMsgIdx.set(tu.id, msgIdx)
      }

      result.push({
        id: `hist-asst-${entry.timestamp || Date.now()}-${result.length}`,
        role: 'assistant',
        content: text,
        thinking: thinking || undefined,
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        timestamp: entry.timestamp ? new Date(String(entry.timestamp)).getTime() : Date.now(),
      } as StandardChatMessage)
    }
  }

  return result
}

export default function SessionList() {
  const { sessions, loading, setSessions, setLoading } = useSessionStore()
  const { clearMessages, loadHistory, setSessionId, currentSessionId } = useChatStore()
  const isStreaming = useChatStore(s => s.isStreaming)
  const { addToast } = useUiStore()
  const { prefs, setPrefs } = usePrefsStore()
  const t = useT()
  const [filter, setFilter] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alpha'>(() => {
    try {
      const stored = localStorage.getItem('aipa:session-sort')
      if (stored === 'newest' || stored === 'oldest' || stored === 'alpha') return stored
    } catch {}
    return 'newest'
  })

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  // Session preview tooltip state
  const [tooltipSession, setTooltipSession] = useState<SessionListItem | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filter.trim().length >= 2) {
      e.preventDefault()
      handleGlobalSearch(filter.trim())
    }
    if (e.key === 'Escape' && showGlobalResults) {
      e.preventDefault()
      setShowGlobalResults(false)
    }
  }, [filter, handleGlobalSearch, showGlobalResults])

  const showSessionTooltip = useCallback((session: SessionListItem, e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipSession(session)
      setTooltipPos({ top: rect.top, left: rect.right + 8 })
    }, 500)
  }, [])

  const hideSessionTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
    setTooltipSession(null)
  }, [])

  // ── Session Tags ──
  const sessionTags: Record<string, string[]> = prefs.sessionTags || {}
  const tagNames: string[] = prefs.tagNames || TAG_PRESETS.map(tp => t(tp.defaultKey))
  const [tagPickerSessionId, setTagPickerSessionId] = useState<string | null>(null)
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null)

  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  const toggleSessionTag = (sessionId: string, tagId: string) => {
    const current = sessionTags[sessionId] || []
    const updated = current.includes(tagId)
      ? current.filter(id => id !== tagId)
      : [...current, tagId]
    const newSessionTags = { ...sessionTags, [sessionId]: updated }
    // Clean up empty arrays
    if (updated.length === 0) delete newSessionTags[sessionId]
    setPrefs({ sessionTags: newSessionTags })
    window.electronAPI.prefsSet('sessionTags', newSessionTags)
  }

  const openTagPicker = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTagPickerSessionId(sessionId)
    setTagPickerPos({ top: rect.bottom + 4, left: rect.left })
  }

  const closeTagPicker = useCallback(() => {
    setTagPickerSessionId(null)
  }, [])

  // Close tag picker on Escape or click outside
  useEffect(() => {
    if (!tagPickerSessionId) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTagPicker() }
    const handleClick = () => closeTagPicker()
    window.addEventListener('keydown', handleKey)
    // Delay to avoid closing immediately from the same click
    const timer = setTimeout(() => window.addEventListener('click', handleClick), 50)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('click', handleClick)
      clearTimeout(timer)
    }
  }, [tagPickerSessionId, closeTagPicker])

  // Count sessions per tag (for filter bar)
  const tagCounts = TAG_PRESETS.reduce<Record<string, number>>((acc, tag) => {
    acc[tag.id] = Object.values(sessionTags).filter(tags => tags.includes(tag.id)).length
    return acc
  }, {})
  const hasAnyTags = Object.keys(sessionTags).length > 0

  // Compute unique project paths for project filter
  const uniqueProjects = React.useMemo(() => {
    const projects = new Map<string, number>()
    for (const s of sessions) {
      if (s.project) {
        projects.set(s.project, (projects.get(s.project) || 0) + 1)
      }
    }
    return [...projects.entries()]
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([name, count]) => ({ name, count }))
  }, [sessions])
  const hasMultipleProjects = uniqueProjects.length > 1

  // Pinned sessions (persisted in localStorage)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('aipa:pinned-sessions')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const togglePin = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setPinnedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      try { localStorage.setItem('aipa:pinned-sessions', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  const loadSessions = async () => {
    setLoading(true)
    const list = await window.electronAPI.sessionList()
    setSessions(list || [])
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [])

  // Listen for global search focus (Ctrl+Shift+F from ChatPanel)
  useEffect(() => {
    const handler = () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus()
        searchInputRef.current.select()
      }
    }
    window.addEventListener('aipa:globalSearchFocus', handler)
    return () => window.removeEventListener('aipa:globalSearchFocus', handler)
  }, [])

  // Listen for global session navigation (Ctrl+[ / Ctrl+])
  useEffect(() => {
    const handler = async (e: Event) => {
      const sessionId = (e as CustomEvent).detail as string
      if (!sessionId) return
      const raw = await window.electronAPI.sessionLoad(sessionId)
      const chatMessages = parseSessionMessages(raw)
      clearMessages()
      loadHistory(chatMessages)
      setSessionId(sessionId)
    }
    window.addEventListener('aipa:openSession', handler)
    return () => window.removeEventListener('aipa:openSession', handler)
  }, [])

  const openSession = async (session: SessionListItem) => {
    if (renamingId === session.sessionId) return
    const raw = await window.electronAPI.sessionLoad(session.sessionId)
    const chatMessages = parseSessionMessages(raw)
    clearMessages()
    loadHistory(chatMessages)
    setSessionId(session.sessionId)
  }

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (confirmDeleteId === sessionId) {
      // Second click: confirmed, actually delete
      setConfirmDeleteId(null)
      await window.electronAPI.sessionDelete(sessionId)
      addToast('success', t('session.deleted'))
      loadSessions()
    } else {
      // First click: show confirmation
      setConfirmDeleteId(sessionId)
      // Auto-cancel after 3 seconds
      setTimeout(() => setConfirmDeleteId(prev => prev === sessionId ? null : prev), 3000)
    }
  }

  const forkSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    // Fork at the last message
    const messages = await window.electronAPI.sessionLoad(session.sessionId)
    const newId = await window.electronAPI.sessionFork(session.sessionId, messages.length - 1)
    if (newId) {
      addToast('success', t('session.forked'))
      await loadSessions()
    } else {
      addToast('error', t('session.forkFailed'))
    }
  }

  const exportSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    try {
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      // Format as Markdown
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

  const filtered = sessions
    .filter((s) => {
      // Text filter
      const matchesText = !filter || (s.title || s.lastPrompt).toLowerCase().includes(filter.toLowerCase()) ||
        s.project.toLowerCase().includes(filter.toLowerCase())
      // Tag filter
      const matchesTag = !activeTagFilter || (sessionTags[s.sessionId] || []).includes(activeTagFilter)
      // Project filter
      const matchesProject = !activeProjectFilter || s.project === activeProjectFilter
      return matchesText && matchesTag && matchesProject
    })
    .sort((a, b) => {
      // Pinned sessions always come first
      const aPinned = pinnedIds.has(a.sessionId) ? 1 : 0
      const bPinned = pinnedIds.has(b.sessionId) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      if (sortBy === 'oldest') return a.timestamp - b.timestamp
      if (sortBy === 'alpha') return (a.title || a.lastPrompt).localeCompare(b.title || b.lastPrompt)
      return b.timestamp - a.timestamp // newest first (default)
    })

  // Compute date group labels for sessions (only when sorted by newest/oldest)
  const getDateGroup = (ts: number): string => {
    const now = new Date()
    const date = new Date(ts)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const weekAgo = new Date(today.getTime() - 7 * 86400000)

    if (date >= today) return t('session.today')
    if (date >= yesterday) return t('session.yesterday')
    if (date >= weekAgo) return t('session.thisWeek')
    return t('session.earlier')
  }

  const showDateGroups = sortBy !== 'alpha' && !filter

  // Compute match source and context snippet for search results
  const getMatchContext = (session: SessionListItem, query: string): { source: string; snippet: string } | null => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    const title = session.title || ''
    const content = session.lastPrompt || ''
    const project = session.project || ''

    let source = ''
    let text = ''
    if (title.toLowerCase().includes(q)) {
      source = t('session.inTitle')
      text = title
    } else if (content.toLowerCase().includes(q)) {
      source = t('session.inContent')
      text = content
    } else if (project.toLowerCase().includes(q)) {
      source = t('session.inProject')
      text = project
    } else {
      return null
    }

    // Extract context around the match
    const idx = text.toLowerCase().indexOf(q)
    const start = Math.max(0, idx - 30)
    const end = Math.min(text.length, idx + query.length + 30)
    let snippet = text.slice(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'
    return { source, snippet }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            ref={searchInputRef}
            value={filter}
            onChange={(e) => { setFilter(e.target.value); if (!e.target.value) setShowGlobalResults(false) }}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('session.search')}
            style={{
              flex: 1,
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid transparent',
              borderRadius: 6,
              padding: '6px 10px 6px 28px',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
          />
          {filter && (
            <span style={{
              position: 'absolute',
              right: 8,
              fontSize: 10,
              color: filtered.length === 0 ? 'var(--error)' : 'var(--text-muted)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}>
              {filtered.length === 0 ? t('session.noResults') : t('session.results', { count: filtered.length })}
            </span>
          )}
        </div>
        <button
          onClick={loadSessions}
          title={t('session.refresh')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={() => setSortBy(prev => {
            const next = prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'alpha' : 'newest'
            try { localStorage.setItem('aipa:session-sort', next) } catch {}
            return next
          })}
          title={`${t('session.sort')}: ${sortBy === 'newest' ? t('session.sortNewest') : sortBy === 'oldest' ? t('session.sortOldest') : t('session.sortAlpha')}`}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2, fontSize: 10,
          }}
        >
          <ArrowUpDown size={11} />
          <span>{sortBy === 'newest' ? t('session.sortNew') : sortBy === 'oldest' ? t('session.sortOld') : 'A-Z'}</span>
        </button>
        <button
          onClick={() => {
            if (selectMode) {
              exitSelectMode()
            } else {
              setSelectMode(true)
              setSelectedIds(new Set())
            }
          }}
          title={selectMode ? t('session.exitSelect') : t('session.selectMode')}
          style={{
            background: selectMode ? 'var(--accent)' : 'none',
            border: 'none',
            color: selectMode ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
            padding: selectMode ? '1px 4px' : 0,
          }}
        >
          <CheckSquare size={13} />
        </button>
        <button
          onClick={async () => {
            if (!sessions.length) return
            const ok = window.confirm(t('session.deleteAllConfirm', { count: String(sessions.length) }))
            if (!ok) return
            for (const s of sessions) {
              await window.electronAPI.sessionDelete(s.sessionId)
            }
            loadSessions()
          }}
          title={t('session.deleteAll')}
          style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Tag filter bar */}
      {hasAnyTags && (
        <div
          role="radiogroup"
          aria-label={t('tags.assign')}
          style={{
            display: 'flex',
            gap: 6,
            padding: '4px 10px',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
        >
          {TAG_PRESETS.map((tag, idx) => {
            const count = tagCounts[tag.id] || 0
            if (count === 0) return null
            const isActive = activeTagFilter === tag.id
            return (
              <button
                key={tag.id}
                role="radio"
                aria-checked={isActive}
                onClick={() => setActiveTagFilter(isActive ? null : tag.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 20,
                  borderRadius: 10,
                  padding: '0 8px',
                  background: isActive ? `${tag.color}30` : `${tag.color}1a`,
                  border: `1px solid ${isActive ? `${tag.color}80` : `${tag.color}40`}`,
                  cursor: 'pointer',
                  fontSize: 10,
                  color: isActive ? tag.color : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                {getTagName(idx)}
                <span style={{ opacity: 0.6, fontSize: 9 }}>({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Project filter bar */}
      {hasMultipleProjects && (
        <div
          role="radiogroup"
          aria-label={t('session.projectFilter')}
          style={{
            display: 'flex',
            gap: 6,
            padding: '4px 10px',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
        >
          <button
            role="radio"
            aria-checked={!activeProjectFilter}
            onClick={() => setActiveProjectFilter(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              borderRadius: 10,
              padding: '0 8px',
              background: !activeProjectFilter ? 'rgba(100,100,100,0.3)' : 'rgba(100,100,100,0.1)',
              border: `1px solid ${!activeProjectFilter ? 'rgba(100,100,100,0.6)' : 'rgba(100,100,100,0.3)'}`,
              cursor: 'pointer',
              fontSize: 10,
              color: !activeProjectFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: !activeProjectFilter ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
          >
            {t('session.allProjects')}
          </button>
          {uniqueProjects.map(proj => {
            const isActive = activeProjectFilter === proj.name
            // Extract short name from project path (last segment)
            const shortName = proj.name.split(/[/\\]/).pop() || proj.name
            return (
              <button
                key={proj.name}
                role="radio"
                aria-checked={isActive}
                onClick={() => setActiveProjectFilter(isActive ? null : proj.name)}
                title={proj.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 20,
                  borderRadius: 10,
                  padding: '0 8px',
                  background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.08)',
                  border: `1px solid ${isActive ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.25)'}`,
                  cursor: 'pointer',
                  fontSize: 10,
                  color: isActive ? '#3b82f6' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {shortName}
                <span style={{ opacity: 0.6, fontSize: 9 }}>({proj.count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Select All bar (shown in select mode) */}
      {selectMode && filtered.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <button
            onClick={() => {
              const selectableIds = filtered
                .filter(s => s.sessionId !== currentSessionId)
                .map(s => s.sessionId)
              const allSelected = selectableIds.every(id => selectedIds.has(id))
              if (allSelected) {
                setSelectedIds(new Set())
              } else {
                setSelectedIds(new Set(selectableIds))
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 0,
              fontSize: 11,
            }}
          >
            {(() => {
              const selectableIds = filtered.filter(s => s.sessionId !== currentSessionId).map(s => s.sessionId)
              const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
              return allSelected
                ? <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
                : <Square size={13} />
            })()}
            <span>{t('session.selectAll')}</span>
          </button>
          {selectedIds.size > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 500 }}>
              {t('session.selectedCount', { count: String(selectedIds.size) })}
            </span>
          )}
        </div>
      )}

      {/* Global search results */}
      {showGlobalResults && (
        <div style={{
          borderBottom: '1px solid var(--border)',
          maxHeight: '50%',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--popup-bg)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Globe size={10} />
              {isGlobalSearching
                ? t('session.globalSearching')
                : globalSearchResults.length === 0
                  ? t('session.globalSearchNoResults')
                  : t('session.globalSearchResults', { count: String(globalSearchResults.length) })}
            </span>
            <button
              onClick={() => setShowGlobalResults(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
            >
              <X size={12} />
            </button>
          </div>
          {globalSearchResults.map(result => {
            const isActive = result.sessionId === currentSessionId
            return (
              <div
                key={result.sessionId}
                onClick={async () => {
                  // Load session from IPC (works for sessions from any project)
                  const raw = await window.electronAPI.sessionLoad(result.sessionId)
                  const chatMessages = parseSessionMessages(raw)
                  clearMessages()
                  loadHistory(chatMessages)
                  setSessionId(result.sessionId)
                  setShowGlobalResults(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: isActive ? 'var(--bg-active)' : 'transparent',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent' }}
              >
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: getSessionAvatarColor(result.sessionId),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  <MessageSquare size={13} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {result.title || result.project.split(/[/\\]/).pop() || t('session.untitled')}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0 4px',
                      borderRadius: 3,
                      background: result.matchType === 'title' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
                      color: result.matchType === 'title' ? '#60a5fa' : '#4ade80',
                      fontWeight: 500,
                      fontSize: 9,
                    }}>
                      {result.matchType === 'title' ? t('session.matchInTitle') : t('session.matchInContent')}
                    </span>
                    <span>{formatDistanceToNow(result.timestamp, { addSuffix: true })}</span>
                  </div>
                  {result.matchType === 'content' && result.snippet && (
                    <div style={{
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                      marginTop: 2,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as const,
                    }}>
                      <HighlightText text={result.snippet} highlight={lastGlobalQuery} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Global search hint */}
      {filter.trim().length >= 2 && !showGlobalResults && (
        <div style={{
          padding: '4px 12px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}>
          <Globe size={10} />
          <span>{t('session.globalSearchHint')}</span>
        </div>
      )}

      {/* List */}
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (filtered.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusedIdx(prev => Math.min(prev + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusedIdx(prev => Math.max(prev - 1, 0))
          } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < filtered.length) {
            e.preventDefault()
            openSession(filtered[focusedIdx])
          }
        }}
        style={{ flex: 1, overflowY: 'auto', outline: 'none' }}
      >
        {loading && (
          <div>
            {[0, 1, 2, 3, 4].map(i => <SkeletonSessionRow key={i} />)}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{
            padding: '32px 16px',
            color: 'var(--text-muted)',
            fontSize: 12,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <MessageSquare size={28} style={{ opacity: 0.3 }} />
            <div style={{ fontWeight: 500 }}>
              {filter ? t('session.noResults') : t('session.noSessions')}
            </div>
            {!filter && (
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {t('session.startNew')}
              </div>
            )}
          </div>
        )}
        {filtered.map((session, idx) => {
          const isActive = currentSessionId === session.sessionId
          const isFocused = idx === focusedIdx
          const isPinned = pinnedIds.has(session.sessionId)
          const avatarColor = getSessionAvatarColor(session.sessionId)
          const previewText = (session.lastPrompt || '').slice(0, 50) || undefined
          const isSelected = selectedIds.has(session.sessionId)
          const isSelectDisabled = selectMode && isActive // Can't select the active session

          // Date group header: show when group changes (skip for pinned section)
          let dateHeader: React.ReactNode = null
          if (showDateGroups && !isPinned) {
            const group = getDateGroup(session.timestamp)
            const prevSession = filtered[idx - 1]
            const prevGroup = prevSession ? (pinnedIds.has(prevSession.sessionId) ? null : getDateGroup(prevSession.timestamp)) : null
            if (group !== prevGroup) {
              dateHeader = (
                <div
                  key={`date-${group}`}
                  style={{
                    padding: '6px 14px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    opacity: 0.7,
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-sessionpanel)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {group}
                </div>
              )
            }
          }

          return (
          <React.Fragment key={session.sessionId}>
          {dateHeader}
          <div
            onClick={() => {
              if (selectMode) {
                if (!isSelectDisabled) toggleSelectId(session.sessionId)
              } else {
                openSession(session)
              }
            }}
            className="session-item"
            style={{
              padding: '10px 12px',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              borderLeft: isActive ? '3px solid var(--accent)' : isFocused ? '3px solid var(--text-muted)' : '3px solid transparent',
              background: isActive ? 'var(--session-active-bg)' : isFocused ? 'var(--session-hover-bg)' : 'transparent',
              position: 'relative',
              transition: 'background 0.15s ease, transform 0.15s ease, border-left-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isActive ? 'rgba(0, 122, 204, 0.18)' : 'var(--session-hover-bg)'
              if (!isActive) e.currentTarget.style.transform = 'translateX(2px)'
              const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
              if (btns) { btns.style.opacity = '1'; btns.style.transform = 'translateX(0)' }
              showSessionTooltip(session, e)
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isActive ? 'var(--session-active-bg)' : 'transparent'
              e.currentTarget.style.transform = 'translateX(0)'
              const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
              if (btns) { btns.style.opacity = '0'; btns.style.transform = 'translateX(4px)' }
              hideSessionTooltip()
            }}
          >
            {/* Selection checkbox (shown in select mode) */}
            {selectMode && (
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: isSelectDisabled ? 'var(--text-muted)' : isSelected ? 'var(--accent)' : 'var(--text-muted)',
                  opacity: isSelectDisabled ? 0.3 : 1,
                  cursor: isSelectDisabled ? 'not-allowed' : 'pointer',
                }}
                title={isSelectDisabled ? t('session.cannotDeleteActive') : ''}
              >
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </div>
            )}

            {/* Session Avatar (36px rounded square) */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: avatarColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isPinned
                  ? <Star size={18} color="#ffffff" />
                  : <MessageSquare size={18} color="#ffffff" />
                }
              </div>
              {/* Streaming indicator dot */}
              {isActive && isStreaming && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#4ade80',
                    border: '2px solid var(--bg-sessionpanel)',
                    animation: 'pulse 1.2s ease-in-out infinite',
                  }}
                />
              )}
            </div>

            {/* Text content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title row: title + timestamp */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 4,
              }}>
                {renamingId === session.sessionId ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(session.sessionId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(session.sessionId)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--accent)',
                      borderRadius: 3,
                      padding: '2px 6px',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => startRename(e, session)}
                    title={t('session.doubleClickRename')}
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    <HighlightText text={session.title || session.lastPrompt || t('session.noContent')} highlight={filter} />
                  </span>
                )}
                <span style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  {session.messageCount != null && session.messageCount > 0 && (
                    <span style={{ opacity: 0.6 }} title={t('session.tooltipMessages')}>
                      {session.messageCount}
                      <MessageSquare size={8} style={{ marginLeft: 1, verticalAlign: 'middle' }} />
                    </span>
                  )}
                  {(() => {
                    const dur = formatSessionDuration(session.firstTimestamp, session.timestamp)
                    if (!dur) return null
                    return (
                      <span style={{ opacity: 0.5, display: 'inline-flex', alignItems: 'center', gap: 2 }} title={t('session.tooltipDuration')}>
                        <Clock size={8} />
                        {dur}
                      </span>
                    )
                  })()}
                  {formatDistanceToNow(new Date(session.timestamp), { addSuffix: true })}
                </span>
              </div>

              {/* Preview line + tag dots */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                lineHeight: 1.4,
              }}>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}>
                  {previewText ? (
                    <HighlightText text={previewText} highlight={filter} />
                  ) : (
                    <em style={{ opacity: 0.6 }}>{t('session.noContent')}</em>
                  )}
                </div>
                {/* Tag color dots */}
                {(() => {
                  const tags = sessionTags[session.sessionId] || []
                  if (tags.length === 0) return null
                  const visibleTags = tags.slice(0, 3)
                  const overflow = tags.length - 3
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      {visibleTags.map(tagId => {
                        const preset = TAG_PRESETS.find(p => p.id === tagId)
                        if (!preset) return null
                        const idx = TAG_PRESETS.indexOf(preset)
                        return (
                          <span
                            key={tagId}
                            title={getTagName(idx)}
                            aria-hidden="true"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: preset.color,
                              opacity: 0.85,
                              flexShrink: 0,
                            }}
                          />
                        )
                      })}
                      {overflow > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>+{overflow}</span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Search match context line */}
              {filter && (() => {
                const ctx = getMatchContext(session, filter)
                if (!ctx) return null
                return (
                  <div style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                    marginTop: 2,
                    opacity: 0.8,
                  }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{ctx.source}</span>
                    <span style={{ opacity: 0.5 }}>: </span>
                    <HighlightText text={ctx.snippet} highlight={filter} />
                  </div>
                )
              })()}
            </div>

            {/* Action buttons (hidden in select mode) */}
            {!selectMode && (
            <div
              className="action-btns"
              style={{
                display: 'flex',
                position: 'absolute',
                right: 8,
                bottom: 8,
                gap: 4,
                alignItems: 'center',
                opacity: 0,
                transform: 'translateX(4px)',
                transition: 'opacity 0.15s ease, transform 0.15s ease',
              }}
            >
              <button
                onClick={(e) => togglePin(e, session.sessionId)}
                title={isPinned ? t('session.unpinSession') : t('session.pinSession')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isPinned ? 'var(--warning)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Star size={11} style={{ fill: isPinned ? 'var(--warning)' : 'none' }} />
              </button>
              <button
                onClick={(e) => openTagPicker(e, session.sessionId)}
                title={t('tags.assign')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: (sessionTags[session.sessionId] || []).length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Tag size={11} />
              </button>
              <button
                onClick={(e) => startRename(e, session)}
                title={t('session.rename')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={(e) => forkSession(e, session)}
                title={t('session.fork')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <GitBranch size={11} />
              </button>
              <button
                onClick={(e) => exportSession(e, session)}
                title={t('session.export')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Download size={11} />
              </button>
              <button
                onClick={(e) => deleteSession(e, session.sessionId)}
                title={confirmDeleteId === session.sessionId ? t('session.confirmDelete') : t('session.delete')}
                style={{
                  background: confirmDeleteId === session.sessionId ? 'var(--error)' : 'none',
                  border: 'none',
                  color: confirmDeleteId === session.sessionId ? '#fff' : 'var(--error)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 3,
                  padding: confirmDeleteId === session.sessionId ? '1px 6px' : 0,
                  fontSize: 10,
                  gap: 3,
                }}
              >
                <Trash2 size={12} />
                {confirmDeleteId === session.sessionId && <span>{t('common.confirm')}</span>}
              </button>
            </div>
            )}
          </div>
          </React.Fragment>
          )
        })}
      </div>

      {/* Tag picker popup */}
      {tagPickerSessionId && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(tagPickerPos.top, window.innerHeight - 200),
            left: tagPickerPos.left,
            zIndex: 10000,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            padding: 4,
            boxShadow: 'var(--popup-shadow)',
            width: 160,
            animation: 'popup-in 0.15s ease',
          }}
        >
          {TAG_PRESETS.map((tag, idx) => {
            const assigned = (sessionTags[tagPickerSessionId] || []).includes(tag.id)
            return (
              <button
                key={tag.id}
                role="menuitem"
                aria-checked={assigned}
                onClick={() => toggleSessionTag(tagPickerSessionId, tag.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 8px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  textAlign: 'left',
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--popup-item-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{getTagName(idx)}</span>
                {assigned && <Check size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Session preview tooltip */}
      {tooltipSession && (
        <div
          style={{
            position: 'fixed',
            top: Math.min(tooltipPos.top, window.innerHeight - 200),
            left: tooltipPos.left,
            zIndex: 9999,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: 'var(--popup-shadow)',
            maxWidth: 320,
            minWidth: 200,
            animation: 'popup-in 0.15s ease',
            pointerEvents: 'none',
          }}
        >
          {/* Title */}
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {tooltipSession.title || tooltipSession.lastPrompt || t('session.noContent')}
          </div>

          {/* Project path */}
          {tooltipSession.project && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{ opacity: 0.7 }}>{t('session.tooltipProject')}:</span>
              <span>{tooltipSession.project}</span>
            </div>
          )}

          {/* Last activity */}
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{ opacity: 0.7 }}>{t('session.tooltipLastActive')}:</span>
            <span>{new Date(tooltipSession.timestamp).toLocaleString()}</span>
          </div>

          {/* Duration */}
          {(() => {
            const dur = formatSessionDuration(tooltipSession.firstTimestamp, tooltipSession.timestamp)
            if (!dur) return null
            return (
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{ opacity: 0.7 }}>{t('session.tooltipDuration')}:</span>
                <span>{dur}</span>
              </div>
            )
          })()}

          {/* Message count */}
          {tooltipSession.messageCount != null && tooltipSession.messageCount > 0 && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{ opacity: 0.7 }}>{t('session.tooltipMessages')}:</span>
              <span>{tooltipSession.messageCount}</span>
            </div>
          )}

          {/* Tags */}
          {(() => {
            const tags = sessionTags[tooltipSession.sessionId] || []
            if (tags.length === 0) return null
            return (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                marginBottom: 4,
              }}>
                {tags.map(tagId => {
                  const preset = TAG_PRESETS.find(p => p.id === tagId)
                  if (!preset) return null
                  const idx = TAG_PRESETS.indexOf(preset)
                  return (
                    <span
                      key={tagId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        color: preset.color,
                        background: `${preset.color}1a`,
                        border: `1px solid ${preset.color}40`,
                        borderRadius: 8,
                        padding: '1px 6px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: preset.color, flexShrink: 0 }} />
                      {getTagName(idx)}
                    </span>
                  )
                })}
              </div>
            )
          })()}

          {/* Last prompt preview */}
          {tooltipSession.lastPrompt && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              borderTop: '1px solid var(--border)',
              paddingTop: 6,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}>
              {tooltipSession.lastPrompt.slice(0, 200)}
              {tooltipSession.lastPrompt.length > 200 ? '...' : ''}
            </div>
          )}
        </div>
      )}

      {/* Bulk delete floating action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--popup-bg)',
        }}>
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            flex: 1,
          }}>
            {t('session.selectedCount', { count: String(selectedIds.size) })}
          </span>
          <button
            onClick={exitSelectMode}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '4px 10px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <X size={11} />
            {t('common.cancel')}
          </button>
          {confirmBulkDelete ? (
            <button
              onClick={async () => {
                const toDelete = [...selectedIds]
                for (const id of toDelete) {
                  await window.electronAPI.sessionDelete(id)
                }
                addToast('success', t('session.bulkDeleted', { count: String(toDelete.length) }))
                exitSelectMode()
                loadSessions()
              }}
              style={{
                background: 'var(--error)',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Trash2 size={11} />
              {t('session.confirmBulkDelete', { count: String(selectedIds.size) })}
            </button>
          ) : (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              style={{
                background: 'none',
                border: '1px solid var(--error)',
                borderRadius: 4,
                padding: '4px 10px',
                color: 'var(--error)',
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Trash2 size={11} />
              {t('session.deleteSelected')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <>{text}</>

  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} style={{ background: 'var(--warning)', color: '#1a1a1a', borderRadius: 2, padding: '0 1px' }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
