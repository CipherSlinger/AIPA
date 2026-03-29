import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Sparkles } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { MODEL_OPTIONS, INPUT_STYLE } from './settingsConstants'

const PERSONA_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const EMOJI_PRESETS = [
  '\u{1F9D1}\u200D\u{1F4BC}', '\u{1F4DD}', '\u{1F9D1}\u200D\u{1F3EB}', '\u{1F9D1}\u200D\u{1F52C}',
  '\u{1F3A8}', '\u{1F4DA}', '\u{1F9D1}\u200D\u{1F4BB}', '\u{1F680}',
  '\u{1F9E0}', '\u{1F916}', '\u2728', '\u{1F30D}',
  '\u{1F3AF}', '\u{1F4CA}', '\u2764\uFE0F', '\u{1F4A1}',
]

interface SettingsPersonasProps {
  personas: Persona[]
  setPersonas: (personas: Persona[]) => void
  activePersonaId: string | undefined
}

export default function SettingsPersonas({ personas, setPersonas, activePersonaId }: SettingsPersonasProps) {
  const { setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const addToast = useUiStore(s => s.addToast)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmoji, setFormEmoji] = useState('\u{1F9D1}\u200D\u{1F4BC}')
  const [formModel, setFormModel] = useState('claude-sonnet-4-6')
  const [formPrompt, setFormPrompt] = useState('')
  const [formColor, setFormColor] = useState('#3b82f6')

  const savePersonas = (updated: Persona[]) => {
    setPersonas(updated)
    setPrefs({ personas: updated })
    window.electronAPI.prefsSet('personas', updated)
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setFormEmoji('\u{1F9D1}\u200D\u{1F4BC}')
    setFormModel('claude-sonnet-4-6')
    setFormPrompt('')
    setFormColor('#3b82f6')
  }

  const startEdit = (p: Persona) => {
    setEditingId(p.id)
    setFormName(p.name)
    setFormEmoji(p.emoji)
    setFormModel(p.model)
    setFormPrompt(p.systemPrompt)
    setFormColor(p.color)
    setShowForm(true)
  }

  const handleSubmit = () => {
    const name = formName.trim()
    if (!name || !formPrompt.trim()) return

    if (editingId) {
      // Update existing
      const updated = personas.map(p =>
        p.id === editingId
          ? { ...p, name, emoji: formEmoji, model: formModel, systemPrompt: formPrompt.trim(), color: formColor, updatedAt: Date.now() }
          : p
      )
      savePersonas(updated)
      addToast('success', t('persona.updated'))
    } else {
      // Create new
      if (personas.length >= 10) {
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      savePersonas([...personas, newPersona])
      addToast('success', t('persona.created'))
    }
    resetForm()
  }

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      const updated = personas.filter(p => p.id !== id)
      savePersonas(updated)
      // Deactivate if the deleted persona was active
      if (activePersonaId === id) {
        setPrefs({ activePersonaId: undefined })
        window.electronAPI.prefsSet('activePersonaId', undefined)
      }
      setDeletingId(null)
      addToast('success', t('persona.deleted'))
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  const handleActivate = (persona: Persona) => {
    if (activePersonaId === persona.id) {
      // Deactivate
      setPrefs({ activePersonaId: undefined, model: persona.model, systemPrompt: '' })
      window.electronAPI.prefsSet('activePersonaId', undefined)
      window.electronAPI.prefsSet('systemPrompt', '')
      addToast('info', t('persona.deactivated'))
    } else {
      // Activate: apply persona's model and system prompt
      setPrefs({ activePersonaId: persona.id, model: persona.model, systemPrompt: persona.systemPrompt })
      window.electronAPI.prefsSet('activePersonaId', persona.id)
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', persona.systemPrompt)
      addToast('success', t('persona.switchedTo', { name: persona.name }))
    }
  }

  const personaForm = () => (
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
          onClick={handleSubmit}
          disabled={!formName.trim() || !formPrompt.trim()}
          style={{
            flex: 1,
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 4,
            padding: '6px 0',
            color: '#fff',
            cursor: formName.trim() && formPrompt.trim() ? 'pointer' : 'not-allowed',
            fontSize: 11,
            fontWeight: 600,
            opacity: formName.trim() && formPrompt.trim() ? 1 : 0.5,
          }}
        >
          {t('persona.save')}
        </button>
        <button
          onClick={resetForm}
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

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        {t('persona.subtitle')}
      </div>

      {/* Add button */}
      {!showForm && (
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          disabled={personas.length >= 10}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'none',
            border: '1px dashed var(--border)',
            borderRadius: 6,
            color: personas.length >= 10 ? 'var(--text-muted)' : 'var(--accent)',
            cursor: personas.length >= 10 ? 'not-allowed' : 'pointer',
            fontSize: 11,
            width: '100%',
            justifyContent: 'center',
            marginBottom: 12,
            transition: 'border-color 150ms',
          }}
          onMouseEnter={e => { if (personas.length < 10) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <Plus size={13} />
          {personas.length >= 10 ? t('persona.maxReached') : t('persona.addPersona')}
        </button>
      )}

      {/* Form */}
      {showForm && personaForm()}

      {/* Persona list */}
      {personas.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
          <Sparkles size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 12 }}>{t('persona.noPersonas')}</div>
          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{t('persona.noPersonasHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {personas.map(p => {
            const isActive = activePersonaId === p.id
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: isActive ? `${p.color}15` : 'var(--card-bg)',
                  border: `1px solid ${isActive ? p.color : 'var(--card-border)'}`,
                  borderRadius: 8,
                  transition: 'border-color 150ms, background 150ms',
                }}
              >
                {/* Emoji avatar */}
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${p.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}>
                  {p.emoji}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)' }}>{p.name}</span>
                    {isActive && (
                      <span style={{
                        fontSize: 9,
                        background: p.color,
                        color: '#fff',
                        padding: '1px 6px',
                        borderRadius: 8,
                        fontWeight: 600,
                      }}>
                        {t('persona.active')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey) : p.model}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => handleActivate(p)}
                    title={isActive ? t('persona.deactivate') : t('persona.activate')}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      border: 'none',
                      background: isActive ? p.color : 'none',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => startEdit(p)}
                    title={t('persona.editPersona')}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      border: 'none',
                      background: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    title={deletingId === p.id ? t('persona.deleteConfirm') : t('persona.deletePersona')}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      border: 'none',
                      background: deletingId === p.id ? 'var(--error)' : 'none',
                      color: deletingId === p.id ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={e => { if (deletingId !== p.id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={e => { if (deletingId !== p.id) e.currentTarget.style.background = 'none' }}
                  >
                    {deletingId === p.id ? <X size={12} /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
