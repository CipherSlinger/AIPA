/**
 * WorkflowPersonasSection
 *
 * Embedded in WorkflowPanel: persona management section (Iteration 376).
 * Sub-components extracted to PersonaSidebarComponents.tsx (Iteration 386).
 */

import React, { useState, useEffect } from 'react'
import { Plus, ChevronDown, Download, Upload, Sparkles } from 'lucide-react'
import { usePrefsStore, useUiStore, useChatStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { PERSONA_COLORS, EMOJI_PRESETS, PERSONA_PRESETS } from '../settings/personaConstants'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import { PersonaSidebarCard, PersonaInlineForm } from './PersonaSidebarComponents'

// ─── Main exported section ─────────────────────────────────────────────────────

export default function WorkflowPersonasSection() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const addToast = useUiStore(s => s.addToast)

  // Load personas from prefs — keep in sync with SettingsPanel
  const [personas, setPersonas] = useState<Persona[]>(prefs.personas || [])
  const activePersonaId = prefs.activePersonaId
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const effectivePersonaId = sessionPersonaId || activePersonaId

  // Keep local personas in sync when prefs change externally (e.g. SettingsPanel still open)
  useEffect(() => {
    setPersonas(prefs.personas || [])
  }, [prefs.personas])

  // ── Collapsed / expanded section state ──────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false)

  // ── Form state ──────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formEmoji, setFormEmoji] = useState('🧑‍💼')
  const [formModel, setFormModel] = useState('claude-sonnet-4-6')
  const [formPrompt, setFormPrompt] = useState('')
  const [formColor, setFormColor] = useState('#6366f1')

  const savePersonas = (updated: Persona[]) => {
    setPersonas(updated)
    setPrefs({ personas: updated })
    window.electronAPI.prefsSet('personas', updated)
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setFormEmoji('🧑‍💼')
    setFormModel('claude-sonnet-4-6')
    // Pre-fill system prompt with localized default template
    setFormPrompt(t('persona.defaultSystemPrompt'))
    setFormColor('#6366f1')
  }

  const startEdit = (p: Persona) => {
    setEditingId(p.id)
    setFormName(p.name)
    setFormEmoji(p.emoji)
    setFormModel(p.model)
    setFormPrompt(p.systemPrompt)
    setFormColor(p.color)
    setShowForm(true)
    setCollapsed(false)
  }

  const handleSubmit = () => {
    const name = formName.trim()
    if (!name || !formPrompt.trim()) return

    if (editingId) {
      const updated = personas.map(p =>
        p.id === editingId
          ? { ...p, name, emoji: formEmoji, model: formModel, systemPrompt: formPrompt.trim(), color: formColor, updatedAt: Date.now() }
          : p
      )
      savePersonas(updated)
      addToast('success', t('persona.updated'))
    } else {
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
      if (activePersonaId === id) {
        setPrefs({ activePersonaId: undefined })
        window.electronAPI.prefsSet('activePersonaId', undefined)
      }
      if (sessionPersonaId === id) {
        useChatStore.getState().setSessionPersonaId(undefined)
        setPrefs({ systemPrompt: '' })
        window.electronAPI.prefsSet('systemPrompt', '')
      }
      setDeletingId(null)
      addToast('success', t('persona.deleted'))
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  const handleActivate = (persona: Persona) => {
    if (effectivePersonaId === persona.id) {
      // Deactivate session persona
      useChatStore.getState().setSessionPersonaId(undefined)
      setPrefs({ systemPrompt: '' })
      window.electronAPI.prefsSet('systemPrompt', '')
      addToast('info', t('persona.deactivated'))
    } else {
      const resolvedPrompt = persona.presetKey ? t(`persona.presetPrompt.${persona.presetKey}`) : persona.systemPrompt
      useChatStore.getState().setSessionPersonaId(persona.id)
      setPrefs({ model: persona.model, systemPrompt: resolvedPrompt })
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
      addToast('success', t('persona.switchedTo', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
    }
  }

  const handleInstallPreset = (preset: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (personas.length >= 10) return
    const newPersona: Persona = {
      ...preset,
      id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    savePersonas([...personas, newPersona])
    addToast('success', t('persona.created'))
  }

  const handleExport = () => {
    const data = JSON.stringify(personas, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aipa-personas-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', t('persona.exportSuccess'))
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const imported = JSON.parse(text)
        if (!Array.isArray(imported)) throw new Error('Invalid format')
        const valid = imported.filter((p: any) => p.name && p.emoji && p.model && p.systemPrompt)
        if (valid.length === 0) throw new Error('No valid personas')
        const merged = [...personas]
        let added = 0
        for (const p of valid) {
          if (merged.length >= 10) break
          if (merged.some(existing => existing.name === p.name)) continue
          merged.push({
            ...p,
            id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          added++
        }
        if (added > 0) {
          savePersonas(merged)
          addToast('success', t('persona.importSuccess', { count: String(added) }))
        } else {
          addToast('info', t('persona.importNoDuplicates'))
        }
      } catch {
        addToast('error', t('persona.importFailed'))
      }
    }
    input.click()
  }

  // Available presets not yet installed
  const availablePresets = PERSONA_PRESETS.filter(
    preset => !personas.some(p => p.presetKey === preset.presetKey || p.name === preset.name)
  )

  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      flexShrink: 0,
    }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(c => !c)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.07em', borderLeft: '2px solid rgba(99,102,241,0.5)', paddingLeft: 8 }}>
            {t('persona.title')}
          </span>
          {/* Team composition badge */}
          {personas.length > 0 && (
            <span style={{
              fontSize: 9,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: '#818cf8',
              padding: '1px 6px',
              borderRadius: 6,
              fontWeight: 700,
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}>
              {personas.length} {personas.length === 1 ? 'agent' : 'agents'}
            </span>
          )}
          {effectivePersonaId && (
            <span
              title={personas.find(p => p.id === effectivePersonaId)?.name ?? ''}
              style={{
                fontSize: 8,
                background: '#6366f1',
                color: 'rgba(255,255,255,0.82)',
                padding: '1px 5px',
                borderRadius: 6,
                fontWeight: 700,
              }}
            >
              {personas.find(p => p.id === effectivePersonaId)?.emoji ?? ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Add button (stops collapse toggle) */}
          {!collapsed && (
            <button
              onClick={e => {
                e.stopPropagation()
                resetForm()
                setShowForm(v => !v)
              }}
              title={t('persona.addPersona')}
              disabled={personas.length >= 10}
              style={{
                background: showForm && !editingId
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'rgba(255,255,255,0.06)',
                border: showForm && !editingId
                  ? '1px solid rgba(99,102,241,0.60)'
                  : '1px solid rgba(255,255,255,0.09)',
                borderRadius: 8,
                padding: '2px 5px',
                cursor: personas.length >= 10 ? 'not-allowed' : 'pointer',
                color: showForm && !editingId ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.60)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                opacity: personas.length >= 10 ? 0.4 : 1,
                transition: 'all 0.15s ease',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                boxShadow: showForm && !editingId ? '0 0 0 3px rgba(99,102,241,0.10)' : 'none',
              }}
              onMouseEnter={e => {
                if (personas.length < 10 && !(showForm && !editingId)) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
                }
              }}
              onMouseLeave={e => {
                if (!(showForm && !editingId)) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
                }
              }}
            >
              <Plus size={11} />
            </button>
          )}
          <ChevronDown
            size={13}
            style={{
              color: 'rgba(255,255,255,0.45)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'all 0.15s ease',
            }}
          />
        </div>
      </div>

      {/* Body — only when expanded */}
      {!collapsed && (
        <div style={{ padding: '0 10px 8px' }}>
          {/* Inline create/edit form */}
          {showForm && (
            <PersonaInlineForm
              editingId={editingId}
              formName={formName} setFormName={setFormName}
              formEmoji={formEmoji} setFormEmoji={setFormEmoji}
              formModel={formModel} setFormModel={setFormModel}
              formPrompt={formPrompt} setFormPrompt={setFormPrompt}
              formColor={formColor} setFormColor={setFormColor}
              onSubmit={handleSubmit}
              onCancel={resetForm}
            />
          )}

          {/* Persona list */}
          {personas.length === 0 && !showForm ? (
            <div style={{
              textAlign: 'center',
              padding: '14px 8px 10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.09)',
              borderRadius: 8,
              margin: '2px 0 4px',
            }}>
              <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 16, padding: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Sparkles size={18} style={{ opacity: 0.5, display: 'block' }} />
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{t('persona.noPersonas')}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{t('persona.noPersonasHint')}</div>
              <button
                onClick={() => { resetForm(); setShowForm(true) }}
                style={{
                  marginTop: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.60)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
                }}
              >
                <Plus size={10} />
                {t('persona.addPersona')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {personas.map((p) => (
                <PersonaSidebarCard
                  key={p.id}
                  persona={p}
                  isActive={effectivePersonaId === p.id}
                  isDeleting={deletingId === p.id}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Available presets */}
          {availablePresets.length > 0 && personas.length < 10 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.38)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {t('persona.presets')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {availablePresets.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => handleInstallPreset(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      width: '100%',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: '1px dashed rgba(255,255,255,0.09)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 14 }}>{preset.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preset.presetKey ? t(`persona.preset.${preset.presetKey}`) : preset.name}
                      </div>
                    </div>
                    <Plus size={11} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export / Import */}
          {personas.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
              <button
                onClick={handleExport}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '4px 0',
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 4,
                  color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  fontSize: 9,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
              >
                <Download size={10} />
                {t('persona.exportPersonas')}
              </button>
              <button
                onClick={handleImport}
                disabled={personas.length >= 10}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '4px 0',
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 4,
                  color: 'rgba(255,255,255,0.45)',
                  cursor: personas.length >= 10 ? 'not-allowed' : 'pointer',
                  fontSize: 9,
                  opacity: personas.length >= 10 ? 0.4 : 1,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { if (personas.length < 10) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
              >
                <Upload size={10} />
                {t('persona.importPersonas')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
