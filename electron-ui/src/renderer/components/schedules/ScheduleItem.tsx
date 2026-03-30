import React from 'react'
import {
  Play,
  Trash2,
  Edit3,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Timer,
} from 'lucide-react'
import { ScheduledPrompt, ScheduleRepeat } from '../../types/app.types'
import { DAYS_OF_WEEK, formatNextRun, formatTime } from './scheduleConstants'

interface ScheduleItemProps {
  schedule: ScheduledPrompt
  t: (key: string) => string
  repeatLabels: Record<ScheduleRepeat, string>
  onToggle: () => void
  onRunNow: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function ScheduleItem({
  schedule, t, repeatLabels,
  onToggle, onRunNow, onEdit, onDelete,
}: ScheduleItemProps) {
  return (
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
            onClick={onToggle}
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
            onClick={onRunNow}
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
            onClick={onEdit}
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
            onClick={onDelete}
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
  )
}
