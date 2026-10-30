// The work routed to one department page.
//
// A department is a processor: its page shows the seats it can fill and the
// tasks that currently point at it. A task is the unit of work and it owns its
// folder, so this list never names or opens a department directory — it only
// opens the conversation the task recorded.
import { useMemo } from 'react'
import { AlertTriangle, FileText, ListTodo, MessageSquare } from 'lucide-react'
import type { TaskRecordData, TaskSessionRefData } from '../../../preload'
import { useTaskStore } from '../../store'
import { useI18n } from '../../i18n'
import { formatTaskTime, statusColor, statusLabelKey } from '../tasks/taskUi'

interface Props {
  deptId: string
  /** Opens the task's latest conversation, or its draft when it has none. */
  onOpenTask: (task: TaskRecordData, ref: TaskSessionRefData | null) => void
}

export default function DepartmentTasks({ deptId, onOpenTask }: Props) {
  const { t, resolvedLocale } = useI18n()
  const tasks = useTaskStore(s => s.tasks)
  // Exact match: a team is its own processor, so its page does not repeat the
  // tasks routed to the department above it.
  const routed = useMemo(
    () => tasks
      .filter(task => task.departmentId === deptId)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks, deptId],
  )

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 10,
        borderLeft: '2px solid rgba(34,197,94,0.7)',
        marginBottom: 8,
      }}>
        <ListTodo size={12} color="var(--text-muted)" />
        <span style={{
          color: 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}>
          {t('dept.tasks.title')}
        </span>
        <span style={{
          background: 'var(--border)',
          borderRadius: 20,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--text-muted)',
        }}>
          {routed.length}
        </span>
      </div>

      {routed.length === 0 ? (
        <div style={{
          padding: '14px 16px',
          borderRadius: 10,
          border: '1px dashed var(--border)',
          color: 'var(--text-muted)',
          fontSize: 11.5,
          lineHeight: 1.6,
        }}>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>
            {t('dept.tasks.empty')}
          </div>
          {t('dept.tasks.emptyHint')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {routed.map(task => {
            const latest = task.sessions.length > 0
              ? task.sessions[task.sessions.length - 1]
              : null
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task, latest)}
                title={t('dept.tasks.open')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(34,197,94,0.45)'
                  e.currentTarget.style.background = 'var(--bg-active)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--bg-hover)'
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: statusColor(task.status),
                }} />
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {task.title}
                </span>
                {task.missing && (
                  <span title={t('tasks.missing')} style={{ display: 'flex', flexShrink: 0 }}>
                    <AlertTriangle size={11} color="var(--warning)" />
                  </span>
                )}
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 10, color: 'var(--text-subtle)', flexShrink: 0,
                }}>
                  <span>{t(statusLabelKey(task.status))}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <FileText size={10} />
                    {task.materials.length}
                  </span>
                  <span title={t('tasks.lastActivity', { when: formatTaskTime(task.updatedAt, resolvedLocale) })}>
                    {formatTaskTime(task.updatedAt, resolvedLocale)}
                  </span>
                </span>
                <MessageSquare size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
