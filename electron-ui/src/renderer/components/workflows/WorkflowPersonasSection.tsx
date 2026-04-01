/**
 * WorkflowPersonasSection
 *
 * 嵌入 WorkflowPanel 顶部的角色管理区块（Iteration 376）。
 * 从设置页面迁移至此，以便用户在使用工作流时可直接管理和切换角色。
 *
 * 功能：
 *  - 展示已有角色卡片（名称、Emoji、激活状态）
 *  - 激活 / 取消激活角色
 *  - 快速创建新角色（点击"+"展开内联表单）
 *  - 编辑 / 删除已有角色（展开详情时显示）
 *  - 安装预设角色
 *  - 导出 / 导入角色（personas.length > 0 时显示）
 *  - 折叠/展开区块（默认展开）
 */

import React, { useState, useEffect } from 'react'
import { Plus, ChevronDown, Check, Pencil, Trash2, X, Download, Upload, Sparkles } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { PERSONA_COLORS, EMOJI_PRESETS, PERSONA_PRESETS } from '../settings/personaConstants'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

// ─── Compact persona card for the sidebar ─────────────────────────────────────

interface PersonaSidebarCardProps {
  persona: Persona
  isActive: boolean
  isDeleting: boolean
  onActivate: (p: Persona) => void
  onEdit: (p: Persona) => void
  onDelete: (id: string) => void
}

