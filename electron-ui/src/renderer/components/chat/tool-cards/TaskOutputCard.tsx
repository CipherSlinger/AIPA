/**
 * TaskOutputCard.tsx
 * Renders the TaskOutput / task_output tool invocation card.
 *
 * Input fields:
 *   task_id: string  — the task ID whose output is being read
 *   block?: boolean  — whether the call was blocking (waited for completion)
 *
 * Result: JSON task data (TaskItem or TaskItem[]) → rendered via TaskDashboardCard,
 * or plain text fallback with 300-char preview and expand toggle.
 */

import React, { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import TaskDashboardCard, { TaskItem } from '../TaskDashboardCard'

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseTaskItems(text: string): TaskItem[] | null {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      const items = parsed.filter(
        (x): x is TaskItem =>
          x !== null &&
          typeof x === 'object' &&
          typeof (x as Record<string, unknown>).id === 'string' &&
          typeof (x as Record<string, unknown>).subject === 'string'
      )
      return items.length > 0 ? items : null
    }
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).id === 'string' &&
      typeof (parsed as Record<string, unknown>).subject === 'string'
    ) {
      return [parsed as unknown as TaskItem]
    }
  } catch {
    // not JSON
  }
  return null
}

const PREVIEW_CHARS = 300

// ── TaskOutputCard ────────────────────────────────────────────────────────────

export interface TaskOutputCardProps {
  input: Record<string, unknown>
  result?: string | null
  isLoading?: boolean
}

export function TaskOutputCard({ input, result, isLoading }: TaskOutputCardProps) {
  const [showMore, setShowMore] = useState(false)

  const taskId = typeof input.task_id === 'string' ? input.task_id : ''
  const isBlocking = input.block === true

  const hasResult = typeof result === 'string' && result.length > 0
  const taskItems = hasResult ? safeParseTaskItems(result ?? '') : null

  const borderColor = isLoading
    ? 'rgba(99,102,241,0.60)'
    : hasResult
    ? 'rgba(34,197,94,0.50)'
    : 'rgba(99,102,241,0.35)'

  const previewText = hasResult && !taskItems
    ? (showMore ? (result ?? '') : (result ?? '').slice(0, PREVIEW_CHARS))
    : ''
  const needsExpand = hasResult && !taskItems && (result ?? '').length > PREVIEW_CHARS

  return (
    <div style={{
      background: 'var(--bg-primary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'border-color 0.2s ease',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        background: 'var(--section-bg)',
      }}>
        <ClipboardList
          size={13}
          style={{ color: 'rgba(99,102,241,0.85)', flexShrink: 0 }}
        />

        {/* Task ID */}
        <span style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'rgba(165,180,252,0.90)',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {taskId ? `Task Output · ${taskId}` : 'Task Output'}
        </span>

        {/* Block badge */}
        {isBlocking && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '1px 6px',
            borderRadius: 8,
            background: 'rgba(99,102,241,0.15)',
            color: 'rgba(165,180,252,0.80)',
            border: '1px solid rgba(99,102,241,0.30)',
            flexShrink: 0,
          }}>
            blocking
          </span>
        )}

        {/* Loading indicator */}
        {isLoading && !hasResult && (
          <span style={{
            fontSize: 10,
            color: 'rgba(99,102,241,0.65)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}>
            Waiting...
          </span>
        )}
      </div>

      {/* Result section */}
      {hasResult && (
        <div style={{ borderTop: '1px solid var(--bg-hover)' }}>
          {taskItems ? (
            /* JSON task data → TaskDashboardCard */
            <TaskDashboardCard tasks={taskItems} singleTask={taskItems.length === 1} />
          ) : (
            /* Plain text fallback */
            <div style={{ padding: '8px 10px', background: 'var(--section-bg)' }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
              }}>
                Output
              </div>
              <pre style={{
                margin: 0,
                fontSize: 11,
                fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
                background: 'var(--code-bg)',
                border: '1px solid var(--bg-hover)',
                borderRadius: needsExpand && !showMore ? '6px 6px 0 0' : 6,
                padding: '8px 10px',
                overflow: 'auto',
                maxHeight: showMore ? 400 : 200,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {previewText}
                {needsExpand && !showMore && (
                  <span style={{ color: 'var(--text-muted)' }}>…</span>
                )}
              </pre>
              {needsExpand && (
                <button
                  onClick={() => setShowMore(!showMore)}
                  style={{
                    background: 'var(--code-bg)',
                    border: '1px solid var(--bg-hover)',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    cursor: 'pointer',
                    color: 'rgba(99,102,241,0.70)',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    padding: '3px 10px',
                    textAlign: 'left',
                    transition: 'color 0.15s ease',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(99,102,241,1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(99,102,241,0.70)' }}
                >
                  {showMore
                    ? 'Show less'
                    : `+ ${(result ?? '').length - PREVIEW_CHARS} more chars`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
