/**
 * TaskBadgeCard.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 585)
 *
 * Compact inline badges for task management tool calls:
 *   - TaskCreateBadge  — shown when TaskCreate / task_create is invoked
 *   - TaskUpdateBadge  — shown when TaskUpdate / task_update is invoked
 */

import React from 'react'
import { Check, X, Loader2 } from 'lucide-react'

// Tool name sets — kept here for co-location with the rendering logic
export const TASK_CREATE_TOOLS = new Set(['TaskCreate', 'task_create'])
export const TASK_UPDATE_TOOLS = new Set(['TaskUpdate', 'task_update'])

// ── TaskCreateBadge ────────────────────────────────────────────────────────────

interface TaskCreateBadgeProps {
  subject: string
  status: 'running' | 'done' | 'error'
}

export function TaskCreateBadge({ subject, status }: TaskCreateBadgeProps) {
  const isDone = status === 'done'
  const isRunning = status === 'running'
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 8,
      background: isDone ? 'rgba(34,197,94,0.12)' : isRunning ? 'rgba(99,102,241,0.10)' : 'rgba(239,68,68,0.10)',
      border: `1px solid ${isDone ? 'rgba(34,197,94,0.28)' : isRunning ? 'rgba(99,102,241,0.28)' : 'rgba(239,68,68,0.28)'}`,
      marginBottom: 4,
      fontSize: 12,
      color: isDone ? 'rgba(74,222,128,0.90)' : isRunning ? 'rgba(165,180,252,0.90)' : 'rgba(252,165,165,0.90)',
      fontWeight: 500,
      maxWidth: '100%',
      overflow: 'hidden',
      transition: 'all 0.15s ease',
    }}>
      {isDone
        ? <Check size={12} style={{ flexShrink: 0 }} />
        : isRunning
        ? <Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} />
        : <X size={12} style={{ flexShrink: 0 }} />
      }
      <span style={{ fontWeight: 700, flexShrink: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>
        TaskCreate
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {subject}
      </span>
    </div>
  )
}

// ── TaskUpdateBadge ────────────────────────────────────────────────────────────

interface TaskUpdateBadgeProps {
  taskId: string
  status: 'running' | 'done' | 'error'
  updateStatus?: string
}

export function TaskUpdateBadge({ taskId, status, updateStatus }: TaskUpdateBadgeProps) {
  const isDone = status === 'done'
  const isRunning = status === 'running'
  const shortId = taskId.length > 6 ? taskId.slice(0, 6) : taskId
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 8,
      background: isDone ? 'rgba(99,102,241,0.10)' : isRunning ? 'rgba(99,102,241,0.08)' : 'rgba(239,68,68,0.10)',
      border: `1px solid ${isDone ? 'rgba(99,102,241,0.28)' : isRunning ? 'rgba(99,102,241,0.20)' : 'rgba(239,68,68,0.28)'}`,
      marginBottom: 4,
      fontSize: 12,
      color: isDone ? 'rgba(165,180,252,0.90)' : isRunning ? 'rgba(165,180,252,0.75)' : 'rgba(252,165,165,0.90)',
      fontWeight: 500,
      maxWidth: '100%',
      overflow: 'hidden',
      transition: 'all 0.15s ease',
    }}>
      {isDone
        ? <Check size={12} style={{ flexShrink: 0 }} />
        : isRunning
        ? <Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} />
        : <X size={12} style={{ flexShrink: 0 }} />
      }
      <span style={{ fontWeight: 700, flexShrink: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>
        TaskUpdate
      </span>
      {shortId && (
        <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.75 }}>#{shortId}</span>
      )}
      {updateStatus && (
        <span style={{ fontSize: 10, opacity: 0.80 }}>{'\u2192'} {updateStatus}</span>
      )}
    </div>
  )
}
