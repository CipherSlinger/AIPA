import React, { useState } from 'react'
import { Plus, Sparkles, Download, Upload } from 'lucide-react'
import { usePrefsStore, useUiStore, useChatStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import PersonaForm from './PersonaForm'
import PersonaCard from './PersonaCard'
import PersonaPresets from './PersonaPresets'
import { SnippetsSection } from './SettingsTemplates'

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
  const [formTone, setFormTone] = useState('default')

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
    setFormTone('default')
  }

  const startEdit = (p: Persona) => {
    setEditingId(p.id)
    setFormName(p.name)
    setFormEmoji(p.emoji)
    setFormModel(p.model)
    setFormPrompt(p.systemPrompt)
    setFormColor(p.color)
    setFormTone(p.outputStyle || 'default')
    setShowForm(true)
  }

  const handleSubmit = () => {
    const name = formName.trim()
    if (!name || !formPrompt.trim()) return

    if (editingId) {
      const updated = personas.map(p =>
        p.id === editingId
          ? { ...p, name, emoji: formEmoji, model: formModel, systemPrompt: formPrompt.trim(), color: formColor, outputStyle: formTone as Persona['outputStyle'], updatedAt: Date.now() }
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
        outputStyle: formTone as Persona['outputStyle'],
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
      // Clear session persona if deleted (Iteration 407)
      if (useChatStore.getState().sessionPersonaId === id) {
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
    if (activePersonaId === persona.id) {
      // Remove as default
      setPrefs({ activePersonaId: undefined })
      window.electronAPI.prefsSet('activePersonaId', undefined)
      addToast('info', t('persona.defaultRemoved'))
    } else {
      // Set as default for new sessions
      setPrefs({ activePersonaId: persona.id })
      window.electronAPI.prefsSet('activePersonaId', persona.id)
      addToast('success', t('persona.defaultSet', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
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
      {showForm && (
        <PersonaForm
          editingId={editingId}
          formName={formName} setFormName={setFormName}
          formEmoji={formEmoji} setFormEmoji={setFormEmoji}
          formModel={formModel} setFormModel={setFormModel}
          formPrompt={formPrompt} setFormPrompt={setFormPrompt}
          formColor={formColor} setFormColor={setFormColor}
          formTone={formTone} setFormTone={setFormTone}
          onSubmit={handleSubmit}
          onCancel={resetForm}
        />
      )}

      {/* Persona list */}
      {personas.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
          <Sparkles size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 12 }}>{t('persona.noPersonas')}</div>
          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{t('persona.noPersonasHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {personas.map(p => (
            <PersonaCard
              key={p.id}
              persona={p}
              isActive={activePersonaId === p.id}
              isDefault={activePersonaId === p.id}
              isDeleting={deletingId === p.id}
              onActivate={handleActivate}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Preset personas */}
      <PersonaPresets personas={personas} onInstall={handleInstallPreset} />

      {/* Export / Import personas */}
      {personas.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          <button
            onClick={handleExport}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '5px 0',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 10,
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Download size={11} />
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
              gap: 5,
              padding: '5px 0',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-muted)',
              cursor: personas.length >= 10 ? 'not-allowed' : 'pointer',
              fontSize: 10,
              opacity: personas.length >= 10 ? 0.5 : 1,
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { if (personas.length < 10) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Upload size={11} />
            {t('persona.importPersonas')}
          </button>
        </div>
      )}
      {/* Text Snippets (moved from Templates tab, Iteration 309) */}
      <SnippetsSection />
    </div>
  )
}
