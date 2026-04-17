import React, { useState } from 'react'
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

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 4,
}

const GLASS_INPUT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
}

export default function PersonaForm({
  editingId, formName, setFormName, formEmoji, setFormEmoji,
  formModel, setFormModel, formPrompt, setFormPrompt,
  formColor, setFormColor, formTone, setFormTone, onSubmit, onCancel,
}: PersonaFormProps) {
  const { t } = useI18n()
  const canSubmit = formName.trim() && formPrompt.trim()

  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [cancelHovered, setCancelHovered] = useState(false)

  const focusedBorder = '1px solid rgba(99,102,241,0.5)'
  const restingBorder = '1px solid var(--border)'

  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--glass-bg-low)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 12,
        paddingBottom: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        {editingId ? t('persona.editPersona') : t('persona.addPersona')}
      </div>

      {/* Name */}
      <div style={SECTION_LABEL_STYLE}>{t('persona.name')}</div>
      <input
        value={formName}
        onChange={e => setFormName(e.target.value)}
        placeholder={t('persona.namePlaceholder')}
        maxLength={30}
        autoFocus
        onFocus={() => setFocusedField('name')}
        onBlur={() => setFocusedField(null)}
        style={{
          ...GLASS_INPUT_STYLE,
          marginBottom: 10,
          border: focusedField === 'name' ? focusedBorder : restingBorder,
        }}
      />

      {/* Emoji picker */}
      <div style={SECTION_LABEL_STYLE}>{t('persona.emoji')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {EMOJI_PRESETS.map(emoji => (
          <button
            key={emoji}
            onClick={() => setFormEmoji(emoji)}
            style={{
              width: 32,
              height: 32,
              border: formEmoji === emoji
                ? '2px solid rgba(99,102,241,0.7)'
                : '1px solid var(--border)',
              borderRadius: 6,
              background: formEmoji === emoji ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Model */}
      <div style={SECTION_LABEL_STYLE}>{t('persona.model')}</div>
      <select
        value={formModel}
        onChange={e => setFormModel(e.target.value)}
        onFocus={() => setFocusedField('model')}
        onBlur={() => setFocusedField(null)}
        style={{
          ...GLASS_INPUT_STYLE,
          marginBottom: 10,
          cursor: 'pointer',
          border: focusedField === 'model' ? focusedBorder : restingBorder,
        }}
      >
        {MODEL_OPTIONS.map(m => (
          <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
        ))}
      </select>

      {/* System Prompt */}
      <div style={SECTION_LABEL_STYLE}>{t('persona.systemPrompt')}</div>
      <textarea
        value={formPrompt}
        onChange={e => setFormPrompt(e.target.value)}
        placeholder={t('persona.systemPromptPlaceholder')}
        rows={4}
        maxLength={2000}
        onFocus={() => setFocusedField('prompt')}
        onBlur={() => setFocusedField(null)}
        style={{
          ...GLASS_INPUT_STYLE,
          marginBottom: 10,
          resize: 'vertical',
          minHeight: 60,
          fontFamily: 'inherit',
          border: focusedField === 'prompt' ? focusedBorder : restingBorder,
        }}
      />

      {/* Output Style */}
      <div style={SECTION_LABEL_STYLE}>{t('outputStyle.title')}</div>
      <select
        value={formTone}
        onChange={e => setFormTone(e.target.value)}
        onFocus={() => setFocusedField('tone')}
        onBlur={() => setFocusedField(null)}
        style={{
          ...GLASS_INPUT_STYLE,
          marginBottom: 10,
          cursor: 'pointer',
          border: focusedField === 'tone' ? focusedBorder : restingBorder,
        }}
      >
        <option value="default">{t('outputStyle.default')}</option>
        <option value="explanatory">{t('outputStyle.explanatory')}</option>
        <option value="learning">{t('outputStyle.learning')}</option>
      </select>

      {/* Color picker */}
      <div style={SECTION_LABEL_STYLE}>{t('persona.color')}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {PERSONA_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setFormColor(c)}
            style={{
              width: 18,
              height: 18,
              borderRadius: 8,
              background: c,
              border: 'none',
              cursor: 'pointer',
              boxShadow: formColor === c ? '0 0 0 2px var(--text-primary)' : 'none',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
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
            background: canSubmit
              ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
              : 'rgba(99,102,241,0.3)',
            border: 'none',
            borderRadius: 8,
            padding: '7px 0',
            color: 'var(--text-bright)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: 13,
            fontWeight: 600,
            opacity: canSubmit ? 1 : 0.5,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (canSubmit) {
              e.currentTarget.style.filter = 'brightness(0.95)'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = ''
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {t('persona.save')}
        </button>
        <button
          onClick={onCancel}
          onMouseEnter={() => setCancelHovered(true)}
          onMouseLeave={() => setCancelHovered(false)}
          style={{
            flex: 1,
            background: cancelHovered ? 'var(--border)' : 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '7px 0',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
        >
          {t('persona.cancel')}
        </button>
      </div>
    </div>
  )
}
