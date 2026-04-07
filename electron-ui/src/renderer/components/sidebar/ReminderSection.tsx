// ReminderSection — reminder list + scheduling + cron UI (extracted from TasksPanel, Iteration 510)

import React, { useState } from 'react'
import { Plus, X, Bell, Clock, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n'
import { cronToHuman, describeCron, CRON_PRESETS } from '../../utils/cronScheduler'
import type { ReminderItem } from './useTasksCrud'

// Preset reminder durations
const REMINDER_PRESETS = [
  { labelKey: 'reminders.in5min', minutes: 5 },
  { labelKey: 'reminders.in15min', minutes: 15 },
  { labelKey: 'reminders.in30min', minutes: 30 },
  { labelKey: 'reminders.in1hr', minutes: 60 },
  { labelKey: 'reminders.in2hr', minutes: 120 },
] as const

interface ReminderSectionProps {
  activeReminders: ReminderItem[]
  onAddReminder: (text: string, minutes: number) => void
  onAddCronReminder: (text: string, cronExpression: string) => boolean | undefined
  onDeleteReminder: (id: string) => void
  formatTimeLeft: (fireAt: number) => string
}

export default function ReminderSection({
  activeReminders, onAddReminder, onAddCronReminder, onDeleteReminder, formatTimeLeft,
}: ReminderSectionProps) {
  const t = useT()
  const [remindersExpanded, setRemindersExpanded] = useState(true)
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [reminderText, setReminderText] = useState('')
  const [cronMode, setCronMode] = useState(false)
  const [cronExpr, setCronExpr] = useState('')
  const [cronPreview, setCronPreview] = useState<string | null>(null)

  const handleAddReminder = (minutes: number) => {
    onAddReminder(reminderText, minutes)
    setReminderText('')
    setShowReminderForm(false)
  }

  const handleAddCronReminder = () => {
    const result = onAddCronReminder(reminderText, cronExpr)
    if (result !== false) {
      setReminderText('')
      setCronExpr('')
      setCronMode(false)
      setShowReminderForm(false)
    }
  }

  return (
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
                  {/* Mode toggle: quick presets vs cron expression */}
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
                          onClick={() => handleAddReminder(preset.minutes)}
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
                    /* Cron expression input */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {/* Cron presets */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {CRON_PRESETS.map(p => (
                          <button
                            key={p.cron}
                            onClick={() => { setCronExpr(p.cron); setCronPreview(cronToHuman(p.cron) || describeCron(p.cron)) }}
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
                          setCronPreview(cronToHuman(e.target.value) || describeCron(e.target.value))
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
                          onClick={handleAddCronReminder}
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
              onDelete={onDeleteReminder}
              formatTimeLeft={formatTimeLeft}
            />
          ))}
        </>
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
  const humanFreq = reminder.recurring && reminder.cronExpression
    ? cronToHuman(reminder.cronExpression)
    : null

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
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
          {reminder.text}
          {reminder.recurring && (
            <RefreshCw size={9} style={{ display: 'inline', marginLeft: 4, color: '#8b5cf6', verticalAlign: 'middle' }} />
          )}
        </span>
        {humanFreq && (
          <div style={{ fontSize: 9, color: '#8b5cf6', marginTop: 1 }}>{humanFreq}</div>
        )}
      </div>
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
