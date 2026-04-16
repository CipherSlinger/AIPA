import { useT } from '../../i18n'

export interface TodoItem {
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'high' | 'medium' | 'low'
}

interface Props {
  todos: TodoItem[]
}

const PRIORITY_DOT_COLOR: Record<string, string> = {
  high: 'rgba(239,68,68,0.82)',
  medium: 'rgba(251,191,36,0.82)',
  low: 'var(--text-muted)',
}

const PRIORITY_LABEL_COLOR: Record<string, string> = {
  high: 'rgba(239,68,68,0.82)',
  medium: 'rgba(251,191,36,0.82)',
  low: 'var(--text-muted)',
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  if (status === 'completed') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'rgba(34,197,94,0.18)',
          border: '1.5px solid rgba(34,197,94,0.60)',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="rgba(34,197,94,0.92)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'rgba(251,191,36,0.12)',
          border: '1.5px solid rgba(251,191,36,0.55)',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(251,191,36,0.82)',
            display: 'block',
          }}
        />
      </span>
    )
  }
  // pending
  return (
    <span
      style={{
        display: 'inline-block',
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,0.20)',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    />
  )
}

function PriorityDot({ priority }: { priority: NonNullable<TodoItem['priority']> }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: PRIORITY_DOT_COLOR[priority] ?? 'var(--text-muted)',
        flexShrink: 0,
        marginTop: 5,
        transition: 'all 0.15s ease',
      }}
      title={priority}
    />
  )
}

export default function TodoListView({ todos }: Props) {
  const t = useT()

  const completed = todos.filter(td => td.status === 'completed').length
  const inProgress = todos.filter(td => td.status === 'in_progress').length

  if (todos.length === 0) {
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          fontSize: 11,
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          transition: 'all 0.15s ease',
        }}
      >
        {t('tool.todoNoItems')}
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
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
          {t('tool.todoHeader')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {inProgress > 0 && (
            <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.70)' }}>
              {inProgress} {t('tool.todoStatusInProgress').toLowerCase()}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {completed}/{todos.length}
          </span>
        </div>
      </div>

      {/* Todo items */}
      <div style={{ padding: '4px 0' }}>
        {todos.map((todo, idx) => {
          const isDone = todo.status === 'completed'
          const isActive = todo.status === 'in_progress'
          const textColor = isDone
            ? 'rgba(34,197,94,0.82)'
            : isActive
            ? 'rgba(251,191,36,0.82)'
            : 'var(--text-secondary)'

          return (
            <div
              key={todo.id ?? idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: '5px 12px',
                borderBottom:
                  idx < todos.length - 1
                    ? '1px solid var(--bg-hover)'
                    : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Status icon */}
              <StatusIcon status={todo.status} />

              {/* Content */}
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: textColor,
                  textDecoration: isDone ? 'line-through' : 'none',
                  lineHeight: 1.55,
                  wordBreak: 'break-word',
                  transition: 'all 0.15s ease',
                }}
              >
                {todo.content}
              </span>

              {/* Priority dot */}
              {todo.priority && (
                <PriorityDot priority={todo.priority} />
              )}

              {/* Priority label (hidden, accessible via title on dot) */}
              {todo.priority && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 9,
                    fontWeight: 700,
                    color: PRIORITY_LABEL_COLOR[todo.priority] ?? 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    marginTop: 2,
                    opacity: 0.75,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t(`tool.todoPriority${todo.priority.charAt(0).toUpperCase() + todo.priority.slice(1)}` as Parameters<typeof t>[0])}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
