// TasksPanel — Quick todo list with persistence via electron-store (Iteration 465)
// Accessible from NavRail 'tasks' tab. Tasks stored in prefs key 'tasks'.

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, CheckSquare, Square, X } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'

export interface TaskItem {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export default function TasksPanel() {
  const t = useT()
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Load tasks from prefs
  const tasks: TaskItem[] = usePrefsStore(s => (s.prefs as any).tasks || [])
  const setTasks = useCallback((newTasks: TaskItem[]) => {
    usePrefsStore.getState().setPrefs({ tasks: newTasks } as any)
    window.electronAPI.prefsSet('tasks', newTasks)
  }, [])

  // Split into active and completed
  const activeTasks = tasks.filter(t => !t.done)
  const completedTasks = tasks.filter(t => t.done)

  const addTask = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    if (tasks.length >= 100) return // soft limit
    const newTask: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      done: false,
      createdAt: Date.now(),
    }
    setTasks([newTask, ...tasks])
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, tasks, setTasks])

  const toggleTask = useCallback((id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }, [tasks, setTasks])

  const deleteTask = useCallback((id: string) => {
    setTasks(tasks.filter(t => t.id !== id))
  }, [tasks, setTasks])

  const clearCompleted = useCallback(() => {
    setTasks(tasks.filter(t => !t.done))
  }, [tasks, setTasks])

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
        {activeTasks.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            {t('tasks.count', { count: String(activeTasks.length) })}
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

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {tasks.length === 0 && (
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
        {activeTasks.map(task => (
          <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
        ))}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 8px 4px', marginTop: 4,
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('tasks.completed', { count: String(completedTasks.length) })}
              </span>
              <button
                onClick={clearCompleted}
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
            {completedTasks.map(task => (
              <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
            ))}
          </>
        )}
      </div>

      {/* Footer with task limit warning */}
      {tasks.length >= 90 && (
        <div style={{
          padding: '4px 12px', fontSize: 10, color: 'var(--warning)',
          textAlign: 'center', borderTop: '1px solid var(--border)',
        }}>
          {t('tasks.limitWarning', { count: String(tasks.length) })}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: { task: TaskItem; onToggle: (id: string) => void; onDelete: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)

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
        onClick={() => onToggle(task.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: task.done ? 'var(--success)' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', padding: 0,
          marginTop: 1, flexShrink: 0,
        }}
      >
        {task.done ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>
      <span style={{
        flex: 1, fontSize: 12, lineHeight: 1.4,
        color: task.done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: task.done ? 'line-through' : 'none',
        opacity: task.done ? 0.6 : 1,
        wordBreak: 'break-word',
      }}>
        {task.text}
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
