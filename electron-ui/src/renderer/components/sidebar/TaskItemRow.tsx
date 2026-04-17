// TaskItemRow — individual task row with status cycling (extracted from TasksPanel, Iteration 510)

import React, { useState } from 'react'
import { GripVertical, X, Loader } from 'lucide-react'
import type { TaskItem } from './useTasksCrud'

interface TaskItemRowProps {
  task: TaskItem
  onCycle: (id: string) => void
  onDelete: (id: string) => void
}

// Status indicator dot: pending=amber, in_progress=indigo, completed=green
function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed' ? '#4ade80'
    : status === 'in_progress' ? '#818cf8'
    : '#fbbf24'
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        display: 'inline-block',
        boxShadow: `0 0 4px ${color}88`,
        transition: 'all 0.15s ease',
      }}
    />
  )
}

// Priority badge: high=red, medium=amber, low=green
function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === 'normal') return null
  const bg =
    priority === 'high' ? 'rgba(239,68,68,0.85)'
    : priority === 'medium' ? 'rgba(251,191,36,0.85)'
    : 'rgba(74,222,128,0.85)'
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--text-primary)',
        background: bg,
        borderRadius: 6,
        padding: '1px 5px',
        flexShrink: 0,
        lineHeight: 1.4,
      }}
    >
      {priority}
    </span>
  )
}

export default function TaskItemRow({ task, onCycle, onDelete }: TaskItemRowProps) {
  const [hovered, setHovered] = useState(false)

  const isCompleted = task.status === 'completed'
  const isInProgress = task.status === 'in_progress'

  // Custom checkbox rendering
  const renderCheckbox = () => {
    if (isCompleted) {
      return (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: '#4ade80',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 6px rgba(74,222,128,0.40)',
            transition: 'all 0.15s ease',
          }}
        >
          {/* White checkmark SVG */}
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )
    }
    if (isInProgress) {
      return (
        <Loader
          size={14}
          style={{
            animation: 'spin 1s linear infinite',
            color: '#818cf8',
            flexShrink: 0,
            filter: 'drop-shadow(0 0 3px rgba(129,140,248,0.50))',
          }}
        />
      )
    }
    // Pending — unchecked border, amber tint on hover
    return (
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: hovered ? '1.5px solid rgba(251,191,36,0.55)' : '1.5px solid var(--border-strong, var(--border))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      />
    )
  }

  const displayText = isInProgress && task.activeForm ? task.activeForm : task.text

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 10px',
        borderRadius: 8,
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'all 0.15s ease',
        cursor: 'default',
      }}
    >
      {/* Drag handle */}
      <span
        style={{
          color: hovered ? 'var(--text-faint)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          cursor: 'grab',
          transition: 'all 0.15s ease',
        }}
      >
        <GripVertical size={12} />
      </span>

      {/* Status dot */}
      <StatusDot status={task.status} />

      {/* Checkbox */}
      <button
        onClick={() => onCycle(task.id)}
        title={task.status === 'pending' ? 'Start' : task.status === 'in_progress' ? 'Complete' : 'Reopen'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: 0,
          flexShrink: 0,
        }}
      >
        {renderCheckbox()}
      </button>

      {/* Task text */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          lineHeight: 1.4,
          color: isCompleted
            ? 'var(--text-faint)'
            : isInProgress
              ? 'var(--text-primary)'
              : 'var(--text-secondary)',
          textDecoration: isCompleted ? 'line-through' : 'none',
          textDecorationColor: 'var(--text-muted)',
          wordBreak: 'break-word',
          transition: 'all 0.15s ease',
          fontFeatureSettings: '"tnum"',
        }}
      >
        {displayText}
      </span>

      {/* Priority badge */}
      {'priority' in task && <PriorityBadge priority={(task as any).priority} />}

      {/* Delete button — appears on hover */}
      <button
        onClick={() => onDelete(task.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: hovered ? 'var(--text-faint)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          padding: 2,
          borderRadius: 4,
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#f87171'
          e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = hovered ? 'var(--text-faint)' : 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <X size={11} />
      </button>
    </div>
  )
}
