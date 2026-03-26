import React, { useEffect, useState } from 'react'
import { Clock, Trash2, RefreshCw, MessageSquare, GitBranch, Pencil, ArrowUpDown, Star } from 'lucide-react'
import { SessionListItem, SessionMessage, StandardChatMessage, ToolUseInfo, ChatMessage } from '../../types/app.types'
import { useSessionStore, useChatStore, useUiStore } from '../../store'
import { SkeletonSessionRow } from '../ui/Skeleton'
import { formatDistanceToNow } from 'date-fns'

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
          timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
        } as StandardChatMessage)
      } else if (typeof content === 'string') {
        if (!content.trim()) continue
        result.push({
          id: `hist-user-${entry.timestamp || Date.now()}-${result.length}`,
          role: 'user',
          content,
          timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
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
        timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
      } as StandardChatMessage)
    }
  }

  return result
}

export default function SessionList() {
  const { sessions, loading, setSessions, setLoading } = useSessionStore()
  const { clearMessages, loadHistory, setSessionId, currentSessionId } = useChatStore()
  const { addToast } = useUiStore()
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
      addToast('success', 'Session deleted')
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
      addToast('success', 'Session forked')
      await loadSessions()
    } else {
      addToast('error', 'Failed to fork session')
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
    .filter((s) =>
      !filter || (s.title || s.lastPrompt).toLowerCase().includes(filter.toLowerCase()) ||
      s.project.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      // Pinned sessions always come first
      const aPinned = pinnedIds.has(a.sessionId) ? 1 : 0
      const bPinned = pinnedIds.has(b.sessionId) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      if (sortBy === 'oldest') return a.timestamp - b.timestamp
      if (sortBy === 'alpha') return (a.title || a.lastPrompt).localeCompare(b.title || b.lastPrompt)
      return b.timestamp - a.timestamp // newest first (default)
    })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search sessions..."
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '4px 8px',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          onClick={loadSessions}
          title="Refresh"
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
          title={`Sort: ${sortBy === 'newest' ? 'Newest first' : sortBy === 'oldest' ? 'Oldest first' : 'Alphabetical'}`}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2, fontSize: 10,
          }}
        >
          <ArrowUpDown size={11} />
          <span>{sortBy === 'newest' ? 'New' : sortBy === 'oldest' ? 'Old' : 'A-Z'}</span>
        </button>
        <button
          onClick={async () => {
            if (!sessions.length) return
            const ok = window.confirm(`Delete all ${sessions.length} sessions? This cannot be undone.`)
            if (!ok) return
            for (const s of sessions) {
              await window.electronAPI.sessionDelete(s.sessionId)
            }
            loadSessions()
          }}
          title="Delete all sessions"
          style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div>
            {[0, 1, 2, 3, 4].map(i => <SkeletonSessionRow key={i} />)}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            {filter ? 'No matches' : 'No session history'}
          </div>
        )}
        {filtered.map((session) => {
          const isActive = currentSessionId === session.sessionId
          return (
          <div
            key={session.sessionId}
            onClick={() => openSession(session)}
            className="session-item"
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              position: 'relative',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              background: isActive ? 'rgba(0, 122, 204, 0.08)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isActive ? 'rgba(0, 122, 204, 0.14)' : 'var(--bg-hover)'
              const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
              if (btns) btns.style.display = 'flex'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isActive ? 'rgba(0, 122, 204, 0.08)' : 'transparent'
              const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
              if (btns) btns.style.display = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {pinnedIds.has(session.sessionId) ? (
                <Star size={11} style={{ color: 'var(--warning)', fill: 'var(--warning)', flexShrink: 0 }} />
              ) : (
                <MessageSquare size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {session.project.split(/[/\\]/).pop() || session.project}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {formatDistanceToNow(new Date(session.timestamp), { addSuffix: true })}
              </span>
            </div>

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
                  width: '100%',
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
              <div
                onDoubleClick={(e) => startRename(e, session)}
                style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 56 }}
                title="Double-click to rename"
              >
                <HighlightText text={session.title || session.lastPrompt || '(no content)'} highlight={filter} />
              </div>
            )}

            {/* Action buttons */}
            <div
              className="action-btns"
              style={{
                display: 'none',
                position: 'absolute',
                right: 8,
                bottom: 8,
                gap: 4,
                alignItems: 'center',
              }}
            >
              <button
                onClick={(e) => togglePin(e, session.sessionId)}
                title={pinnedIds.has(session.sessionId) ? 'Unpin' : 'Pin to top'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: pinnedIds.has(session.sessionId) ? 'var(--warning)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Star size={11} style={{ fill: pinnedIds.has(session.sessionId) ? 'var(--warning)' : 'none' }} />
              </button>
              <button
                onClick={(e) => startRename(e, session)}
                title="Rename"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={(e) => forkSession(e, session)}
                title="Fork session"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <GitBranch size={11} />
              </button>
              <button
                onClick={(e) => deleteSession(e, session.sessionId)}
                title={confirmDeleteId === session.sessionId ? 'Click again to confirm' : 'Delete'}
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
                {confirmDeleteId === session.sessionId && <span>Sure?</span>}
              </button>
            </div>
          </div>
          )
        })}
      </div>
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
          <span key={i} style={{ background: 'var(--warning)', color: 'var(--bg-primary)', borderRadius: 2, padding: '0 1px' }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
