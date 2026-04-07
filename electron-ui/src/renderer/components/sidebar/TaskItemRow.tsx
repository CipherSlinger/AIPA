// TaskItemRow — individual task row with status cycling (extracted from TasksPanel, Iteration 510)

import React, { useState } from 'react'
import { CheckSquare, Square, X, Loader } from 'lucide-react'
import type { TaskItem } from './useTasksCrud'

interface TaskItemRowProps {
  task: TaskItem
  onCycle: (id: string) => void
  onDelete: (id: string) => void
}

export default function TaskItemRow({ task, onCycle, onDelete }: TaskItemRowProps) {
  const [hovered, setHovered] = useState(false)

  const statusIcon = task.status === 'completed'
    ? <CheckSquare size={14} />
    : task.status === 'in_progress'
    ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
    : <Square size={14} />

  const statusColor = task.status === 'completed'
    ? 'var(--success)'
    : task.status === 'in_progress'
    ? 'var(--accent)'
    : 'var(--text-muted)'

  const displayText = task.status === 'in_progress' && task.activeForm ? task.activeForm : task.text

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        background: hovered ? 'var(--popup-item-hover)' : 'transparent',
        transition: 'background 100ms',
        cursor: 'default',
      }}
    >
      <button
        onClick={() => onCycle(task.id)}
        title={task.status === 'pending' ? 'Start' : task.status === 'in_progress' ? 'Complete' : 'Reopen'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: statusColor,
          display: 'flex', alignItems: 'center', padding: 0,
          marginTop: 1, flexShrink: 0,
        }}
      >
        {statusIcon}
      </button>
      <span style={{
        flex: 1, fontSize: 12, lineHeight: 1.4,
        color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: task.status === 'completed' ? 'line-through' : 'none',
        opacity: task.status === 'completed' ? 0.6 : 1,
        wordBreak: 'break-word',
      }}>
        {displayText}
      </span>
      {hovered && (
        <button
          onClick={() => onDelete(task.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            padding: 0, flexShrink: 0, transition: 'color 100ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
