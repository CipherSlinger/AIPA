// TasksPanel — Quick todo list + reminders with persistence via electron-store (Iteration 465-466, 482, 488)
// Accessible from NavRail 'tasks' tab. Tasks stored in prefs key 'tasks', reminders in 'reminders'.
// Iteration 482: Added cron expression support for recurring reminders.
// Iteration 488: TaskItem upgraded to 3-state status (pending/in_progress/completed) + activeForm
//                5s hide-delay after all tasks complete, inspired by Claude Code's useTasksV2.ts
// Iteration 510: Decomposed — extracted useTasksCrud, TaskItemRow, ReminderSection

import React, { useState, useRef, useCallback } from 'react'
import { Plus, Trash2, CheckSquare } from 'lucide-react'
import { useT } from '../../i18n'
import { useTasksCrud } from './useTasksCrud'
import TaskItemRow from './TaskItemRow'
import ReminderSection from './ReminderSection'

export type { TaskStatus, TaskItem, ReminderItem } from './useTasksCrud'

export default function TasksPanel() {
  const t = useT()
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const crud = useTasksCrud()

  const addTask = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    crud.addTask(text)
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, crud])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px 8px',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>{t('tasks.title')}</span>
        {crud.activeTasks.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            {t('tasks.count', { count: String(crud.activeTasks.length) })}
          </span>
        )}
      </div>

      {/* Add task input */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
          placeholder={t('tasks.addPlaceholder')}
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-active)',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
          }}
          maxLength={200}
        />
        <button
          onClick={addTask}
          disabled={!inputValue.trim()}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: 'none',
            background: inputValue.trim() ? 'var(--accent)' : 'var(--bg-active)',
            color: inputValue.trim() ? '#fff' : 'var(--text-muted)',
            cursor: inputValue.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            transition: 'background 150ms',
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {/* Empty state */}
        {crud.tasks.length === 0 && crud.activeReminders.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '32px 16px', gap: 8,
            color: 'var(--text-muted)', fontSize: 12,
          }}>
            <CheckSquare size={28} style={{ opacity: 0.4 }} />
            <span>{t('tasks.empty')}</span>
          </div>
        )}

        {/* Active tasks */}
        {crud.activeTasks.map(task => (
          <TaskItemRow key={task.id} task={task} onCycle={crud.cycleTaskStatus} onDelete={crud.deleteTask} />
        ))}

        {/* Completed tasks — shown until 5s after all complete */}
        {crud.completedTasks.length > 0 && crud.showCompleted && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 8px 4px', marginTop: 4,
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('tasks.completed', { count: String(crud.completedTasks.length) })}
              </span>
              <button
                onClick={crud.clearCompleted}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 10,
                  display: 'flex', alignItems: 'center', gap: 3,
                  transition: 'color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <Trash2 size={10} />
                {t('tasks.clearCompleted')}
              </button>
            </div>
            {crud.completedTasks.map(task => (
              <TaskItemRow key={task.id} task={task} onCycle={crud.cycleTaskStatus} onDelete={crud.deleteTask} />
            ))}
          </>
        )}

        {/* Reminders section */}
        <ReminderSection
          activeReminders={crud.activeReminders}
          onAddReminder={crud.addReminder}
          onAddCronReminder={crud.addCronReminder}
          onDeleteReminder={crud.deleteReminder}
          formatTimeLeft={crud.formatTimeLeft}
        />
      </div>

      {/* Footer with task limit warning */}
      {crud.tasks.length >= 90 && (
        <div style={{
          padding: '4px 12px', fontSize: 10, color: 'var(--warning)',
          textAlign: 'center', borderTop: '1px solid var(--border)',
        }}>
          {t('tasks.limitWarning', { count: String(crud.tasks.length) })}
        </div>
      )}
    </div>
  )
}
