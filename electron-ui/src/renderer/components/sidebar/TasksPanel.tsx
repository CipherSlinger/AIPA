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
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const crud = useTasksCrud()

  const addTask = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    crud.addTask(text)
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, crud])

  const totalTasks = crud.activeTasks.length + crud.completedTasks.length
  const completedCount = crud.completedTasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'rgba(10,10,18,1)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 10px',
          background: 'linear-gradient(180deg, rgba(99,102,241,0.05) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Micro-label style */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.38)',
            lineHeight: 1.3,
          }}
        >
          {t('tasks.title')}
        </span>
        {crud.activeTasks.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              color: 'rgba(255,255,255,0.60)',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 6,
              padding: '1px 6px',
            }}
          >
            {crud.activeTasks.length}
          </span>
        )}
      </div>

      {/* Add task input */}
      <div style={{ padding: '8px 10px', display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder={t('tasks.addPlaceholder')}
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 7,
            border: inputFocused
              ? '1px solid rgba(99,102,241,0.40)'
              : '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.82)',
            fontSize: 12,
            outline: 'none',
            transition: 'all 0.15s ease',
            boxShadow: inputFocused ? '0 0 0 2px rgba(99,102,241,0.10)' : 'none',
          }}
          maxLength={200}
        />
        <button
          onClick={addTask}
          disabled={!inputValue.trim()}
          style={{
            padding: '4px 10px',
            borderRadius: 7,
            border: 'none',
            background: inputValue.trim()
              ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
              : 'rgba(255,255,255,0.06)',
            color: inputValue.trim() ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
            cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease',
            boxShadow: inputValue.trim() ? '0 2px 8px rgba(99,102,241,0.30)' : 'none',
          }}
          onMouseEnter={(e) => {
            if (inputValue.trim()) {
              e.currentTarget.style.filter = 'brightness(1.05)'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = ''
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = inputValue.trim() ? '0 2px 8px rgba(99,102,241,0.30)' : 'none'
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {/* Empty state */}
        {crud.tasks.length === 0 && crud.activeReminders.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '36px 16px',
              gap: 10,
              textAlign: 'center',
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckSquare size={20} style={{ color: 'rgba(255,255,255,0.25)' }} />
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.38)',
                lineHeight: 1.5,
              }}
            >
              {t('tasks.empty')}
            </span>
          </div>
        )}

        {/* Active tasks */}
        {crud.activeTasks.map(task => (
          <TaskItemRow key={task.id} task={task} onCycle={crud.cycleTaskStatus} onDelete={crud.deleteTask} />
        ))}

        {/* Completed tasks — shown until 5s after all complete */}
        {crud.completedTasks.length > 0 && crud.showCompleted && (
          <>
            {/* Divider with label */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 10px 4px',
                marginTop: 4,
              }}
            >
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <span
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.38)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  flexShrink: 0,
                }}
              >
                {t('tasks.completed', { count: String(crud.completedTasks.length) })}
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <button
                onClick={crud.clearCompleted}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.38)',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  padding: '2px 4px',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#f87171'
                  e.currentTarget.style.background = 'rgba(239,68,68,0.10)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.38)'
                  e.currentTarget.style.background = 'transparent'
                }}
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

        {/* Progress summary */}
        {totalTasks > 0 && (
          <div style={{ padding: '8px 10px 4px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.45)',
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                  letterSpacing: '0.02em',
                }}
              >
                {completedCount} / {totalTasks} done
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: progressPct === 100 ? '#4ade80' : 'rgba(255,255,255,0.38)',
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                  transition: 'all 0.15s ease',
                }}
              >
                {progressPct}%
              </span>
            </div>
            <div
              style={{
                height: 3,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: progressPct === 100
                    ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                    : 'linear-gradient(90deg, #6366f1, #818cf8)',
                  borderRadius: 99,
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
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
        <div
          style={{
            padding: '4px 12px',
            fontSize: 10,
            color: '#fbbf24',
            textAlign: 'center',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}
        >
          {t('tasks.limitWarning', { count: String(crud.tasks.length) })}
        </div>
      )}
    </div>
  )
}
