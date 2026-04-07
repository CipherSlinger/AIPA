// WorkflowEditorPage — full-width workflow editor rendered in main content area
// Iteration 414

import React, { useState, useEffect } from 'react'
import { ArrowLeft, Save, Plus, GripVertical, Trash2 } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Workflow, WorkflowStep } from '../../types/app.types'
import { INPUT_STYLE } from './settingsConstants'

const WORKFLOW_EMOJIS = [
  '\u{1F4CB}', '\u{1F4CA}', '\u{1F4DD}', '\u2728', '\u{1F680}',
  '\u{1F9E0}', '\u{1F3AF}', '\u{1F50D}', '\u{1F4A1}', '\u{1F4E7}',
  '\u{1F30D}', '\u2699\uFE0F',
]

const EMPTY_WORKFLOWS: Workflow[] = []

export default function WorkflowEditorPage() {
  const { t } = useI18n()
  const editingId = useUiStore(s => s.editingWorkflowId)
  const addToast = useUiStore(s => s.addToast)
  const workflows = usePrefsStore(s => s.prefs.workflows ?? EMPTY_WORKFLOWS)
  const existing = editingId ? workflows.find(w => w.id === editingId) : null

  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formIcon, setFormIcon] = useState('\u{1F4CB}')
  const [steps, setSteps] = useState<{ id: string; title: string; prompt: string }[]>([
    { id: `step-${Date.now()}`, title: '', prompt: '' },
  ])

  // Load existing workflow data
  useEffect(() => {
    if (existing) {
      setFormName(existing.name)
      setFormDesc(existing.description)
      setFormIcon(existing.icon)
      setSteps(existing.steps.map(s => ({ ...s })))
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

  const canSubmit = formName.trim() && steps.some(s => s.prompt.trim())

  const addStep = () => {
    if (steps.length >= 20) return
    setSteps([...steps, { id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: '', prompt: '' }])
  }

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return
    setSteps(steps.filter((_, i) => i !== idx))
  }

  const updateStep = (idx: number, field: 'title' | 'prompt', value: string) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const handleSave = () => {
    const name = formName.trim()
    if (!name) return

    const validSteps: WorkflowStep[] = steps
      .filter(s => s.prompt.trim())
      .map(s => ({
        id: s.id,
        title: s.title.trim() || `Step ${steps.indexOf(s) + 1}`,
        prompt: s.prompt.trim(),
      }))

    if (validSteps.length === 0) return

    const prefs = usePrefsStore.getState()
    const currentWorkflows = prefs.prefs.workflows || []

    if (editingId) {
      const updated = currentWorkflows.map(w =>
        w.id === editingId
          ? { ...w, name, description: formDesc.trim(), icon: formIcon, steps: validSteps, updatedAt: Date.now() }
          : w
      )
      prefs.setPrefs({ workflows: updated })
      window.electronAPI.prefsSet('workflows', updated)
      addToast('success', t('workflow.updated'))
    } else {
      if (currentWorkflows.length >= 50) {
        addToast('error', t('workflow.limitReached'))
        return
      }
      const newWorkflow: Workflow = {
        id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        description: formDesc.trim(),
        icon: formIcon,
        steps: validSteps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        runCount: 0,
      }
      const updated = [...currentWorkflows, newWorkflow]
      prefs.setPrefs({ workflows: updated })
      window.electronAPI.prefsSet('workflows', updated)
      addToast('success', t('workflow.created'))
    }

    goBack()
  }

  const pageTitle = editingId ? (existing?.name || t('workflow.edit')) : t('workflow.create')

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
          {t('workflow.save')}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 700, padding: '24px 20px' }}>

          {/* Name + Icon */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start' }}>
            {/* Icon display */}
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>
              {formIcon}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                {t('workflow.name')}
              </div>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={t('workflow.namePlaceholder')}
                maxLength={50}
                style={{ ...INPUT_STYLE, fontSize: 14 }}
                autoFocus
              />
            </div>
          </div>

          {/* Icon picker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('workflow.icon')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {WORKFLOW_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setFormIcon(emoji)}
                  style={{
                    width: 36, height: 36,
                    border: formIcon === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 8,
                    background: formIcon === emoji ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'transparent',
                    cursor: 'pointer', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              {t('workflow.description')}
            </div>
            <input
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder={t('workflow.descPlaceholder')}
              maxLength={200}
              style={INPUT_STYLE}
            />
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{t('workflow.steps')} ({steps.length}/20)</span>
              <button
                onClick={addStep}
                disabled={steps.length >= 20}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '3px 10px',
                  color: steps.length >= 20 ? 'var(--text-muted)' : 'var(--accent)',
                  cursor: steps.length >= 20 ? 'not-allowed' : 'pointer',
                  fontSize: 11, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Plus size={12} />
                {t('workflow.addStep')}
              </button>
            </div>

            {steps.map((step, idx) => (
              <div
                key={step.id}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <GripVertical size={14} color="var(--text-muted)" style={{ opacity: 0.4, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, minWidth: 50 }}>
                    {t('workflow.stepN', { n: idx + 1 })}
                  </span>
                  <input
                    value={step.title}
                    onChange={e => updateStep(idx, 'title', e.target.value)}
                    placeholder={t('workflow.stepTitlePlaceholder')}
                    maxLength={50}
                    style={{ ...INPUT_STYLE, flex: 1, fontSize: 12 }}
                  />
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(idx)}
                      style={{
                        background: 'none', border: 'none',
                        cursor: 'pointer', color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <textarea
                  value={step.prompt}
                  onChange={e => updateStep(idx, 'prompt', e.target.value)}
                  placeholder={t('workflow.stepPromptPlaceholder')}
                  maxLength={2000}
                  rows={3}
                  style={{
                    ...INPUT_STYLE,
                    resize: 'vertical', minHeight: 60,
                    fontFamily: 'inherit', lineHeight: 1.5,
                  }}
                />
              </div>
            ))}
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
              {t('workflow.cancel')}
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
              {editingId ? t('workflow.save') : t('workflow.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
