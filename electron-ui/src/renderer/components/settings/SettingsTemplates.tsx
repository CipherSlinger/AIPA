import React, { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import { PROMPT_TEMPLATES } from '../../utils/promptTemplates'
import type { CustomPromptTemplate } from '../../types/app.types'
import { INPUT_STYLE } from './settingsConstants'

interface SettingsTemplatesProps {
  customTemplates: CustomPromptTemplate[]
  setCustomTemplates: (templates: CustomPromptTemplate[]) => void
}

export default function SettingsTemplates({ customTemplates, setCustomTemplates }: SettingsTemplatesProps) {
  const { setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [templateFormName, setTemplateFormName] = useState('')
  const [templateFormPrompt, setTemplateFormPrompt] = useState('')
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)

  const saveTemplates = (updated: CustomPromptTemplate[]) => {
    setCustomTemplates(updated)
    setPrefs({ customPromptTemplates: updated })
    window.electronAPI.prefsSet('customPromptTemplates', updated)
  }

  const resetForm = () => {
    setEditingTemplateId(null)
    setShowAddForm(false)
    setTemplateFormName('')
    setTemplateFormPrompt('')
  }

  const templateForm = (onSubmit: () => void) => (
    <div style={{ padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--accent)', borderRadius: 6, marginBottom: editingTemplateId ? 0 : 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('settings.templates.templateName')}</div>
      <input
        value={templateFormName}
        onChange={(e) => setTemplateFormName(e.target.value)}
        placeholder={t('settings.templates.templateNamePlaceholder')}
        maxLength={50}
        style={{ ...INPUT_STYLE, marginBottom: 8 }}
        autoFocus
      />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('settings.templates.templatePrompt')}</div>
      <textarea
        value={templateFormPrompt}
        onChange={(e) => setTemplateFormPrompt(e.target.value)}
        placeholder={t('settings.templates.templatePromptPlaceholder')}
        maxLength={5000}
        rows={4}
        style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 80, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={resetForm}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
        >{t('settings.templates.cancel')}</button>
        <button
          onClick={onSubmit}
          disabled={!templateFormName.trim() || !templateFormPrompt.trim()}
          style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '4px 12px', color: '#fff', cursor: templateFormName.trim() && templateFormPrompt.trim() ? 'pointer' : 'not-allowed', fontSize: 11, opacity: templateFormName.trim() && templateFormPrompt.trim() ? 1 : 0.5 }}
        >{t('settings.templates.save')}</button>
      </div>
    </div>
  )

  return (
    <div>
      {/* Built-in templates (read-only) */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.templates.builtIn')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {PROMPT_TEMPLATES.filter(tpl => tpl.id !== 'none').map(tpl => (
          <div
            key={tpl.id}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: 0.7,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t(tpl.labelKey)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tpl.prompt.slice(0, 80)}{tpl.prompt.length > 80 ? '...' : ''}
              </div>
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>
              {t('settings.templates.builtInBadge')}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }} />

      {/* Custom templates */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        {t('settings.templates.myTemplates')} ({customTemplates.length}/20)
      </div>

      {customTemplates.length === 0 && !showAddForm && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
          {t('settings.templates.emptyState')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {customTemplates.map(ct => (
          <div key={ct.id}>
            {editingTemplateId === ct.id ? (
              templateForm(() => {
                if (!templateFormName.trim() || !templateFormPrompt.trim()) return
                const updated = customTemplates.map(c =>
                  c.id === ct.id ? { ...c, name: templateFormName.trim(), prompt: templateFormPrompt.trim(), updatedAt: Date.now() } : c
                )
                saveTemplates(updated)
                resetForm()
              })
            ) : (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ct.name}</div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {ct.prompt}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setEditingTemplateId(ct.id)
                      setTemplateFormName(ct.name)
                      setTemplateFormPrompt(ct.prompt)
                      setShowAddForm(false)
                    }}
                    aria-label={t('settings.templates.editTemplate')}
                    title={t('settings.templates.editTemplate')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => {
                      if (deletingTemplateId === ct.id) {
                        const updated = customTemplates.filter(c => c.id !== ct.id)
                        saveTemplates(updated)
                        setDeletingTemplateId(null)
                      } else {
                        setDeletingTemplateId(ct.id)
                        setTimeout(() => setDeletingTemplateId(prev => prev === ct.id ? null : prev), 2000)
                      }
                    }}
                    aria-label={deletingTemplateId === ct.id ? t('settings.templates.confirmDelete') : t('settings.templates.deleteTemplate')}
                    title={deletingTemplateId === ct.id ? t('settings.templates.confirmDelete') : t('settings.templates.deleteTemplate')}
                    style={{
                      background: 'none', border: 'none',
                      color: deletingTemplateId === ct.id ? 'var(--error)' : 'var(--text-muted)',
                      cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4,
                      fontWeight: deletingTemplateId === ct.id ? 600 : 400,
                      fontSize: deletingTemplateId === ct.id ? 10 : 'inherit',
                    }}
                    onMouseEnter={(e) => { if (deletingTemplateId !== ct.id) e.currentTarget.style.color = 'var(--error)' }}
                    onMouseLeave={(e) => { if (deletingTemplateId !== ct.id) e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    {deletingTemplateId === ct.id ? t('settings.templates.confirmDelete') : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add template form */}
      {showAddForm && templateForm(() => {
        if (!templateFormName.trim() || !templateFormPrompt.trim()) return
        const newTemplate: CustomPromptTemplate = {
          id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: templateFormName.trim(),
          prompt: templateFormPrompt.trim(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        saveTemplates([...customTemplates, newTemplate])
        resetForm()
      })}

      {/* Add template button */}
      {!showAddForm && customTemplates.length < 20 && (
        <button
          onClick={() => {
            setShowAddForm(true)
            setEditingTemplateId(null)
            setTemplateFormName('')
            setTemplateFormPrompt('')
          }}
          aria-label={t('settings.templates.addTemplate')}
          style={{
            background: 'none', border: '1px dashed var(--border)', borderRadius: 6,
            padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <Plus size={14} />
          {t('settings.templates.addTemplate')}
        </button>
      )}
      {customTemplates.length >= 20 && !showAddForm && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
          {t('settings.templates.limitReached')}
        </div>
      )}
    </div>
  )
}
