import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Clock,
  Plus,
  Search,
  Play,
  Pause,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Repeat,
  Timer,
} from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { ScheduledPrompt, ScheduleRepeat } from '../../types/app.types'
import { useT } from '../../i18n'

const MAX_SCHEDULES = 30
const MAX_NAME_LENGTH = 50
const MAX_PROMPT_LENGTH = 2000

const SCHEDULE_ICONS = ['⏰', '📅', '🔔', '📊', '📝', '🎯', '💡', '📧', '🗓️', '✅', '📋', '🔄']

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PRESET_SCHEDULES: Omit<ScheduledPrompt, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'runCount'>[] = [
  {
    name: 'Daily Summary',
    prompt: 'Give me a brief summary of today\'s key tasks and progress. What should I focus on tomorrow?',
    icon: '📊',
    repeat: 'daily',
    hour: 18,
    minute: 0,
    enabled: true,
  },
  {
    name: 'Weekly Review',
    prompt: 'Help me review this week: What went well? What could be improved? What are my priorities for next week?',
    icon: '📅',
    repeat: 'weekly',
    hour: 17,
    minute: 0,
    dayOfWeek: 5, // Friday
    enabled: true,
  },
  {
    name: 'Morning Motivation',
    prompt: 'Good morning! Give me an inspiring thought for today and suggest 3 productive things I could accomplish.',
    icon: '🌅',
    repeat: 'daily',
    hour: 8,
    minute: 0,
    enabled: true,
  },
]

function computeNextRun(
  repeat: ScheduleRepeat,
  hour: number,
  minute: number,
  dayOfWeek?: number,
  dayOfMonth?: number,
): number {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)

  if (repeat === 'once') {
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime()
  }

  if (repeat === 'daily') {
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime()
  }

  if (repeat === 'weekly' && dayOfWeek !== undefined) {
    const currentDay = now.getDay()
    let daysUntil = dayOfWeek - currentDay
    if (daysUntil < 0 || (daysUntil === 0 && target.getTime() <= now.getTime())) {
      daysUntil += 7
    }
    target.setDate(target.getDate() + daysUntil)
    return target.getTime()
  }

  if (repeat === 'monthly' && dayOfMonth !== undefined) {
    target.setDate(dayOfMonth)
    if (target.getTime() <= now.getTime()) {
      target.setMonth(target.getMonth() + 1)
    }
    return target.getTime()
  }

  return target.getTime()
}

