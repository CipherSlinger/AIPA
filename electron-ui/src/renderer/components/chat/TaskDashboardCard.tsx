import React from 'react'
import { Check, User, Link2 } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TaskItem {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed'
  owner?: string
  blockedBy?: string[]
  blocks?: string[]
}

interface Props {
  tasks: TaskItem[]
  /** Compact single-task view (for TaskGet) */
  singleTask?: boolean
}

// ── Status badge styles ────────────────────────────────────────────────────────

const STATUS_STYLES: Record<
  TaskItem['status'],
  { bg: string; border: string; color: string; label: string }
> = {
  pending: {
    bg: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.28)',
    color: 'rgba(148,163,184,0.85)',
    label: 'Pending',
  },
  in_progress: {
    bg: 'rgba(99,102,241,0.14)',
    border: 'rgba(99,102,241,0.35)',
    color: 'rgba(165,180,252,0.92)',
    label: 'In Progress',
  },
  completed: {
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.30)',
    color: 'rgba(74,222,128,0.92)',
    label: 'Completed',
  },
}

// Keyframe injection for the in_progress pulse animation
let _kfInjected = false
function ensureTaskCardKeyframes() {
  if (_kfInjected) return
  _kfInjected = true
  const style = document.createElement('style')
  style.id = 'task-dashboard-card-kf'
  style.textContent = `
    @keyframes task-status-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
  `
  document.head.appendChild(style)
}

// ── Status indicator dot ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: TaskItem['status'] }) {
  ensureTaskCardKeyframes()
  const s = STATUS_STYLES[status]
  const isInProgress = status === 'in_progress'

  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: s.color,
        flexShrink: 0,
        animation: isInProgress ? 'task-status-pulse 1.8s ease-in-out infinite' : 'none',
      }}
    />
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaskItem['status'] }) {
  const s = STATUS_STYLES[status]
  const isCompleted = status === 'completed'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 7px',
        borderRadius: 10,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {isCompleted ? (
        <Check size={8} style={{ flexShrink: 0 }} />
      ) : (
        <StatusDot status={status} />
      )}
      {s.label}
    </span>
  )
}

// ── Short task ID display (first 6 chars) ─────────────────���───────────────────

function ShortId({ id }: { id: string }) {
  const short = id.length > 6 ? id.slice(0, 6) : id
  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 9,
        color: 'var(--text-muted)',
        background: 'var(--bg-hover)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '1px 5px',
        letterSpacing: '0.04em',
        flexShrink: 0,
        userSelect: 'all',
      }}
      title={id}
    >
      #{short}
    </span>
  )
}

// ── Single task row ───────────────────────────────────────────────────────────

function TaskRow({ task, isLast }: { task: TaskItem; isLast: boolean }) {
  const blockedCount = task.blockedBy?.length ?? 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderBottom: isLast ? 'none' : '1px solid var(--bg-hover)',
        transition: 'background 0.12s ease',
      }}
    >
      {/* Status badge */}
      <StatusBadge status={task.status} />

      {/* Short ID */}
      <ShortId id={task.id} />

      {/* Subject */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color:
            task.status === 'completed'
              ? 'rgba(74,222,128,0.75)'
              : 'var(--text-primary)',
          textDecoration: task.status === 'completed' ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}
        title={task.subject}
      >
        {task.subject}
      </span>

      {/* Owner */}
      {task.owner && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
          title={`Owner: ${task.owner}`}
        >
          <User size={9} />
          {task.owner}
        </span>
      )}

      {/* Blocked-by count */}
      {blockedCount > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(251,191,36,0.80)',
            background: 'rgba(251,191,36,0.10)',
            border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: 8,
            padding: '1px 5px',
            flexShrink: 0,
          }}
          title={`Blocked by ${blockedCount} task(s)`}
        >
          <Link2 size={8} />
          {blockedCount}
        </span>
      )}
    </div>
  )
}

// ── Kanban column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
}: {
  status: TaskItem['status']
  tasks: TaskItem[]
}) {
  const s = STATUS_STYLES[status]

  if (tasks.length === 0) return null

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid var(--border)`,
        borderTop: `2px solid ${s.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Column header */}
      <div
        style={{
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderBottom: '1px solid var(--bg-hover)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <StatusDot status={status} />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: s.color,
            flex: 1,
          }}
        >
          {s.label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Task cards in column */}
      <div style={{ padding: '4px 0' }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              padding: '5px 10px',
              borderBottom: '1px solid var(--bg-hover)',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {/* Subject + ID row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ShortId id={task.id} />
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontWeight: 500,
                  color:
                    task.status === 'completed'
                      ? 'rgba(74,222,128,0.70)'
                      : 'var(--text-primary)',
                  textDecoration:
                    task.status === 'completed' ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={task.subject}
              >
                {task.subject}
              </span>
            </div>

            {/* Owner + blocked row */}
            {(task.owner || (task.blockedBy?.length ?? 0) > 0) && (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {task.owner && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 9,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <User size={8} />
                    {task.owner}
                  </span>
                )}
                {(task.blockedBy?.length ?? 0) > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 9,
                      color: 'rgba(251,191,36,0.75)',
                      background: 'rgba(251,191,36,0.10)',
                      border: '1px solid rgba(251,191,36,0.22)',
                      borderRadius: 6,
                      padding: '1px 4px',
                    }}
                  >
                    <Link2 size={7} />
                    blocked by {task.blockedBy!.length}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main TaskDashboardCard ────────────────────────────────────────────────────

export default function TaskDashboardCard({ tasks, singleTask }: Props) {
  if (tasks.length === 0) {
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}
      >
        No tasks found.
      </div>
    )
  }

  const pending = tasks.filter((t) => t.status === 'pending')
  const inProgress = tasks.filter((t) => t.status === 'in_progress')
  const completed = tasks.filter((t) => t.status === 'completed')
  const totalCount = tasks.length

  // For a single task or very few tasks, use flat list view instead of Kanban
  const useFlatList = singleTask || totalCount <= 3

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid var(--bg-hover)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Tasks
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {inProgress.length > 0 && (
            <span
              style={{
                fontSize: 10,
                color: 'rgba(165,180,252,0.80)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <StatusDot status="in_progress" />
              {inProgress.length} active
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {completed.length}/{totalCount}
          </span>
        </div>
      </div>

      {useFlatList ? (
        /* Flat list for single task or small sets */
        <div>
          {tasks.map((task, idx) => (
            <TaskRow key={task.id} task={task} isLast={idx === tasks.length - 1} />
          ))}
        </div>
      ) : (
        /* 3-column Kanban for larger sets */
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px',
          }}
        >
          <KanbanColumn status="pending" tasks={pending} />
          <KanbanColumn status="in_progress" tasks={inProgress} />
          <KanbanColumn status="completed" tasks={completed} />
        </div>
      )}
    </div>
  )
}
