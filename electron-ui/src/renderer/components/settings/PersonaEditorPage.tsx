// PersonaEditorPage — full-width persona editor rendered in main content area
// Iteration 415

import React, { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2, Camera } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { PERSONA_COLORS, EMOJI_PRESETS } from './personaConstants'
import { MODEL_OPTIONS, INPUT_STYLE } from './settingsConstants'

const EMPTY_PERSONAS: Persona[] = []

// Glass input surface — matches design-system spec
const GLASS_INPUT: React.CSSProperties = {
  ...INPUT_STYLE,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7,
  padding: '7px 10px',
  fontSize: 12,
  color: 'rgba(255,255,255,0.82)',
  outline: 'none',
  transition: 'all 0.15s ease',
}

// Micro-label (section headers)
const MICRO_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
  marginBottom: 8,
}

// Form section card
const SECTION_CARD: React.CSSProperties = {
  background: 'rgba(15,15,25,0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  padding: '16px 20px',
  marginBottom: 12,
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
}

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
  const [formColor, setFormColor] = useState('#6366f1')
  const [formTone, setFormTone] = useState('default')
  const [avatarHovered, setAvatarHovered] = useState(false)

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

  const returnView = useUiStore(s => s.personaEditorReturnView)
  const goBack = () => {
    useUiStore.getState().setMainView(returnView)
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

  const handleDelete = () => {
    if (!editingId) return
    const prefs = usePrefsStore.getState()
    const updated = (prefs.prefs.personas || []).filter(p => p.id !== editingId)
    prefs.setPrefs({ personas: updated })
    window.electronAPI.prefsSet('personas', updated)
    addToast('success', t('persona.deleted'))
    goBack()
  }

  const pageTitle = editingId ? (existing?.name || t('persona.editPersona')) : t('persona.addPersona')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10,10,18,1)' }}>
      {/* Header */}
      <div style={{
        height: 44,
        background: 'rgba(15,15,25,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
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
            color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center',
            padding: 4, borderRadius: 8, transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {pageTitle}
        </span>
        <button
          onClick={handleSave}
          disabled={!canSubmit}
          onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = canSubmit ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
          style={{
            background: canSubmit
              ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'
              : 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: 8,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            color: canSubmit ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: canSubmit ? 1 : 0.5,
            transition: 'all 0.15s ease',
          }}
        >
          <Save size={13} />
          {t('persona.save')}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 600, padding: '24px 20px' }}>

          {/* Row 1: Avatar + Name */}
          <div style={SECTION_CARD}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Large avatar circle with hover overlay */}
              <div
                style={{ position: 'relative', flexShrink: 0 }}
                onMouseEnter={() => setAvatarHovered(true)}
                onMouseLeave={() => setAvatarHovered(false)}
              >
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: `${formColor}22`,
                  border: avatarHovered
                    ? '2px solid rgba(99,102,241,0.60)'
                    : `2px solid ${formColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                  cursor: 'default',
                  transition: 'all 0.15s ease',
                  overflow: 'hidden',
                }}>
                  {formEmoji}
                </div>
                {/* Camera icon overlay on hover */}
                {avatarHovered && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <Camera size={18} color="rgba(255,255,255,0.85)" />
                  </div>
                )}
              </div>

              {/* Name */}
              <div style={{ flex: 1 }}>
                <div style={MICRO_LABEL}>{t('persona.name')}</div>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={t('persona.namePlaceholder')}
                  maxLength={30}
                  style={{ ...GLASS_INPUT, fontSize: 14 }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45)' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Emoji picker */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('persona.emoji')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EMOJI_PRESETS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setFormEmoji(emoji)}
                  style={{
                    width: 36, height: 36,
                    border: formEmoji === emoji ? '2px solid rgba(99,102,241,0.8)' : '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 8,
                    background: formEmoji === emoji ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('persona.color')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PERSONA_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setFormColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: 'none',
                    outline: formColor === c ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
                    outlineOffset: 2,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.18)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                />
              ))}
            </div>
          </div>

          {/* Model */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('persona.model')}</div>
            <select
              value={formModel}
              onChange={e => setFormModel(e.target.value)}
              style={{ ...GLASS_INPUT, cursor: 'pointer' }}
              onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45)' }}
              onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {MODEL_OPTIONS.map(m => (
                <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Output Style */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('outputStyle.title')}</div>
            <select
              value={formTone}
              onChange={e => setFormTone(e.target.value)}
              style={{ ...GLASS_INPUT, cursor: 'pointer' }}
              onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45)' }}
              onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <option value="default">{t('outputStyle.default')}</option>
              <option value="explanatory">{t('outputStyle.explanatory')}</option>
              <option value="learning">{t('outputStyle.learning')}</option>
            </select>
          </div>

          {/* System Prompt */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('persona.systemPrompt')}</div>
            <textarea
              value={formPrompt}
              onChange={e => setFormPrompt(e.target.value)}
              placeholder={t('persona.systemPromptPlaceholder')}
              maxLength={2000}
              style={{
                ...GLASS_INPUT,
                background: 'rgba(255,255,255,0.04)',
                resize: 'vertical',
                minHeight: 200,
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.6,
                width: '100%',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.border = '1px solid rgba(99,102,241,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.20)' }}
              onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formPrompt.length} / 2000
            </div>
          </div>

          {/* Danger zone — only shown when editing an existing persona */}
          {editingId && (
            <div style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.18)',
              borderRadius: 10,
              padding: '14px 20px',
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.70)', marginBottom: 8 }}>
                Danger Zone
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                  {t('persona.deleteWarning')}
                </span>
                <button
                  onClick={handleDelete}
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.30)',
                    borderRadius: 7,
                    padding: '6px 12px',
                    color: 'rgba(252,165,165,0.9)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.50)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.30)' }}
                >
                  <Trash2 size={13} />
                  {t('persona.delete')}
                </button>
              </div>
            </div>
          )}

          {/* Bottom actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 24 }}>
            <button
              onClick={goBack}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '7px 14px',
                color: 'rgba(255,255,255,0.72)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.38)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
            >
              {t('persona.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSubmit}
              onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = canSubmit ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'
                  : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                color: canSubmit ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: canSubmit ? 1 : 0.5,
                transition: 'all 0.15s ease',
              }}
            >
              <Save size={13} />
              {editingId ? t('persona.save') : t('persona.addPersona')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
