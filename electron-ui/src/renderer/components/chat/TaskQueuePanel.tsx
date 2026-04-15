import React, { useState, useEffect, useRef } from 'react'
import { AlignJustify, ArrowDown, ArrowUp, Pause, Play, Trash2, X } from 'lucide-react'
import { useChatStore } from '../../store'
import type { TaskQueueItem } from '../../store'
import { useT } from '../../i18n'

// ── Animation keyframes injected once ──────────────
const KEYFRAMES_ID = 'task-queue-keyframes'
function ensureKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return
  const style = document.createElement('style')
  style.id = KEYFRAMES_ID
  style.textContent = `
    @keyframes queue-panel-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes queue-panel-out {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(4px); }
    }
    @keyframes queue-badge-in {
      from { transform: scale(0); }
      to   { transform: scale(1); }
    }
    @keyframes queue-running-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.6; }
    }
    @keyframes queue-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .task-queue-scroll::-webkit-scrollbar { width: 4px; }
    .task-queue-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  `
  document.head.appendChild(style)
}

// ── Status icon ─────────────────────────────────────
function StatusIcon({ status }: { status: TaskQueueItem['status'] }) {
  if (status === 'running') {
    return (
      <span style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid rgba(129,140,248,0.3)',
        borderTopColor: '#818cf8',
        borderRadius: '50%',
        flexShrink: 0,
        animation: 'queue-spin 0.7s linear infinite',
      }} />
    )
  }
  if (status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="6" stroke="#4ade80" strokeWidth="1.5" />
        <path d="M4.5 7l2 2 3-3" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="6" stroke="#f87171" strokeWidth="1.5" />
        <path d="M5 5l4 4M9 5l-4 4" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  // pending
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <circle cx="7" cy="7" r="2" fill="rgba(255,255,255,0.3)" />
    </svg>
  )
}

