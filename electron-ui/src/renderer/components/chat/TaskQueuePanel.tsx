import React, { useState, useEffect, useRef } from 'react'
import { AlignJustify, Pause, Play, Trash2, X } from 'lucide-react'
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
  `
  document.head.appendChild(style)
}

// ── Status badge ────────────────────────────────────
function StatusBadge({ status, t }: { status: TaskQueueItem['status']; t: (key: string) => string }) {
  if (status === 'running') {
    return (
      <span style={{
        background: 'var(--queue-bg-running)',
        color: 'var(--queue-accent-soft)',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 3,
        flexShrink: 0,
        animation: 'queue-running-pulse 1.5s ease-in-out infinite',
        display: 'inline-block',
      }}>
        {t('taskQueue.running')}
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span style={{
        background: 'rgba(78, 201, 176, 0.15)',
        color: 'var(--success)',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 3,
        flexShrink: 0,
      }}>
        {t('taskQueue.done')}
      </span>
    )
  }
  return (
    <span style={{
      background: 'rgba(64, 64, 64, 0.6)',
      color: 'var(--text-muted)',
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 3,
      flexShrink: 0,
    }}>
      {t('taskQueue.pending')}
    </span>
  )
}

// ── Task row ────────────────────────────────────────
function TaskRow({
  item,
  index,
  onRemove,
  t,
}: {
  item: TaskQueueItem
  index: number
  onRemove: (id: string) => void
  t: (key: string) => string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: hovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        transition: 'background 100ms ease',
        borderBottom: '1px solid rgba(64, 64, 64, 0.25)',
      }}
    >
      {/* Sequence number */}
      <span style={{
        fontSize: 11,
        color: '#4a4a4a',
        width: 16,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {/* Status badge */}
      <StatusBadge status={item.status} t={t} />

      {/* Content */}
      <span style={{
        fontSize: 13,
        color: 'var(--text-primary)',
        flex: '1 1 0',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {item.content}
      </span>

      {/* Delete button -- pending only */}
      {item.status === 'pending' && (
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
            color: '#4a4a4a',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#4a4a4a' }}
        >
          <X size={14} />
        </button>
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
        background: 'var(--queue-panel-bg)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--queue-panel-border)',
        borderRadius: 10,
        boxShadow: 'var(--queue-panel-shadow)',
        maxHeight: 208,
        overflowY: 'auto',
        flexShrink: 0,
        animation: isExiting
          ? 'queue-panel-out 150ms ease-in forwards'
          : 'queue-panel-in 200ms ease-out forwards',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(64, 64, 64, 0.5)',
        flexShrink: 0,
      }}>
        {/* Left: title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlignJustify size={14} style={{ color: 'var(--queue-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
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
              borderRadius: 3,
              transition: 'color 150ms ease',
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
              borderRadius: 3,
              marginLeft: 6,
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
          >
            <Trash2 size={12} />
            <span>{t('taskQueue.clear')}</span>
          </button>
        </div>
      </div>

      {/* Task list */}
      <div role="list" style={{ overflowY: 'auto' }}>
        {taskQueue.map((item, idx) => (
          <TaskRow
            key={item.id}
            item={item}
            index={idx}
            onRemove={removeFromQueue}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
