// ReminderSection — reminder list + scheduling + cron UI (extracted from TasksPanel, Iteration 510)

import React, { useState } from 'react'
import { Plus, X, Bell, Clock, ChevronDown, RefreshCw } from 'lucide-react'
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
  const [reminderTextFocused, setReminderTextFocused] = useState(false)
  const [cronMode, setCronMode] = useState(false)
  const [cronExpr, setCronExpr] = useState('')
  const [cronFocused, setCronFocused] = useState(false)
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
    <div
      style={{
        background: 'var(--bg-hover)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 8,
        marginTop: 12,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: remindersExpanded ? 8 : 0,
          padding: '2px 0',
          transition: 'all 0.15s ease',
        }}
        onClick={() => setRemindersExpanded(!remindersExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s ease',
              transform: remindersExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          >
            <ChevronDown size={12} color="var(--text-faint)" />
          </span>
          <Bell size={12} color="#fbbf24" />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-faint)',
            }}
          >
            {t('reminders.title')}
          </span>
          {activeReminders.length > 0 && (
            <span
              style={{
                fontSize: 9,
                background: 'rgba(99,102,241,0.25)',
                color: '#a5b4fc',
                borderRadius: 6,
                padding: '1px 5px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
              }}
            >
              {activeReminders.length}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowReminderForm(true); setRemindersExpanded(true) }}
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-active)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <Plus size={12} />
        </button>
      </div>

      {remindersExpanded && (
        <>
          {/* Reminder creation form */}
          {showReminderForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              <input
                value={reminderText}
                onChange={(e) => setReminderText(e.target.value)}
                placeholder={t('reminders.textPlaceholder')}
                autoFocus
                onFocus={() => setReminderTextFocused(true)}
                onBlur={() => setReminderTextFocused(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowReminderForm(false) }}
                style={{
                  padding: '5px 8px',
                  borderRadius: 7,
                  border: reminderTextFocused
                    ? '1px solid rgba(99,102,241,0.40)'
                    : '1px solid var(--border)',
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
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        border: !cronMode
                          ? '1px solid rgba(99,102,241,0.40)'
                          : '1px solid var(--border)',
                        background: !cronMode ? 'rgba(99,102,241,0.15)' : 'transparent',
                        color: !cronMode ? '#818cf8' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {t('reminders.quickPresets')}
                    </button>
                    <button
                      onClick={() => setCronMode(true)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        border: cronMode
                          ? '1px solid rgba(99,102,241,0.40)'
                          : '1px solid var(--border)',
                        background: cronMode ? 'rgba(99,102,241,0.15)' : 'transparent',
                        color: cronMode ? '#818cf8' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        transition: 'all 0.15s ease',
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
                            padding: '3px 8px',
                            borderRadius: 10,
                            border: '1px solid var(--glass-border-md)',
                            background: 'var(--bg-hover)',
                            color: 'var(--text-secondary)',
                            fontSize: 10,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.15)'
                            e.currentTarget.style.color = '#818cf8'
                            e.currentTarget.style.borderColor = '#818cf8'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-hover)'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
                          }}
                        >
                          {t(preset.labelKey)}
                        </button>
                      ))}
                      {/* Ghost cancel */}
                      <button
                        onClick={() => setShowReminderForm(false)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 10,
                          border: '1px solid var(--glass-border-md)',
                          background: 'var(--bg-hover)',
                          color: 'var(--text-faint)',
                          fontSize: 10,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--glass-border)'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                          e.currentTarget.style.borderColor = 'var(--glass-border-md)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-faint)'
                          e.currentTarget.style.borderColor = 'var(--glass-border-md)'
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
                              padding: '2px 6px',
                              borderRadius: 8,
                              fontSize: 9,
                              cursor: 'pointer',
                              border: cronExpr === p.cron
                                ? '1px solid rgba(99,102,241,0.40)'
                                : '1px solid var(--border)',
                              background: cronExpr === p.cron ? 'rgba(99,102,241,0.15)' : 'transparent',
                              color: cronExpr === p.cron ? '#818cf8' : 'var(--text-faint)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {/* Manual cron input with glass focus ring */}
                      <input
                        value={cronExpr}
                        onChange={e => {
                          setCronExpr(e.target.value)
                          setCronPreview(cronToHuman(e.target.value) || describeCron(e.target.value))
                        }}
                        onFocus={() => setCronFocused(true)}
                        onBlur={() => setCronFocused(false)}
                        placeholder="* * * * * (min hr dom mon dow)"
                        style={{
                          padding: '4px 8px',
                          borderRadius: 7,
                          fontSize: 10,
                          border: cronFocused
                            ? '1px solid rgba(99,102,241,0.40)'
                            : '1px solid var(--border)',
                          background: 'var(--bg-hover)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          fontFamily: 'monospace',
                          transition: 'all 0.15s ease',
                          boxShadow: cronFocused ? '0 0 0 2px rgba(99,102,241,0.10)' : 'none',
                        }}
                      />
                      {/* Next-fire preview */}
                      {cronPreview && (
                        <div
                          style={{
                            fontSize: 9,
                            color: 'var(--text-muted)',
                            paddingLeft: 2,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {cronPreview}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {/* Gradient CTA Set button */}
                        <button
                          onClick={handleAddCronReminder}
                          disabled={!cronExpr.trim() || !cronPreview}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 8,
                            fontSize: 10,
                            cursor: cronExpr.trim() && cronPreview ? 'pointer' : 'not-allowed',
                            border: 'none',
                            background: cronExpr.trim() && cronPreview
                              ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                              : 'var(--bg-hover)',
                            color: cronExpr.trim() && cronPreview ? 'var(--text-bright)' : 'var(--text-faint)',
                            transition: 'all 0.15s ease',
                            boxShadow: cronExpr.trim() && cronPreview ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (cronExpr.trim() && cronPreview) {
                              e.currentTarget.style.filter = 'brightness(0.95)'
                              e.currentTarget.style.transform = 'translateY(-1px)'
                              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.filter = ''
                            e.currentTarget.style.transform = ''
                            e.currentTarget.style.boxShadow = cronExpr.trim() && cronPreview
                              ? '0 2px 8px rgba(99,102,241,0.35)'
                              : 'none'
                          }}
                        >
                          {t('reminders.setRecurring')}
                        </button>
                        {/* Ghost glass cancel */}
                        <button
                          onClick={() => setShowReminderForm(false)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 8,
                            fontSize: 10,
                            cursor: 'pointer',
                            border: '1px solid var(--glass-border-md)',
                            background: 'var(--bg-hover)',
                            color: 'var(--text-faint)',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--glass-border)'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-hover)'
                            e.currentTarget.style.color = 'var(--text-faint)'
                            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
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
            <div
              style={{
                padding: '10px 4px 6px',
                fontSize: 11,
                color: 'var(--text-faint)',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
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

  const now = Date.now()
  const msLeft = reminder.fireAt - now
  const isOverdue = !reminder.recurring && msLeft < 0
  const isSoon = !reminder.recurring && !isOverdue && msLeft < 10 * 60 * 1000   // < 10 min
  const isUpcoming = !reminder.recurring && !isOverdue && !isSoon

  // Time label color: overdue=red, soon=amber, upcoming=green, recurring=indigo
  const timeColor =
    isOverdue ? '#f87171'
    : isSoon ? '#fbbf24'
    : reminder.recurring ? '#a78bfa'
    : '#4ade80'

  // Icon color matches time color
  const iconColor = timeColor

  // Text color: overdue gets red tint, others normal
  const textColor = isOverdue ? 'rgba(248,113,113,0.90)' : 'var(--text-primary)'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '7px 8px',
        borderRadius: 8,
        background: hovered ? 'var(--bg-hover)' : 'var(--bg-hover)',
        border: '1px solid var(--glass-border)',
        marginBottom: 4,
        transition: 'all 0.15s ease',
        boxShadow: hovered ? 'var(--glass-shadow)' : 'none',
      }}
    >
      <Clock size={12} style={{ color: iconColor, flexShrink: 0, marginTop: 2, filter: `drop-shadow(0 0 3px ${iconColor}66)` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: textColor, lineHeight: 1.4, wordBreak: 'break-word', transition: 'all 0.15s ease' }}>
          {reminder.text}
          {reminder.recurring && (
            <RefreshCw size={9} style={{ display: 'inline', marginLeft: 4, color: '#a78bfa', verticalAlign: 'middle' }} />
          )}
        </div>
        {/* Next-fire date with tabular nums */}
        <div
          style={{
            fontSize: 10,
            color: timeColor,
            marginTop: 3,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            letterSpacing: '0.02em',
            transition: 'all 0.15s ease',
          }}
        >
          {humanFreq || formatTimeLeft(reminder.fireAt)}
        </div>
      </div>
      <button
        onClick={() => onDelete(reminder.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: hovered ? 'var(--text-muted)' : 'transparent',
          padding: '2px 3px',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#f87171'
          e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = hovered ? 'var(--text-muted)' : 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <X size={11} />
      </button>
    </div>
  )
}
