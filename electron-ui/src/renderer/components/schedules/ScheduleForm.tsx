import React from 'react'
import {
  Check,
  X,
  Timer,
} from 'lucide-react'
import { ScheduleRepeat } from '../../types/app.types'
import { SCHEDULE_ICONS, DAYS_OF_WEEK, MAX_NAME_LENGTH, MAX_PROMPT_LENGTH, formatTime } from './scheduleConstants'

interface ScheduleFormProps {
  t: (key: string) => string
  isEditing: boolean
  repeatLabels: Record<ScheduleRepeat, string>
  // Form state
  formName: string
  formPrompt: string
  formIcon: string
  formRepeat: ScheduleRepeat
  formHour: number
  formMinute: number
  formDayOfWeek: number
  formDayOfMonth: number
  showIconPicker: boolean
  // Setters
  onNameChange: (v: string) => void
  onPromptChange: (v: string) => void
  onIconChange: (v: string) => void
  onRepeatChange: (v: ScheduleRepeat) => void
  onHourChange: (v: number) => void
  onMinuteChange: (v: number) => void
  onDayOfWeekChange: (v: number) => void
  onDayOfMonthChange: (v: number) => void
  onToggleIconPicker: () => void
  // Actions
  onSave: () => void
  onCancel: () => void
}

export default function ScheduleForm({
  t, isEditing, repeatLabels,
  formName, formPrompt, formIcon, formRepeat,
  formHour, formMinute, formDayOfWeek, formDayOfMonth, showIconPicker,
  onNameChange, onPromptChange, onIconChange, onRepeatChange,
  onHourChange, onMinuteChange, onDayOfWeekChange, onDayOfMonthChange,
  onToggleIconPicker,
  onSave, onCancel,
}: ScheduleFormProps) {
  return (
    <div style={{
      padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
      background: 'rgba(139,92,246,0.03)',
    }}>
      {/* Name + Icon */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={onToggleIconPicker}
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
                <button key={icon} onClick={() => onIconChange(icon)}
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
          onChange={e => onNameChange(e.target.value)}
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
        onChange={e => onPromptChange(e.target.value)}
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
          onChange={e => onRepeatChange(e.target.value as ScheduleRepeat)}
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
              onHourChange(h)
              onMinuteChange(m)
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
            onChange={e => onDayOfWeekChange(Number(e.target.value))}
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
            onChange={e => onDayOfMonthChange(Number(e.target.value))}
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
          onClick={onCancel}
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
          onClick={onSave}
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
}
