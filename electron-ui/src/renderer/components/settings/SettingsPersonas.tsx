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
  const [formColor, setFormColor] = useState('#6366f1')
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
    setFormColor('#6366f1')
    setFormTone('default')
  }

  const startEdit = (p: Persona) => {
    useUiStore.getState().openPersonaEditor(p.id)
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
      setPrefs({ activePersonaId: undefined })
      window.electronAPI.prefsSet('activePersonaId', undefined)
      addToast('info', t('persona.defaultRemoved'))
    } else {
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

  const isAtLimit = personas.length >= 10

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Subtitle */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('persona.subtitle')}
      </div>

      {/* Add button — shown when not in inline form mode */}
      {!showForm && (
        <button
          onClick={() => useUiStore.getState().openPersonaEditor(null)}
          disabled={isAtLimit}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px',
            background: isAtLimit
              ? 'rgba(255,255,255,0.04)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: isAtLimit ? '1px solid var(--glass-border)' : 'none',
            borderRadius: 8,
            color: isAtLimit ? 'var(--text-faint)' : 'rgba(255,255,255,0.95)',
            cursor: isAtLimit ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            width: '100%',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!isAtLimit) {
              e.currentTarget.style.filter = 'brightness(0.95)'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.filter = ''
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <Plus size={14} />
          {isAtLimit ? t('persona.maxReached') : t('persona.addPersona')}
        </button>
      )}

      {/* Inline form */}
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
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed rgba(255,255,255,0.08)',
          borderRadius: 12,
        }}>
          <Sparkles size={28} style={{ opacity: 0.25, marginBottom: 10, color: 'rgba(255,255,255,0.6)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 500 }}>
            {t('persona.noPersonas')}
          </div>
          <div style={{
            fontSize: 11, marginTop: 5,
            color: 'var(--text-faint)', lineHeight: 1.6,
          }}>
            {t('persona.noPersonasHint')}
          </div>
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

      {/* Export / Import row */}
      {personas.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleExport}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 5,
              padding: '7px 0',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 7,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 11, fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.background = 'rgba(99,102,241,0.09)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
          >
            <Download size={12} />
            {t('persona.exportPersonas')}
          </button>
          <button
            onClick={handleImport}
            disabled={isAtLimit}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 5,
              padding: '7px 0',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 7,
              color: 'var(--text-secondary)',
              cursor: isAtLimit ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 500,
              opacity: isAtLimit ? 0.45 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!isAtLimit) {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.background = 'rgba(99,102,241,0.09)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
          >
            <Upload size={12} />
            {t('persona.importPersonas')}
          </button>
        </div>
      )}

      {/* Text Snippets */}
      <SnippetsSection />
    </div>
  )
}
