import React from 'react'
import { useI18n } from '../../i18n'
import { MODEL_OPTIONS, INPUT_STYLE } from './settingsConstants'
import { PERSONA_COLORS, EMOJI_PRESETS } from './personaConstants'

interface PersonaFormProps {
  editingId: string | null
  formName: string
  setFormName: (v: string) => void
  formEmoji: string
  setFormEmoji: (v: string) => void
  formModel: string
  setFormModel: (v: string) => void
  formPrompt: string
  setFormPrompt: (v: string) => void
  formColor: string
  setFormColor: (v: string) => void
  formTone: string
  setFormTone: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export default function PersonaForm({
  editingId, formName, setFormName, formEmoji, setFormEmoji,
  formModel, setFormModel, formPrompt, setFormPrompt,
  formColor, setFormColor, formTone, setFormTone, onSubmit, onCancel,
}: PersonaFormProps) {
  const { t } = useI18n()
  const canSubmit = formName.trim() && formPrompt.trim()

  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--bg-input)',
      border: '1px solid var(--accent)',
      borderRadius: 8,
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 10 }}>
        {editingId ? t('persona.editPersona') : t('persona.addPersona')}
      </div>

      {/* Name */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('persona.name')}</div>
      <input
        value={formName}
        onChange={e => setFormName(e.target.value)}
        placeholder={t('persona.namePlaceholder')}
        maxLength={30}
        style={{ ...INPUT_STYLE, marginBottom: 10 }}
        autoFocus
      />

      {/* Emoji picker */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('persona.emoji')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {EMOJI_PRESETS.map(emoji => (
          <button
            key={emoji}
            onClick={() => setFormEmoji(emoji)}
            style={{
              width: 32,
              height: 32,
              border: formEmoji === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 6,
              background: formEmoji === emoji ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'none',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Model */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('persona.model')}</div>
      <select
        value={formModel}
        onChange={e => setFormModel(e.target.value)}
        style={{ ...INPUT_STYLE, marginBottom: 10, cursor: 'pointer' }}
      >
        {MODEL_OPTIONS.map(m => (
          <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
        ))}
      </select>

      {/* System Prompt */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('persona.systemPrompt')}</div>
      <textarea
        value={formPrompt}
        onChange={e => setFormPrompt(e.target.value)}
        placeholder={t('persona.systemPromptPlaceholder')}
        rows={4}
        maxLength={2000}
        style={{ ...INPUT_STYLE, marginBottom: 10, resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
      />

      {/* Output Style */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('outputStyle.title')}</div>
      <select
        value={formTone}
        onChange={e => setFormTone(e.target.value)}
        style={{ ...INPUT_STYLE, marginBottom: 10, cursor: 'pointer' }}
      >
        <option value="default">{t('outputStyle.default')}</option>
        <option value="explanatory">{t('outputStyle.explanatory')}</option>
        <option value="learning">{t('outputStyle.learning')}</option>
      </select>

      {/* Color */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('persona.color')}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {PERSONA_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setFormColor(c)}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: c,
              border: formColor === c ? '2px solid var(--text-bright)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'transform 100ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 4,
            padding: '6px 0',
            color: '#fff',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: 11,
            fontWeight: 600,
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {t('persona.save')}
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '6px 0',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          {t('persona.cancel')}
        </button>
      </div>
    </div>
  )
}
