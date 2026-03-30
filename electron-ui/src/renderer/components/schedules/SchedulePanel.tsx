import React from 'react'
import {
  Clock,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { ScheduleRepeat } from '../../types/app.types'
import { useT } from '../../i18n'
import { PRESET_SCHEDULES, formatTime } from './scheduleConstants'
import { useScheduleCrud } from './useScheduleCrud'
import ScheduleForm from './ScheduleForm'
import ScheduleItem from './ScheduleItem'

export default function SchedulePanel() {
  const t = useT()
  const crud = useScheduleCrud(t)

  const repeatLabels: Record<ScheduleRepeat, string> = {
    once: t('schedule.repeatOnce'),
    daily: t('schedule.repeatDaily'),
    weekly: t('schedule.repeatWeekly'),
    monthly: t('schedule.repeatMonthly'),
  }

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
              {crud.schedules.filter(s => s.enabled).length}/{crud.schedules.length}
            </span>
          </div>
          <button
            onClick={() => { crud.setShowAddForm(!crud.showAddForm); crud.setEditingId(null); crud.resetForm() }}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
              background: crud.showAddForm ? 'rgba(139,92,246,0.12)' : 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {crud.showAddForm ? <X size={14} /> : <Plus size={14} />}
          </button>
        </div>

        {/* Search */}
        {crud.schedules.length > 3 && (
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none',
            }} />
            <input
              value={crud.searchQuery}
              onChange={e => crud.setSearchQuery(e.target.value)}
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
      {crud.showAddForm && (
        <ScheduleForm
          t={t}
          isEditing={false}
          repeatLabels={repeatLabels}
          formName={crud.formName}
          formPrompt={crud.formPrompt}
          formIcon={crud.formIcon}
          formRepeat={crud.formRepeat}
          formHour={crud.formHour}
          formMinute={crud.formMinute}
          formDayOfWeek={crud.formDayOfWeek}
          formDayOfMonth={crud.formDayOfMonth}
          showIconPicker={crud.showIconPicker}
          onNameChange={crud.setFormName}
          onPromptChange={crud.setFormPrompt}
          onIconChange={v => { crud.setFormIcon(v); crud.setShowIconPicker(false) }}
          onRepeatChange={crud.setFormRepeat}
          onHourChange={crud.setFormHour}
          onMinuteChange={crud.setFormMinute}
          onDayOfWeekChange={crud.setFormDayOfWeek}
          onDayOfMonthChange={crud.setFormDayOfMonth}
          onToggleIconPicker={() => crud.setShowIconPicker(!crud.showIconPicker)}
          onSave={crud.handleAdd}
          onCancel={() => { crud.setShowAddForm(false); crud.resetForm() }}
        />
      )}

      {/* Schedule list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {crud.filteredSchedules.length === 0 && !crud.showAddForm && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', color: 'var(--text-muted)',
          }}>
            <Clock size={40} style={{ opacity: 0.3, marginBottom: 12, animation: 'wf-pulse 2s ease-in-out infinite' }} />
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {crud.searchQuery ? t('schedule.noResults') : t('schedule.emptyState')}
            </div>
            {!crud.searchQuery && (
              <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.5, maxWidth: 220 }}>
                {t('schedule.emptyHint')}
              </div>
            )}

            {/* Presets */}
            {!crud.searchQuery && (
              <div style={{ marginTop: 16, width: '100%', padding: '0 8px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 6 }}>
                  {t('schedule.presets')}
                </div>
                {PRESET_SCHEDULES.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => crud.handleInstallPreset(preset)}
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

        {crud.filteredSchedules.map(schedule => (
          <div key={schedule.id}>
            {crud.editingId === schedule.id ? (
              <ScheduleForm
                t={t}
                isEditing={true}
                repeatLabels={repeatLabels}
                formName={crud.formName}
                formPrompt={crud.formPrompt}
                formIcon={crud.formIcon}
                formRepeat={crud.formRepeat}
                formHour={crud.formHour}
                formMinute={crud.formMinute}
                formDayOfWeek={crud.formDayOfWeek}
                formDayOfMonth={crud.formDayOfMonth}
                showIconPicker={crud.showIconPicker}
                onNameChange={crud.setFormName}
                onPromptChange={crud.setFormPrompt}
                onIconChange={v => { crud.setFormIcon(v); crud.setShowIconPicker(false) }}
                onRepeatChange={crud.setFormRepeat}
                onHourChange={crud.setFormHour}
                onMinuteChange={crud.setFormMinute}
                onDayOfWeekChange={crud.setFormDayOfWeek}
                onDayOfMonthChange={crud.setFormDayOfMonth}
                onToggleIconPicker={() => crud.setShowIconPicker(!crud.showIconPicker)}
                onSave={crud.handleSaveEdit}
                onCancel={() => { crud.setEditingId(null); crud.resetForm() }}
              />
            ) : (
              <ScheduleItem
                schedule={schedule}
                t={t}
                repeatLabels={repeatLabels}
                onToggle={() => crud.handleToggle(schedule.id)}
                onRunNow={() => crud.handleRunNow(schedule.id)}
                onEdit={() => crud.handleEdit(schedule)}
                onDelete={() => crud.handleDelete(schedule.id)}
              />
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
