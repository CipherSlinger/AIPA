// TasksPanel — Quick todo list + reminders with persistence via electron-store (Iteration 465-466, 482)
// Accessible from NavRail 'tasks' tab. Tasks stored in prefs key 'tasks', reminders in 'reminders'.
// Iteration 482: Added cron expression support for recurring reminders.

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Plus, Trash2, CheckSquare, Square, X, Bell, Clock, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { nextFireTime, describeCron, CRON_PRESETS } from '../../utils/cronScheduler'

export interface TaskItem {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export interface ReminderItem {
  id: string
  text: string
  fireAt: number  // timestamp of next fire
  createdAt: number
  cronExpression?: string  // if set, this is a recurring cron reminder (Iteration 482)
  recurring?: boolean      // true if cron-based and fires more than once
}

// Preset reminder durations
const REMINDER_PRESETS = [
  { labelKey: 'reminders.in5min', minutes: 5 },
  { labelKey: 'reminders.in15min', minutes: 15 },
  { labelKey: 'reminders.in30min', minutes: 30 },
  { labelKey: 'reminders.in1hr', minutes: 60 },
  { labelKey: 'reminders.in2hr', minutes: 120 },
] as const

export default function TasksPanel() {
  const t = useT()
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [remindersExpanded, setRemindersExpanded] = useState(true)
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [reminderText, setReminderText] = useState('')
  const [cronMode, setCronMode] = useState(false)          // Iteration 482: toggle cron mode
  const [cronExpr, setCronExpr] = useState('')             // cron expression input
  const [cronPreview, setCronPreview] = useState<string | null>(null)
  const [, forceUpdate] = useState(0)

  // Load tasks from prefs
  const tasks: TaskItem[] = usePrefsStore(s => (s.prefs as any).tasks || [])
  const setTasks = useCallback((newTasks: TaskItem[]) => {
    usePrefsStore.getState().setPrefs({ tasks: newTasks } as any)
    window.electronAPI.prefsSet('tasks', newTasks)
  }, [])

  // Load reminders from prefs
  const reminders: ReminderItem[] = usePrefsStore(s => (s.prefs as any).reminders || [])
  const setReminders = useCallback((newReminders: ReminderItem[]) => {
    usePrefsStore.getState().setPrefs({ reminders: newReminders } as any)
    window.electronAPI.prefsSet('reminders', newReminders)
  }, [])

  // Filter to only future reminders, sorted by fireAt
  const activeReminders = useMemo(() =>
    reminders.filter(r => r.fireAt > Date.now()).sort((a, b) => a.fireAt - b.fireAt),
    [reminders]
  )

  // Reminder scheduling: check every 10s for fired reminders
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now()
      const currentReminders: ReminderItem[] = usePrefsStore.getState().prefs.reminders as any || []
      const fired = currentReminders.filter(r => r.fireAt <= now)
      if (fired.length > 0) {
        // Fire notifications
        fired.forEach(r => {
          useUiStore.getState().addToast('info', `${t('reminders.fired')}: ${r.text}`, 8000)
          // Desktop notification
          try {
            new Notification('AIPA Reminder', { body: r.text, icon: undefined })
          } catch { /* notification permission may not be granted */ }
        })
        // Iteration 482: For recurring cron reminders, reschedule; for one-shot, remove
        const rescheduled: ReminderItem[] = fired
          .filter(r => r.recurring && r.cronExpression)
          .map(r => {
            const nextFire = nextFireTime(r.cronExpression!, new Date())
            if (!nextFire) return null
            return { ...r, fireAt: nextFire.getTime(), lastFiredAt: now } as ReminderItem
          })
          .filter((r): r is ReminderItem => r !== null)

        const remaining = [
          ...currentReminders.filter(r => r.fireAt > now),
          ...rescheduled,
        ]
        usePrefsStore.getState().setPrefs({ reminders: remaining } as any)
        window.electronAPI.prefsSet('reminders', remaining)
      }
    }
    const interval = setInterval(checkReminders, 10000)
    checkReminders() // immediate check on mount
    return () => clearInterval(interval)
  }, [t])

  // Update display every minute to keep "in X min" labels fresh
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 60000)
    return () => clearInterval(interval)
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

  const addReminder = useCallback((minutes: number) => {
    const text = reminderText.trim()
    if (!text) return
    const newReminder: ReminderItem = {
      id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      fireAt: Date.now() + minutes * 60000,
      createdAt: Date.now(),
    }
    setReminders([...reminders, newReminder])
    setReminderText('')
    setShowReminderForm(false)
  }, [reminderText, reminders, setReminders])

  // Iteration 482: Add cron-based recurring reminder
  const addCronReminder = useCallback(() => {
    const text = reminderText.trim()
    const expr = cronExpr.trim()
    if (!text || !expr) return
    const nextFire = nextFireTime(expr)
    if (!nextFire) return
    const newReminder: ReminderItem = {
      id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      fireAt: nextFire.getTime(),
      createdAt: Date.now(),
      cronExpression: expr,
      recurring: true,
    }
    setReminders([...reminders, newReminder])
    setReminderText('')
    setCronExpr('')
    setCronMode(false)
    setShowReminderForm(false)
  }, [reminderText, cronExpr, reminders, setReminders])

  const deleteReminder = useCallback((id: string) => {
    setReminders(reminders.filter(r => r.id !== id))
  }, [reminders, setReminders])

  const formatTimeLeft = (fireAt: number) => {
    const diff = fireAt - Date.now()
    if (diff <= 0) return t('reminders.now')
    const mins = Math.ceil(diff / 60000)
    if (mins < 60) return t('reminders.inMinutes', { count: String(mins) })
    const hrs = Math.floor(mins / 60)
    const remainMins = mins % 60
    if (remainMins === 0) return t('reminders.inHours', { count: String(hrs) })
    return `${hrs}h ${remainMins}m`
  }

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

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {/* Empty state */}
        {tasks.length === 0 && activeReminders.length === 0 && (
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

        {/* Reminders section */}
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 8px', cursor: 'pointer',
            }}
            onClick={() => setRemindersExpanded(!remindersExpanded)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {remindersExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Bell size={12} color="var(--accent)" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('reminders.title')}
              </span>
              {activeReminders.length > 0 && (
                <span style={{
                  fontSize: 9, background: 'var(--accent)', color: '#fff',
                  borderRadius: 8, padding: '1px 5px', fontWeight: 600,
                }}>
                  {activeReminders.length}
                </span>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowReminderForm(true); setRemindersExpanded(true) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--accent)', display: 'flex', alignItems: 'center', padding: 0,
              }}
            >
              <Plus size={14} />
            </button>
          </div>

          {remindersExpanded && (
            <>
              {/* Reminder creation form */}
              {showReminderForm && (
                <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    value={reminderText}
                    onChange={(e) => setReminderText(e.target.value)}
                    placeholder={t('reminders.textPlaceholder')}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowReminderForm(false) }}
                    style={{
                      padding: '5px 8px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg-active)',
                      color: 'var(--text-primary)', fontSize: 11, outline: 'none',
                    }}
                    maxLength={200}
                  />
                  {reminderText.trim() && (
                    <>
                      {/* Mode toggle: quick presets vs cron expression (Iteration 482) */}
                      <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                        <button
                          onClick={() => setCronMode(false)}
                          style={{
                            padding: '2px 8px', borderRadius: 8, fontSize: 9, cursor: 'pointer',
                            border: '1px solid var(--border)',
                            background: !cronMode ? 'var(--accent)' : 'transparent',
                            color: !cronMode ? '#fff' : 'var(--text-muted)',
                          }}
                        >
                          {t('reminders.quickPresets')}
                        </button>
                        <button
                          onClick={() => setCronMode(true)}
                          style={{
                            padding: '2px 8px', borderRadius: 8, fontSize: 9, cursor: 'pointer',
                            border: '1px solid var(--border)',
                            background: cronMode ? 'var(--accent)' : 'transparent',
                            color: cronMode ? '#fff' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <RefreshCw size={9} />
                          {t('reminders.recurring')}
                        </button>
                      </div>

                      {!cronMode ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {REMINDER_PRESETS.map(preset => (
                            <button
                              key={preset.minutes}
                              onClick={() => addReminder(preset.minutes)}
                              style={{
                                padding: '3px 8px', borderRadius: 10,
                                border: '1px solid var(--border)', background: 'var(--bg-active)',
                                color: 'var(--text-primary)', fontSize: 10, cursor: 'pointer',
                                transition: 'background 100ms, border-color 100ms',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--accent)'
                                e.currentTarget.style.color = '#fff'
                                e.currentTarget.style.borderColor = 'var(--accent)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--bg-active)'
                                e.currentTarget.style.color = 'var(--text-primary)'
                                e.currentTarget.style.borderColor = 'var(--border)'
                              }}
                            >
                              {t(preset.labelKey)}
                            </button>
                          ))}
                          <button
                            onClick={() => setShowReminderForm(false)}
                            style={{
                              padding: '3px 8px', borderRadius: 10,
                              border: '1px solid var(--border)', background: 'transparent',
                              color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer',
                            }}
                          >
                            {t('reminders.cancel')}
                          </button>
                        </div>
                      ) : (
                        /* Cron expression input (Iteration 482) */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {/* Cron presets */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {CRON_PRESETS.map(p => (
                              <button
                                key={p.cron}
                                onClick={() => { setCronExpr(p.cron); setCronPreview(describeCron(p.cron)) }}
                                style={{
                                  padding: '2px 6px', borderRadius: 8, fontSize: 9, cursor: 'pointer',
                                  border: cronExpr === p.cron ? '1px solid var(--accent)' : '1px solid var(--border)',
                                  background: cronExpr === p.cron ? 'rgba(var(--accent-rgb,59,130,246),0.1)' : 'transparent',
                                  color: cronExpr === p.cron ? 'var(--accent)' : 'var(--text-muted)',
                                }}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                          {/* Manual cron input */}
                          <input
                            value={cronExpr}
                            onChange={e => {
                              setCronExpr(e.target.value)
                              setCronPreview(describeCron(e.target.value))
                            }}
                            placeholder="* * * * * (min hr dom mon dow)"
                            style={{
                              padding: '4px 8px', borderRadius: 6, fontSize: 10,
                              border: '1px solid var(--border)', background: 'var(--bg-active)',
                              color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace',
                            }}
                          />
                          {cronPreview && (
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', paddingLeft: 2 }}>
                              {cronPreview}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={addCronReminder}
                              disabled={!cronExpr.trim() || !cronPreview}
                              style={{
                                padding: '3px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer',
                                border: 'none',
                                background: cronExpr.trim() && cronPreview ? 'var(--accent)' : 'var(--bg-active)',
                                color: cronExpr.trim() && cronPreview ? '#fff' : 'var(--text-muted)',
                              }}
                            >
                              {t('reminders.setRecurring')}
                            </button>
                            <button
                              onClick={() => setShowReminderForm(false)}
                              style={{
                                padding: '3px 8px', borderRadius: 8, fontSize: 10, cursor: 'pointer',
                                border: '1px solid var(--border)', background: 'transparent',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {t('reminders.cancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Active reminders list */}
              {activeReminders.length === 0 && !showReminderForm && (
                <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {t('reminders.empty')}
                </div>
              )}
              {activeReminders.map(reminder => (
                <ReminderRow
                  key={reminder.id}
                  reminder={reminder}
                  onDelete={deleteReminder}
                  formatTimeLeft={formatTimeLeft}
                />
              ))}
            </>
          )}
        </div>
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

function ReminderRow({ reminder, onDelete, formatTimeLeft }: {
  reminder: ReminderItem
  onDelete: (id: string) => void
  formatTimeLeft: (fireAt: number) => string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 8px', borderRadius: 6,
        background: hovered ? 'var(--popup-item-hover)' : 'transparent',
        transition: 'background 100ms',
      }}
    >
      <Clock size={12} style={{ color: reminder.recurring ? '#8b5cf6' : 'var(--accent)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
        {reminder.text}
        {reminder.recurring && (
          <RefreshCw size={9} style={{ display: 'inline', marginLeft: 4, color: '#8b5cf6', verticalAlign: 'middle' }} />
        )}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {formatTimeLeft(reminder.fireAt)}
      </span>
      {hovered && (
        <button
          onClick={() => onDelete(reminder.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            padding: 0, flexShrink: 0,
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
