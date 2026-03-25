import React, { useEffect, useState } from 'react'
import { Clock, Trash2, RefreshCw, MessageSquare, GitBranch, Pencil } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { useSessionStore, useChatStore } from '../../store'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export default function SessionList() {
  const { sessions, loading, setSessions, setLoading } = useSessionStore()
  const { clearMessages, loadHistory, setSessionId } = useChatStore()
  const [filter, setFilter] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const loadSessions = async () => {
    setLoading(true)
    const list = await window.electronAPI.sessionList()
    setSessions(list || [])
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [])

  const openSession = async (session: SessionListItem) => {
    if (renamingId === session.sessionId) return
    const messages = await window.electronAPI.sessionLoad(session.sessionId)
    const chatMessages = messages
      .filter((m: Record<string, unknown>) => m.type === 'user' || m.type === 'assistant' || m.role)
      .map((m: Record<string, unknown>, i: number) => {
        const role = (m.type === 'user' || m.role === 'user') ? 'user' : 'assistant'
        let content = ''
        if (m.message) {
          const msg = m.message as Record<string, unknown>
          if (typeof msg.content === 'string') content = msg.content
          else if (Array.isArray(msg.content)) {
            const textPart = msg.content.find((c: Record<string, unknown>) => c.type === 'text')
            content = textPart?.text || ''
          }
        }
        return {
          id: `hist-${session.sessionId}-${i}`,
          role: role as 'user' | 'assistant',
          content: String(content),
          timestamp: m.timestamp ? new Date(m.timestamp as string).getTime() : Date.now(),
        }
      })
      .filter((m: any) => m.content.trim())

    clearMessages()
    loadHistory(chatMessages)
    setSessionId(session.sessionId)
  }

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    await window.electronAPI.sessionDelete(sessionId)
    loadSessions()
  }

  const forkSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    // Fork at the last message
    const messages = await window.electronAPI.sessionLoad(session.sessionId)
    const newId = await window.electronAPI.sessionFork(session.sessionId, messages.length - 1)
    if (newId) {
      await loadSessions()
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

  const filtered = sessions.filter((s) =>
    !filter || (s.title || s.lastPrompt).toLowerCase().includes(filter.toLowerCase()) ||
    s.project.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索历史..."
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
          title="刷新"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={async () => {
            if (!sessions.length) return
            const ok = window.confirm(`确定要删除全部 ${sessions.length} 条会话记录吗？此操作不可撤销。`)
            if (!ok) return
            for (const s of sessions) {
              await window.electronAPI.sessionDelete(s.sessionId)
            }
            loadSessions()
          }}
          title="清空全部会话"
          style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>加载中...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            {filter ? '无匹配结果' : '暂无会话历史'}
          </div>
        )}
        {filtered.map((session) => (
          <div
            key={session.sessionId}
            onClick={() => openSession(session)}
            className="session-item"
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
              if (btns) btns.style.display = 'flex'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
              if (btns) btns.style.display = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MessageSquare size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {session.project.split(/[/\\]/).pop() || session.project}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {formatDistanceToNow(new Date(session.timestamp), { addSuffix: true, locale: zhCN })}
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
                title="双击重命名"
              >
                {session.title || session.lastPrompt || '(无内容)'}
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
                onClick={(e) => startRename(e, session)}
                title="重命名"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={(e) => forkSession(e, session)}
                title="分叉会话"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <GitBranch size={11} />
              </button>
              <button
                onClick={(e) => deleteSession(e, session.sessionId)}
                title="删除"
                style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
