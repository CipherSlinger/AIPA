// PersonaEditorPage — full-width persona editor rendered in main content area
// Iteration 414

import React, { useState, useEffect } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { PERSONA_COLORS, EMOJI_PRESETS } from './personaConstants'
import { MODEL_OPTIONS, INPUT_STYLE } from './settingsConstants'

const EMPTY_PERSONAS: Persona[] = []

export default function PersonaEditorPage() {
  const { t } = useI18n()
  const editingId = useUiStore(s => s.editingPersonaId)
  const addToast = useUiStore(s => s.addToast)
  const personas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  const existing = editingId ? personas.find(p => p.id === editingId) : null

  const [formName, setFormName] = useState('')
  const [formEmoji, setFormEmoji] = useState('\u{1F9D1}\u200D\u{1F4BC}')
  const [formModel, setFormModel] = useState('claude-sonnet-4-6')
  const [formPrompt, setFormPrompt] = useState('')
  const [formColor, setFormColor] = useState('#3b82f6')
  const [formTone, setFormTone] = useState('default')

  // Load existing persona data
  useEffect(() => {
    if (existing) {
      setFormName(existing.name)
      setFormEmoji(existing.emoji)
      setFormModel(existing.model)
      setFormPrompt(existing.systemPrompt)
      setFormColor(existing.color)
      setFormTone(existing.outputStyle || 'default')
    }
  }, [existing])

  const goBack = () => {
    useUiStore.getState().setMainView('settings')
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        goBack()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  const canSubmit = formName.trim() && formPrompt.trim()

  const handleSave = () => {
    const name = formName.trim()
    if (!name || !formPrompt.trim()) return

    const prefs = usePrefsStore.getState()
    const currentPersonas = prefs.prefs.personas || []

    if (editingId) {
      const updated = currentPersonas.map(p =>
        p.id === editingId
          ? { ...p, name, emoji: formEmoji, model: formModel, systemPrompt: formPrompt.trim(), color: formColor, outputStyle: formTone as Persona['outputStyle'], updatedAt: Date.now() }
          : p
      )
      prefs.setPrefs({ personas: updated })
      window.electronAPI.prefsSet('personas', updated)
      addToast('success', t('persona.updated'))
    } else {
      if (currentPersonas.length >= 10) {
        addToast('error', t('persona.maxReached'))
        return
      }
      const newPersona: Persona = {
        id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        emoji: formEmoji,
        model: formModel,
        systemPrompt: formPrompt.trim(),
        color: formColor,
        outputStyle: formTone as Persona['outputStyle'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const updated = [...currentPersonas, newPersona]
      prefs.setPrefs({ personas: updated })
      window.electronAPI.prefsSet('personas', updated)
      addToast('success', t('persona.added'))
    }

    goBack()
  }

  const pageTitle = editingId ? (existing?.name || t('persona.editPersona')) : t('persona.addPersona')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        height: 44,
        background: 'var(--chat-header-bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        flexShrink: 0,
        gap: 12,
      }}>
        <button
          onClick={goBack}
          title={t('settings.backToChat')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            padding: 4, borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {pageTitle}
        </span>
        <button
          onClick={handleSave}
          disabled={!canSubmit}
          style={{
            background: canSubmit ? 'var(--accent)' : 'var(--bg-input)',
            border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
            color: canSubmit ? '#fff' : 'var(--text-muted)',
            padding: '5px 14px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: canSubmit ? 1 : 0.5,
            transition: 'background 150ms, opacity 150ms',
          }}
        >
          <Save size={13} />
          {t('persona.save')}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 600, padding: '24px 20px' }}>

          {/* Row 1: Emoji + Name + Color */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start' }}>
            {/* Emoji display */}
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: `${formColor}20`, border: `2px solid ${formColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>
              {formEmoji}
            </div>

            {/* Name */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                {t('persona.name')}
              </div>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={t('persona.namePlaceholder')}
                maxLength={30}
                style={{ ...INPUT_STYLE, fontSize: 14 }}
                autoFocus
              />
            </div>
          </div>

          {/* Emoji picker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('persona.emoji')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EMOJI_PRESETS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setFormEmoji(emoji)}
                  style={{
                    width: 36, height: 36,
                    border: formEmoji === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 8,
                    background: formEmoji === emoji ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'transparent',
                    cursor: 'pointer', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 100ms, background 100ms',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('persona.color')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {PERSONA_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setFormColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: c,
                    border: formColor === c ? '3px solid var(--text-bright)' : '2px solid transparent',
                    cursor: 'pointer', transition: 'transform 100ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                />
              ))}
            </div>
          </div>

          {/* Model */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('persona.model')}
            </div>
            <select
              value={formModel}
              onChange={e => setFormModel(e.target.value)}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            >
              {MODEL_OPTIONS.map(m => (
                <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Output Style */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('outputStyle.title')}
            </div>
            <select
              value={formTone}
              onChange={e => setFormTone(e.target.value)}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            >
              <option value="default">{t('outputStyle.default')}</option>
              <option value="explanatory">{t('outputStyle.explanatory')}</option>
              <option value="learning">{t('outputStyle.learning')}</option>
            </select>
          </div>

          {/* System Prompt — takes remaining space */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('persona.systemPrompt')}
            </div>
            <textarea
              value={formPrompt}
              onChange={e => setFormPrompt(e.target.value)}
              placeholder={t('persona.systemPromptPlaceholder')}
              maxLength={2000}
              style={{
                ...INPUT_STYLE,
                resize: 'vertical',
                minHeight: 200,
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
              {formPrompt.length} / 2000
            </div>
          </div>

          {/* Bottom actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 24 }}>
            <button
              onClick={goBack}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, padding: '7px 20px',
                color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
              }}
            >
              {t('persona.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSubmit}
              style={{
                background: canSubmit ? 'var(--accent)' : 'var(--bg-input)',
                border: 'none', borderRadius: 6,
                padding: '7px 20px', cursor: canSubmit ? 'pointer' : 'not-allowed',
                color: canSubmit ? '#fff' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600,
                opacity: canSubmit ? 1 : 0.5,
              }}
            >
              {editingId ? t('persona.save') : t('persona.addPersona')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
