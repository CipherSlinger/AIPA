import React, { useState } from 'react'
import { LayoutDashboard, ChevronDown, Pause, SkipForward, XCircle, Check } from 'lucide-react'
import { useChatStore } from '../../store'
import type { TaskQueueItem } from '../../store'

// ── Keyframe injection (idempotent) ──────────────────────────────────────────
function ensureKeyframes() {
  if (document.getElementById('task-dashboard-kf')) return
  const style = document.createElement('style')
  style.id = 'task-dashboard-kf'
  style.textContent = `
    @keyframes td-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}

// ── Sub-components ────────────────────────────────────────────────────────────

type NodeStatus = TaskQueueItem['status'] | 'failed'

interface StepNodeProps {
  item: TaskQueueItem
  isLast: boolean
  prevDone: boolean
}

const NODE_SIZE = 20

const StepNode: React.FC<StepNodeProps> = ({ item, isLast, prevDone }) => {
  const { status } = item

  const nodeStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      width: NODE_SIZE,
      height: NODE_SIZE,
      borderRadius: '50%',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    }
    if (status === 'done') {
      return { ...base, background: '#22c55e' }
    }
    if (status === 'running') {
      return {
        ...base,
        background: 'transparent',
        border: '2.5px solid #6366f1',
        boxShadow: '0 0 8px 2px rgba(99,102,241,0.45)',
        animation: 'td-spin 1s linear infinite',
      }
    }
    // pending / failed
    return {
      ...base,
      background: status === 'failed' ? '#f87171' : 'rgba(255,255,255,0.10)',
      border: status === 'failed' ? 'none' : '1.5px solid rgba(255,255,255,0.18)',
    }
  })()

  const connectorColor =
    prevDone ? '#22c55e'
    : status === 'running' ? '#6366f1'
    : 'rgba(255,255,255,0.12)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: isLast ? '0 0 auto' : '1 1 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {/* Node circle */}
        <div style={nodeStyle}>
          {status === 'done' && (
            <Check size={11} color="#fff" strokeWidth={3} />
          )}
          {(status as NodeStatus) === 'failed' && (
            <XCircle size={12} color="#fff" strokeWidth={2.5} style={{ animation: 'none' }} />
          )}
          {status === 'pending' && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.38)' }} />
          )}
        </div>
        {/* Connector line */}
        {!isLast && (
          <div style={{ flex: 1, height: 2, background: connectorColor, transition: 'all 0.15s ease' }} />
        )}
      </div>
      {/* Label */}
      <div style={{
        maxWidth: 80,
        fontSize: 10,
        lineHeight: '13px',
        color: status === 'done' ? '#86efac'
          : status === 'running' ? '#a5b4fc'
          : 'rgba(255,255,255,0.38)',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        paddingTop: 2,
      }}>
        {item.content}
      </div>
    </div>
  )
}

// ── Control button shared style factory ──────────────────────────────────────
const ctrlBtn = (hoverColor?: string): React.CSSProperties => ({
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  color: 'rgba(255,255,255,0.60)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  transition: 'all 0.15s ease',
})

// ── Main component ────────────────────────────────────────────────────────────

const TaskDashboard: React.FC = () => {
  ensureKeyframes()

  const [expanded, setExpanded] = useState(true)
  const { taskQueue, queuePaused, toggleQueuePause, removeFromQueue, clearQueue } = useChatStore()

  if (taskQueue.length === 0) return null

  const doneCount  = taskQueue.filter(t => t.status === 'done').length
  const totalCount = taskQueue.length
  const running    = taskQueue.find(t => t.status === 'running') ?? null

  return (
    <div style={{
      margin: '0 16px 6px 16px',
      background: 'rgba(15,15,25,0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* ── Header bar ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LayoutDashboard size={14} color="#818cf8" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.01em' }}>
            Task Dashboard
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            color: '#a5b4fc',
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.30)',
            borderRadius: 20,
            padding: '1px 8px',
          }}>
            {doneCount}/{totalCount} done
          </span>
        </div>
        <ChevronDown
          size={14}
          color="rgba(255,255,255,0.45)"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        />
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ padding: '4px 14px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Progress track */}
          <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 2 }}>
            {taskQueue.map((item, idx) => (
              <StepNode
                key={item.id}
                item={item}
                isLast={idx === taskQueue.length - 1}
                prevDone={idx > 0 && taskQueue[idx - 1].status === 'done'}
              />
            ))}
          </div>

          {/* Current task focus card */}
          {running && (
            <div style={{
              background: 'rgba(15,15,25,0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderLeft: '3px solid rgba(99,102,241,0.60)',
              borderRadius: 7,
              padding: '8px 11px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 3 }}>
                  Now running
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)', lineHeight: '1.4' }}>
                  {running.content}
                </div>
              </div>

              {/* Macro controls */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  style={ctrlBtn()}
                  onClick={toggleQueuePause}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(217,119,6,0.18)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  title={queuePaused ? 'Resume queue' : 'Pause queue'}
                >
                  <Pause size={11} />
                  {queuePaused ? 'Resume' : 'Pause'}
                </button>

                <button
                  style={ctrlBtn()}
                  onClick={() => removeFromQueue(running.id)}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background = 'rgba(239,68,68,0.14)'
                    el.style.color = '#fca5a5'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background = 'transparent'
                    el.style.color = 'rgba(255,255,255,0.72)'
                  }}
                  title="Skip this task"
                >
                  <SkipForward size={11} />
                  Skip
                </button>

                <button
                  style={ctrlBtn()}
                  onClick={clearQueue}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.20)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  title="Clear all pending tasks"
                >
                  <XCircle size={11} />
                  Stop All
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TaskDashboard