function PersonaSidebarCard({ persona, isActive, isDeleting, onActivate, onEdit, onDelete }: PersonaSidebarCardProps) {
  const { t } = useI18n()
  const p = persona

  const modelLabel = MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey
    ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey)
    : p.model

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: isActive ? `${p.color}18` : 'transparent',
        border: `1px solid ${isActive ? p.color : 'var(--border)'}`,
        borderRadius: 7,
        transition: 'border-color 150ms, background 150ms',
      }}
    >
      {/* Emoji avatar */}
      <div style={{
        width: 30,
        height: 30,
        borderRadius: 6,
        background: `${p.color}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}>
        {p.emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </span>
          {isActive && (
            <span style={{
              fontSize: 8,
              background: p.color,
              color: '#fff',
              padding: '1px 5px',
              borderRadius: 7,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {t('persona.active')}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 9,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {modelLabel}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button
          onClick={() => onActivate(p)}
          title={isActive ? t('persona.deactivate') : t('persona.activate')}
          style={{
            width: 24,
            height: 24,
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
          <Check size={11} />
        </button>
        <button
          onClick={() => onEdit(p)}
          title={t('persona.editPersona')}
          style={{
            width: 24,
            height: 24,
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
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onDelete(p.id)}
          title={isDeleting ? t('persona.deleteConfirm') : t('persona.deletePersona')}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: 'none',
            background: isDeleting ? 'var(--error)' : 'none',
            color: isDeleting ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { if (!isDeleting) e.currentTarget.style.background = 'none' }}
        >
          {isDeleting ? <X size={10} /> : <Trash2 size={10} />}
        </button>
      </div>
    </div>
  )
}

// ─── Inline persona create/edit form ─────────────────────────────────────────

interface PersonaInlineFormProps {
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
  onSubmit: () => void
  onCancel: () => void
}

function PersonaInlineForm({
  editingId, formName, setFormName, formEmoji, setFormEmoji,
  formModel, setFormModel, formPrompt, setFormPrompt,
  formColor, setFormColor, onSubmit, onCancel,
}: PersonaInlineFormProps) {
  const { t } = useI18n()
  const canSubmit = formName.trim() && formPrompt.trim()

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 26,
    padding: '0 8px',
    background: 'var(--input-field-bg)',
    border: '1px solid var(--input-field-border)',
    borderRadius: 5,
    fontSize: 11,
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 6,
  }

  return (
    <div style={{
      padding: '8px 10px',
      background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.04)',
      border: '1px solid var(--accent)',
      borderRadius: 7,
      marginBottom: 6,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>
        {editingId ? t('persona.editPersona') : t('persona.addPersona')}
      </div>

      {/* Name */}
      <input
        value={formName}
        onChange={e => setFormName(e.target.value)}
        placeholder={t('persona.namePlaceholder')}
        maxLength={30}
        autoFocus
        style={inputStyle}
      />

      {/* Emoji picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
        {EMOJI_PRESETS.map(emoji => (
          <button
            key={emoji}
            onClick={() => setFormEmoji(emoji)}
            style={{
              width: 28,
              height: 28,
              border: formEmoji === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 5,
              background: formEmoji === emoji ? 'rgba(var(--accent-rgb, 59, 130, 246), 0.12)' : 'none',
              cursor: 'pointer',
              fontSize: 14,
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
      <select
        value={formModel}
        onChange={e => setFormModel(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        {MODEL_OPTIONS.map(m => (
          <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
        ))}
      </select>

      {/* System Prompt */}
      <textarea
        value={formPrompt}
        onChange={e => setFormPrompt(e.target.value)}
        placeholder={t('persona.systemPromptPlaceholder')}
        rows={3}
        maxLength={2000}
        style={{
          ...inputStyle,
          height: 'auto',
          resize: 'vertical',
          minHeight: 56,
          fontFamily: 'inherit',
          lineHeight: 1.4,
          paddingTop: 5,
          paddingBottom: 5,
        }}
      />

      {/* Color */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {PERSONA_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setFormColor(c)}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: c,
              border: formColor === c ? '2px solid var(--text-bright)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'transform 100ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: canSubmit ? 'var(--accent)' : 'var(--input-field-bg)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 0',
            color: canSubmit ? '#fff' : 'var(--text-muted)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: 10,
            fontWeight: 600,
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
            padding: '4px 0',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          {t('persona.cancel')}
        </button>
      </div>
    </div>
  )
}

// ─── Main exported section ─────────────────────────────────────────────────────

export default function WorkflowPersonasSection() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const addToast = useUiStore(s => s.addToast)

  // Load personas from prefs — keep in sync with SettingsPanel
  const [personas, setPersonas] = useState<Persona[]>(prefs.personas || [])
  const activePersonaId = prefs.activePersonaId

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
    setFormEmoji('🧑‍💼')
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
      setDeletingId(null)
      addToast('success', t('persona.deleted'))
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  const handleActivate = (persona: Persona) => {
    if (activePersonaId === persona.id) {
      setPrefs({ activePersonaId: undefined, systemPrompt: '' })
      window.electronAPI.prefsSet('activePersonaId', undefined)
      window.electronAPI.prefsSet('systemPrompt', '')
      addToast('info', t('persona.deactivated'))
    } else {
      setPrefs({ activePersonaId: persona.id, model: persona.model, systemPrompt: persona.systemPrompt })
      window.electronAPI.prefsSet('activePersonaId', persona.id)
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', persona.systemPrompt)
      addToast('success', t('persona.switchedTo', { name: persona.name }))
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
    preset => !personas.some(p => p.name === preset.name)
  )

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
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
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('persona.title')} ({personas.length})
          </span>
          {activePersonaId && (
            <span style={{
              fontSize: 8,
              background: 'var(--accent)',
              color: '#fff',
              padding: '1px 5px',
              borderRadius: 6,
              fontWeight: 700,
            }}>
              {personas.find(p => p.id === activePersonaId)?.emoji ?? ''}
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
                background: showForm && !editingId ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 5,
                padding: 3,
                cursor: personas.length >= 10 ? 'not-allowed' : 'pointer',
                color: showForm && !editingId ? '#fff' : 'var(--text-muted)',
                display: 'flex',
                opacity: personas.length >= 10 ? 0.4 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={13} />
            </button>
          )}
          <ChevronDown
            size={13}
            style={{
              color: 'var(--text-muted)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
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
            <div style={{ textAlign: 'center', padding: '10px 0 6px', color: 'var(--text-muted)' }}>
              <Sparkles size={20} style={{ opacity: 0.3, marginBottom: 4 }} />
              <div style={{ fontSize: 11 }}>{t('persona.noPersonas')}</div>
              <div style={{ fontSize: 9, marginTop: 3, opacity: 0.65 }}>{t('persona.noPersonasHint')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {personas.map(p => (
                <PersonaSidebarCard
                  key={p.id}
                  persona={p}
                  isActive={activePersonaId === p.id}
                  isDeleting={deletingId === p.id}
                  onActivate={handleActivate}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Available presets */}
          {availablePresets.length > 0 && personas.length < 10 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
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
                      border: '1px dashed var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <span style={{ fontSize: 14 }}>{preset.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preset.name}
                      </div>
                    </div>
                    <Plus size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 9,
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-muted)',
                  cursor: personas.length >= 10 ? 'not-allowed' : 'pointer',
                  fontSize: 9,
                  opacity: personas.length >= 10 ? 0.5 : 1,
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => { if (personas.length < 10) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