function formatNextRun(nextRunAt: number, t: (k: string) => string): string {
  const now = Date.now()
  const diff = nextRunAt - now
  if (diff < 0) return t('schedule.overdue')

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return t('schedule.inDays').replace('{{days}}', String(days))
  }
  if (hours > 0) {
    return t('schedule.inHours').replace('{{hours}}', String(hours)).replace('{{minutes}}', String(minutes))
  }
  return t('schedule.inMinutes').replace('{{minutes}}', String(minutes || 1))
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export default function SchedulePanel() {
  const t = useT()
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
          // This schedule is due -- queue the prompt
          addToQueue(s.prompt)
          addToast(t('schedule.triggered').replace('{{name}}', s.name), 'info')

          const newNext = s.repeat === 'once'
            ? s.nextRunAt // leave it as-is, will be disabled
            : computeNextRun(s.repeat, s.hour, s.minute, s.dayOfWeek, s.dayOfMonth)

          updated = true
          return {
            ...s,
            lastRunAt: now,
            nextRunAt: newNext,
            runCount: s.runCount + 1,
            enabled: s.repeat !== 'once', // auto-disable one-time schedules after running
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
      addToast(t('schedule.limitReached'), 'warning')
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
    addToast(t('schedule.created'), 'success')
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
    addToast(t('schedule.deleted'), 'info')
  }, [schedules, setPrefs, addToast, t])

  const handleRunNow = useCallback((id: string) => {
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return
    addToQueue(schedule.prompt)
    addToast(t('schedule.runNow').replace('{{name}}', schedule.name), 'success')

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
    addToast(t('schedule.updated'), 'success')
    setEditingId(null)
    resetForm()
  }, [editingId, formName, formPrompt, formIcon, formRepeat, formHour, formMinute, formDayOfWeek, formDayOfMonth, schedules, setPrefs, addToast, resetForm, t])

  const handleInstallPreset = useCallback((preset: typeof PRESET_SCHEDULES[0]) => {
    if (schedules.length >= MAX_SCHEDULES) {
      addToast(t('schedule.limitReached'), 'warning')
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
    addToast(t('schedule.installed').replace('{{name}}', preset.name), 'success')
  }, [schedules, setPrefs, addToast, t])

  const repeatLabels: Record<ScheduleRepeat, string> = {
    once: t('schedule.repeatOnce'),
    daily: t('schedule.repeatDaily'),
    weekly: t('schedule.repeatWeekly'),
    monthly: t('schedule.repeatMonthly'),
  }

  const renderForm = (isEditing: boolean) => (
    <div style={{
      padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
      background: 'rgba(139,92,246,0.03)',
    }}>
      {/* Name + Icon */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowIconPicker(!showIconPicker)}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--input-field-bg)',
              fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {formIcon}
          </button>
          {showIconPicker && (
            <div style={{
              position: 'absolute', top: 40, left: 0, zIndex: 50,
              background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
              borderRadius: 8, padding: 6, display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)', gap: 2,
              boxShadow: 'var(--popup-shadow)',
            }}>
              {SCHEDULE_ICONS.map(icon => (
                <button key={icon} onClick={() => { setFormIcon(icon); setShowIconPicker(false) }}
                  style={{
                    width: 30, height: 30, border: 'none', borderRadius: 4,
                    background: formIcon === icon ? 'rgba(139,92,246,0.15)' : 'transparent',
                    cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{icon}</button>
              ))}
            </div>
          )}
        </div>
        <input
          value={formName}
          onChange={e => setFormName(e.target.value)}
          placeholder={t('schedule.namePlaceholder')}
          maxLength={MAX_NAME_LENGTH}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--input-field-bg)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />
      </div>

      {/* Prompt */}
      <textarea
        value={formPrompt}
        onChange={e => setFormPrompt(e.target.value)}
        placeholder={t('schedule.promptPlaceholder')}
        maxLength={MAX_PROMPT_LENGTH}
        rows={3}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--input-field-bg)',
          color: 'var(--text-primary)', fontSize: 12, outline: 'none',
          resize: 'vertical', fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>
        {formPrompt.length}/{MAX_PROMPT_LENGTH}
      </div>

      {/* Schedule settings row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Repeat */}
        <select
          value={formRepeat}
          onChange={e => setFormRepeat(e.target.value as ScheduleRepeat)}
          style={{
            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--input-field-bg)', color: 'var(--text-primary)',
            fontSize: 12, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="once">{repeatLabels.once}</option>
          <option value="daily">{repeatLabels.daily}</option>
          <option value="weekly">{repeatLabels.weekly}</option>
          <option value="monthly">{repeatLabels.monthly}</option>
        </select>

        {/* Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Timer size={12} style={{ color: 'var(--text-muted)' }} />
          <input
            type="time"
            value={formatTime(formHour, formMinute)}
            onChange={e => {
              const [h, m] = e.target.value.split(':').map(Number)
              setFormHour(h)
              setFormMinute(m)
            }}
            style={{
              padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--input-field-bg)', color: 'var(--text-primary)',
              fontSize: 12, outline: 'none',
            }}
          />
        </div>

        {/* Day of week (weekly only) */}
        {formRepeat === 'weekly' && (
          <select
            value={formDayOfWeek}
            onChange={e => setFormDayOfWeek(Number(e.target.value))}
            style={{
              padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--input-field-bg)', color: 'var(--text-primary)',
              fontSize: 12, outline: 'none', cursor: 'pointer',
            }}
          >
            {DAYS_OF_WEEK.map((day, i) => (
              <option key={i} value={i}>{day}</option>
            ))}
          </select>
        )}

        {/* Day of month (monthly only) */}
        {formRepeat === 'monthly' && (
          <select
            value={formDayOfMonth}
            onChange={e => setFormDayOfMonth(Number(e.target.value))}
            style={{
              padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--input-field-bg)', color: 'var(--text-primary)',
              fontSize: 12, outline: 'none', cursor: 'pointer',
            }}
          >
            {Array.from({ length: 28 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={() => { isEditing ? setEditingId(null) : setShowAddForm(false); resetForm() }}
          style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-secondary)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          <X size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          {t('schedule.cancel')}
        </button>
        <button
          onClick={isEditing ? handleSaveEdit : handleAdd}
          disabled={!formName.trim() || !formPrompt.trim()}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: formName.trim() && formPrompt.trim() ? 'var(--accent)' : 'var(--border)',
            color: '#ffffff', fontSize: 12, cursor: formName.trim() && formPrompt.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          <Check size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          {t('schedule.save')}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(139,92,246,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {t('schedule.title')}
            </span>
            <span style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 10,
              background: 'rgba(139,92,246,0.12)', color: 'var(--accent)',
              fontWeight: 500,
            }}>
              {schedules.filter(s => s.enabled).length}/{schedules.length}
            </span>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); resetForm() }}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
              background: showAddForm ? 'rgba(139,92,246,0.12)' : 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} />}
          </button>
        </div>

        {/* Search */}
        {schedules.length > 3 && (
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none',
            }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('schedule.search')}
              style={{
                width: '100%', padding: '6px 8px 6px 26px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--input-field-bg)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      {/* Add form */}
      {showAddForm && renderForm(false)}

      {/* Schedule list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {filteredSchedules.length === 0 && !showAddForm && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', color: 'var(--text-muted)',
          }}>
            <Clock size={40} style={{ opacity: 0.3, marginBottom: 12, animation: 'wf-pulse 2s ease-in-out infinite' }} />
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {searchQuery ? t('schedule.noResults') : t('schedule.emptyState')}
            </div>
            {!searchQuery && (
              <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.5, maxWidth: 220 }}>
                {t('schedule.emptyHint')}
              </div>
            )}

            {/* Presets */}
            {!searchQuery && (
              <div style={{ marginTop: 16, width: '100%', padding: '0 8px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 6 }}>
                  {t('schedule.presets')}
                </div>
                {PRESET_SCHEDULES.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => handleInstallPreset(preset)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--border)',
                      background: 'transparent', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: 12, marginBottom: 4, textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{preset.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{preset.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {repeatLabels[preset.repeat]} {formatTime(preset.hour, preset.minute)}
                      </div>
                    </div>
                    <Plus size={14} style={{ color: 'var(--accent)' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filteredSchedules.map(schedule => (
          <div key={schedule.id}>
            {editingId === schedule.id ? (
              renderForm(true)
            ) : (
              <div
                style={{
                  padding: '8px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  opacity: schedule.enabled ? 1 : 0.5,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {/* Icon */}
                  <span style={{ fontSize: 20, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>
                    {schedule.icon}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        {schedule.name}
                      </span>
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        background: schedule.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                        color: schedule.enabled ? '#10b981' : 'var(--text-muted)',
                        fontWeight: 500,
                      }}>
                        {repeatLabels[schedule.repeat]}
                      </span>
                    </div>

                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {schedule.prompt}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Timer size={10} />
                        {formatTime(schedule.hour, schedule.minute)}
                        {schedule.repeat === 'weekly' && schedule.dayOfWeek !== undefined && (
                          <> {DAYS_OF_WEEK[schedule.dayOfWeek]}</>
                        )}
                        {schedule.repeat === 'monthly' && schedule.dayOfMonth !== undefined && (
                          <> {t('schedule.day')} {schedule.dayOfMonth}</>
                        )}
                      </span>
                      {schedule.enabled && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#10b981' }}>
                          <Calendar size={10} />
                          {formatNextRun(schedule.nextRunAt, t)}
                        </span>
                      )}
                      {schedule.runCount > 0 && (
                        <span>{t('schedule.runCount').replace('{{count}}', String(schedule.runCount))}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginTop: 2 }}>
                    <button
                      onClick={() => handleToggle(schedule.id)}
                      title={schedule.enabled ? t('schedule.disable') : t('schedule.enable')}
                      style={{
                        width: 24, height: 24, borderRadius: 4, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: schedule.enabled ? '#10b981' : 'var(--text-muted)',
                      }}
                    >
                      {schedule.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => handleRunNow(schedule.id)}
                      title={t('schedule.runNowBtn')}
                      style={{
                        width: 24, height: 24, borderRadius: 4, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Play size={13} />
                    </button>
                    <button
                      onClick={() => handleEdit(schedule)}
                      title={t('schedule.edit')}
                      style={{
                        width: 24, height: 24, borderRadius: 4, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      title={t('schedule.delete')}
                      style={{
                        width: 24, height: 24, borderRadius: 4, border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        {t('schedule.footer')}
      </div>
    </div>
  )
}
