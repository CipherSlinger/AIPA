// useTasksCrud — task + reminder CRUD operations with persistence (extracted from TasksPanel, Iteration 510)
// Uses electron-store via prefsStore + window.electronAPI.prefsSet for persistence.

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { nextFireTime } from '../../utils/cronScheduler'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export interface TaskItem {
  id: string
  text: string
  /** @deprecated use status instead */
  done?: boolean
  status: TaskStatus
  activeForm?: string   // present-continuous label shown when in_progress (e.g. "Running tests")
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

export function useTasksCrud() {
  const t = useT()
  const [showCompleted, setShowCompleted] = useState(true) // Iteration 488: 5s hide-delay
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, forceUpdate] = useState(0)

  // Load tasks from prefs — migrate legacy `done: boolean` to `status`
  const rawTasks: TaskItem[] = usePrefsStore(s => (s.prefs as any).tasks || [])
  const tasks: TaskItem[] = useMemo(() =>
    rawTasks.map(t => ({
      ...t,
      status: t.status ?? (t.done ? 'completed' : 'pending'),
    })),
    [rawTasks]
  )
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
      const currentReminders: ReminderItem[] = (usePrefsStore.getState().prefs as any).reminders || []
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
  const activeTasks = tasks.filter(t => t.status !== 'completed')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  // Iteration 488: 5s hide-delay after all tasks complete
  useEffect(() => {
    if (tasks.length > 0 && activeTasks.length === 0) {
      hideTimerRef.current = setTimeout(() => setShowCompleted(false), 5000)
    } else {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setShowCompleted(true)
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [activeTasks.length, tasks.length])

  // Cycle through status: pending -> in_progress -> completed -> pending
  const cycleTaskStatus = useCallback((id: string) => {
    setTasks(tasks.map(task => {
      if (task.id !== id) return task
      const next: TaskStatus =
        task.status === 'pending' ? 'in_progress' :
        task.status === 'in_progress' ? 'completed' : 'pending'
      return { ...task, status: next }
    }))
  }, [tasks, setTasks])

  const deleteTask = useCallback((id: string) => {
    setTasks(tasks.filter(t => t.id !== id))
  }, [tasks, setTasks])

  const clearCompleted = useCallback(() => {
    setTasks(tasks.filter(t => t.status !== 'completed'))
  }, [tasks, setTasks])

  const addTask = useCallback((text: string) => {
    if (!text.trim()) return
    if (tasks.length >= 100) return // soft limit
    const newTask: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: text.trim(),
      status: 'pending',
      createdAt: Date.now(),
    }
    setTasks([newTask, ...tasks])
  }, [tasks, setTasks])

  const addReminder = useCallback((text: string, minutes: number) => {
    if (!text.trim()) return
    const newReminder: ReminderItem = {
      id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: text.trim(),
      fireAt: Date.now() + minutes * 60000,
      createdAt: Date.now(),
    }
    setReminders([...reminders, newReminder])
  }, [reminders, setReminders])

  // Iteration 482: Add cron-based recurring reminder
  const addCronReminder = useCallback((text: string, cronExpression: string) => {
    if (!text.trim() || !cronExpression.trim()) return
    const nextFire = nextFireTime(cronExpression)
    if (!nextFire) return false
    const newReminder: ReminderItem = {
      id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: text.trim(),
      fireAt: nextFire.getTime(),
      createdAt: Date.now(),
      cronExpression,
      recurring: true,
    }
    setReminders([...reminders, newReminder])
    return true
  }, [reminders, setReminders])

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

  return {
    tasks,
    activeTasks,
    completedTasks,
    showCompleted,
    activeReminders,
    addTask,
    cycleTaskStatus,
    deleteTask,
    clearCompleted,
    addReminder,
    addCronReminder,
    deleteReminder,
    formatTimeLeft,
  }
}
