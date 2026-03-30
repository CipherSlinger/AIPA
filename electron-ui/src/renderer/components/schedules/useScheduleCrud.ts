import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { ScheduledPrompt, ScheduleRepeat } from '../../types/app.types'
import { MAX_SCHEDULES, MAX_NAME_LENGTH, MAX_PROMPT_LENGTH, PRESET_SCHEDULES, computeNextRun } from './scheduleConstants'

export function useScheduleCrud(t: (key: string) => string) {
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToast = useUiStore(s => s.addToast)
  const addToQueue = useChatStore(s => s.addToQueue)

  const schedules: ScheduledPrompt[] = prefs.scheduledPrompts || []

  const [searchQuery, setSearchQuery] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [formIcon, setFormIcon] = useState('⏰')
  const [formRepeat, setFormRepeat] = useState<ScheduleRepeat>('daily')
  const [formHour, setFormHour] = useState(9)
  const [formMinute, setFormMinute] = useState(0)
  const [formDayOfWeek, setFormDayOfWeek] = useState(1) // Monday
  const [formDayOfMonth, setFormDayOfMonth] = useState(1)
  const [showIconPicker, setShowIconPicker] = useState(false)

  // Timer for checking scheduled prompts
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check for due scheduled prompts every 30 seconds
  useEffect(() => {
    const checkDueSchedules = () => {
      const currentSchedules: ScheduledPrompt[] = usePrefsStore.getState().prefs.scheduledPrompts || []
      const now = Date.now()
      let updated = false
      const updatedSchedules = currentSchedules.map(s => {
        if (!s.enabled) return s
        if (s.nextRunAt <= now) {
          addToQueue(s.prompt)
          addToast(t('schedule.triggered').replace('{{name}}', s.name), 'info' as any)

          const newNext = s.repeat === 'once'
            ? s.nextRunAt
            : computeNextRun(s.repeat, s.hour, s.minute, s.dayOfWeek, s.dayOfMonth)

          updated = true
          return {
            ...s,
            lastRunAt: now,
            nextRunAt: newNext,
            runCount: s.runCount + 1,
            enabled: s.repeat !== 'once',
          }
        }
        return s
      })

      if (updated) {
        usePrefsStore.getState().setPrefs({ scheduledPrompts: updatedSchedules })
      }
    }

    timerRef.current = setInterval(checkDueSchedules, 30000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [addToQueue, addToast, t])

  const filteredSchedules = useMemo(() => {
    if (!searchQuery.trim()) return schedules
    const q = searchQuery.toLowerCase()
    return schedules.filter(s =>
      s.name.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q)
    )
  }, [schedules, searchQuery])

  const resetForm = useCallback(() => {
    setFormName('')
    setFormPrompt('')
    setFormIcon('⏰')
    setFormRepeat('daily')
    setFormHour(9)
    setFormMinute(0)
    setFormDayOfWeek(1)
    setFormDayOfMonth(1)
    setShowIconPicker(false)
  }, [])

  const handleAdd = useCallback(() => {
    if (!formName.trim() || !formPrompt.trim()) return
    if (schedules.length >= MAX_SCHEDULES) {
      addToast(t('schedule.limitReached'), 'warning' as any)
      return
    }

    const now = Date.now()
    const newSchedule: ScheduledPrompt = {
      id: `sched-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: formName.trim().slice(0, MAX_NAME_LENGTH),
      prompt: formPrompt.trim().slice(0, MAX_PROMPT_LENGTH),
      icon: formIcon,
      repeat: formRepeat,
      hour: formHour,
      minute: formMinute,
      dayOfWeek: formRepeat === 'weekly' ? formDayOfWeek : undefined,
      dayOfMonth: formRepeat === 'monthly' ? formDayOfMonth : undefined,
      enabled: true,
      nextRunAt: computeNextRun(formRepeat, formHour, formMinute,
        formRepeat === 'weekly' ? formDayOfWeek : undefined,
        formRepeat === 'monthly' ? formDayOfMonth : undefined
      ),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    setPrefs({ scheduledPrompts: [...schedules, newSchedule] })
    addToast(t('schedule.created'), 'success' as any)
    resetForm()
    setShowAddForm(false)
  }, [formName, formPrompt, formIcon, formRepeat, formHour, formMinute, formDayOfWeek, formDayOfMonth, schedules, setPrefs, addToast, resetForm, t])

  const handleToggle = useCallback((id: string) => {
    const updated = schedules.map(s => {
      if (s.id !== id) return s
      const newEnabled = !s.enabled
      return {
        ...s,
        enabled: newEnabled,
        nextRunAt: newEnabled
          ? computeNextRun(s.repeat, s.hour, s.minute, s.dayOfWeek, s.dayOfMonth)
          : s.nextRunAt,
        updatedAt: Date.now(),
      }
    })
    setPrefs({ scheduledPrompts: updated })
  }, [schedules, setPrefs])

  const handleDelete = useCallback((id: string) => {
    setPrefs({ scheduledPrompts: schedules.filter(s => s.id !== id) })
    addToast(t('schedule.deleted'), 'info' as any)
  }, [schedules, setPrefs, addToast, t])

  const handleRunNow = useCallback((id: string) => {
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return
    addToQueue(schedule.prompt)
    addToast(t('schedule.runNow').replace('{{name}}', schedule.name), 'success' as any)

    const updated = schedules.map(s => {
      if (s.id !== id) return s
      return { ...s, lastRunAt: Date.now(), runCount: s.runCount + 1, updatedAt: Date.now() }
    })
    setPrefs({ scheduledPrompts: updated })
  }, [schedules, setPrefs, addToQueue, addToast, t])

  const handleEdit = useCallback((s: ScheduledPrompt) => {
    setEditingId(s.id)
    setFormName(s.name)
    setFormPrompt(s.prompt)
    setFormIcon(s.icon)
    setFormRepeat(s.repeat)
    setFormHour(s.hour)
    setFormMinute(s.minute)
    setFormDayOfWeek(s.dayOfWeek ?? 1)
    setFormDayOfMonth(s.dayOfMonth ?? 1)
    setShowAddForm(false)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !formName.trim() || !formPrompt.trim()) return
    const updated = schedules.map(s => {
      if (s.id !== editingId) return s
      return {
        ...s,
        name: formName.trim().slice(0, MAX_NAME_LENGTH),
        prompt: formPrompt.trim().slice(0, MAX_PROMPT_LENGTH),
        icon: formIcon,
        repeat: formRepeat,
        hour: formHour,
        minute: formMinute,
        dayOfWeek: formRepeat === 'weekly' ? formDayOfWeek : undefined,
        dayOfMonth: formRepeat === 'monthly' ? formDayOfMonth : undefined,
        nextRunAt: s.enabled
          ? computeNextRun(formRepeat, formHour, formMinute,
              formRepeat === 'weekly' ? formDayOfWeek : undefined,
              formRepeat === 'monthly' ? formDayOfMonth : undefined
            )
          : s.nextRunAt,
        updatedAt: Date.now(),
      }
    })
    setPrefs({ scheduledPrompts: updated })
    addToast(t('schedule.updated'), 'success' as any)
    setEditingId(null)
    resetForm()
  }, [editingId, formName, formPrompt, formIcon, formRepeat, formHour, formMinute, formDayOfWeek, formDayOfMonth, schedules, setPrefs, addToast, resetForm, t])

  const handleInstallPreset = useCallback((preset: typeof PRESET_SCHEDULES[0]) => {
    if (schedules.length >= MAX_SCHEDULES) {
      addToast(t('schedule.limitReached'), 'warning' as any)
      return
    }
    const now = Date.now()
    const newSchedule: ScheduledPrompt = {
      ...preset,
      id: `sched-${now}-${Math.random().toString(36).slice(2, 6)}`,
      nextRunAt: computeNextRun(preset.repeat, preset.hour, preset.minute, preset.dayOfWeek, preset.dayOfMonth),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    setPrefs({ scheduledPrompts: [...schedules, newSchedule] })
    addToast(t('schedule.installed').replace('{{name}}', preset.name), 'success' as any)
  }, [schedules, setPrefs, addToast, t])

  return {
    schedules,
    filteredSchedules,
    // Search
    searchQuery, setSearchQuery,
    // Add form
    showAddForm, setShowAddForm,
    // Edit
    editingId, setEditingId,
    // Form state
    formName, setFormName,
    formPrompt, setFormPrompt,
    formIcon, setFormIcon,
    formRepeat, setFormRepeat,
    formHour, setFormHour,
    formMinute, setFormMinute,
    formDayOfWeek, setFormDayOfWeek,
    formDayOfMonth, setFormDayOfMonth,
    showIconPicker, setShowIconPicker,
    // Actions
    resetForm, handleAdd, handleToggle, handleDelete,
    handleRunNow, handleEdit, handleSaveEdit, handleInstallPreset,
  }
}