// ── Task row ────────────────────────────────────────
function TaskRow({
  item,
  index,
  onRemove,
  reorderQueue,
  totalCount,
  t,
}: {
  item: TaskQueueItem
  index: number
  onRemove: (id: string) => void
  reorderQueue: (from: number, to: number) => void
  totalCount: number
  t: (key: string) => string
}) {
  const [hovered, setHovered] = useState(false)
  const [upHovered, setUpHovered] = useState(false)
  const [downHovered, setDownHovered] = useState(false)

  const rowBackground =
    item.status === 'running'
      ? 'rgba(99,102,241,0.08)'
      : item.status === 'done'
      ? 'transparent'
      : item.status === 'failed'
      ? 'rgba(239,68,68,0.06)'
      : hovered
      ? 'var(--bg-hover)'
      : 'rgba(255,255,255,0.03)'

  const rowBorderLeft =
    item.status === 'running'
      ? '2px solid rgba(99,102,241,0.60)'
      : item.status === 'done'
      ? '2px solid rgba(34,197,94,0.4)'
      : item.status === 'failed'
      ? '2px solid rgba(239,68,68,0.4)'
      : hovered
      ? '2px solid rgba(255,255,255,0.18)'
      : '2px solid var(--border)'

  const rowBoxShadow =
    hovered && item.status !== 'done'
      ? '0 2px 8px rgba(0,0,0,0.3)'
      : 'none'

  const rowOpacity = item.status === 'done' ? 0.6 : 1

  const titleColor =
    item.status === 'running'
      ? 'var(--text-primary)'
      : item.status === 'done'
      ? 'var(--text-muted)'
      : 'var(--text-primary)'

  return (
    <div
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        marginBottom: 4,
        borderRadius: 8,
        background: rowBackground,
        borderLeft: rowBorderLeft,
        boxShadow: rowBoxShadow,
        opacity: rowOpacity,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Sequence number */}
      <span style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        width: 16,
        textAlign: 'right',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {index + 1}
      </span>

      {/* Status icon */}
      <StatusIcon status={item.status} />

      {/* Content */}
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: titleColor,
        textDecoration: item.status === 'done' ? 'line-through' : 'none',
        flex: '1 1 0',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {item.content}
      </span>

      {/* Reorder + Delete buttons -- pending only */}
      {item.status === 'pending' && (
        <>
          {/* Up arrow */}
          <button
            onClick={() => reorderQueue(index, index - 1)}
            disabled={index === 0}
            aria-label="Move task up"
            onMouseEnter={() => setUpHovered(true)}
            onMouseLeave={() => setUpHovered(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: '1px 3px',
              borderRadius: 8,
              cursor: index === 0 ? 'not-allowed' : 'pointer',
              color: upHovered && index !== 0 ? 'var(--text-primary)' : 'rgba(255,255,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              opacity: index === 0 ? 0.2 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowUp size={11} />
          </button>

          {/* Down arrow */}
          <button
            onClick={() => reorderQueue(index, index + 1)}
            disabled={index === totalCount - 1}
            aria-label="Move task down"
            onMouseEnter={() => setDownHovered(true)}
            onMouseLeave={() => setDownHovered(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: '1px 3px',
              borderRadius: 8,
              cursor: index === totalCount - 1 ? 'not-allowed' : 'pointer',
              color: downHovered && index !== totalCount - 1 ? 'var(--text-primary)' : 'rgba(255,255,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              opacity: index === totalCount - 1 ? 0.2 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowDown size={11} />
          </button>

          {/* Delete button */}
          <button
            onClick={() => onRemove(item.id)}
            aria-label={`${t('taskQueue.remove')}: ${item.content.slice(0, 40)}`}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              color: 'var(--text-muted)',
              opacity: hovered ? 1 : 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </>
      )}
      {/* Placeholder to keep row height stable when delete button is hidden */}
      {item.status !== 'pending' && (
        <span style={{ width: 18, flexShrink: 0 }} />
      )}
    </div>
  )
}

// ── Main panel ──────────────────────────────────────
export default function TaskQueuePanel() {
  const t = useT()
  const taskQueue = useChatStore(s => s.taskQueue)
  const queuePaused = useChatStore(s => s.queuePaused)
  const removeFromQueue = useChatStore(s => s.removeFromQueue)
  const clearQueue = useChatStore(s => s.clearQueue)
  const reorderQueue = useChatStore(s => s.reorderQueue)
  const toggleQueuePause = useChatStore(s => s.toggleQueuePause)

  // Visibility: panel stays mounted during exit animation
  const [visible, setVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    ensureKeyframes()
  }, [])

  useEffect(() => {
    if (taskQueue.length > 0) {
      // Clear any pending exit
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      setIsExiting(false)
      setVisible(true)
    } else if (visible) {
      // Animate out
      setIsExiting(true)
      exitTimerRef.current = setTimeout(() => {
        setVisible(false)
        setIsExiting(false)
      }, 150)
    }
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [taskQueue.length])

  if (!visible) return null

  const pendingCount = taskQueue.filter(item => item.status === 'pending').length
  const totalCount = taskQueue.length

  return (
    <div
      style={{
        margin: '0 16px 8px 16px',
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        maxHeight: 208,
        overflowY: 'auto',
        flexShrink: 0,
        animation: isExiting
          ? 'queue-panel-out 0.15s ease-in forwards'
          : 'queue-panel-in 0.15s ease-out forwards',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--bg-hover)',
        flexShrink: 0,
      }}>
        {/* Left: title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlignJustify size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
            {t('taskQueue.title')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>
            ({pendingCount} {t('taskQueue.pending')} / {totalCount} {t('taskQueue.totalLabel')})
          </span>
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* Pause / Resume */}
          <button
            onClick={toggleQueuePause}
            aria-pressed={queuePaused}
            title={queuePaused ? t('taskQueue.resume') : t('taskQueue.pause')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: queuePaused ? '#fbbf24' : 'var(--text-muted)',
              padding: '2px 6px',
              borderRadius: 8,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#fbbf24' }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = queuePaused ? '#fbbf24' : 'var(--text-muted)'
            }}
          >
            {queuePaused ? <Play size={12} /> : <Pause size={12} />}
            <span>{queuePaused ? t('taskQueue.resume') : t('taskQueue.pause')}</span>
          </button>

          {/* Clear pending */}
          <button
            onClick={clearQueue}
            title={t('taskQueue.clearAll')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--text-muted)',
              padding: '2px 6px',
              borderRadius: 8,
              marginLeft: 6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
          >
            <Trash2 size={12} />
            <span>{t('taskQueue.clear')}</span>
          </button>

          {/* Close button */}
          <button
            onClick={() => setVisible(false)}
            title={t('taskQueue.close') ?? 'Close'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-muted)',
              padding: '2px 4px',
              borderRadius: 8,
              marginLeft: 4,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = 'var(--border)'
              btn.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = 'none'
              btn.style.color = 'var(--text-muted)'
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div
        role="list"
        className="task-queue-scroll"
        style={{ overflowY: 'auto', padding: '4px 6px', scrollbarWidth: 'thin' }}
      >
        {taskQueue.length === 0 ? (
          <div style={{
            color: 'var(--text-muted)',
            fontSize: 12,
            textAlign: 'center',
            padding: 16,
            opacity: 0.6,
          }}>
            {t('taskQueue.empty') ?? 'No tasks queued'}
          </div>
        ) : (
          taskQueue.map((item, idx) => (
            <TaskRow
              key={item.id}
              item={item}
              index={idx}
              onRemove={removeFromQueue}
              reorderQueue={reorderQueue}
              totalCount={totalCount}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  )
}
