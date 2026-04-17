// WorkflowEditorPage — full-width workflow editor rendered in main content area
// Iteration 415

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

// Glass input surface — matches design-system spec
const GLASS_INPUT: React.CSSProperties = {
  ...INPUT_STYLE,
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'all 0.15s ease',
}

// Micro-label (section headers)
const MICRO_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 8,
}

// Form section card
const SECTION_CARD: React.CSSProperties = {
  background: 'var(--glass-bg-low)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 20px',
  marginBottom: 12,
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
}

// Utility: focus ring handlers for inputs
const focusRingOn = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.border = '1px solid rgba(99,102,241,0.45)'
  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45)'
}
const focusRingOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.border = '1px solid var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

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
  const [hoveredStepIdx, setHoveredStepIdx] = useState<number | null>(null)
  const [addStepHovered, setAddStepHovered] = useState(false)

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-chat)' }}>
      {/* Header */}
      <div style={{
        height: 44,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
            padding: 4, borderRadius: 8, transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {pageTitle}
        </span>
        <button
          onClick={handleSave}
          disabled={!canSubmit}
          onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = canSubmit ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))' : 'var(--bg-hover)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
          style={{
            background: canSubmit
              ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
              : 'var(--bg-hover)',
            border: 'none',
            borderRadius: 8,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            color: canSubmit ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '7px 14px',
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
          {t('workflow.save')}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 700, padding: '24px 20px' }}>

          {/* Name + Icon */}
          <div style={SECTION_CARD}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Icon display */}
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, flexShrink: 0,
              }}>
                {formIcon}
              </div>

              <div style={{ flex: 1 }}>
                <div style={MICRO_LABEL}>{t('workflow.name')}</div>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={t('workflow.namePlaceholder')}
                  maxLength={50}
                  style={{ ...GLASS_INPUT, fontSize: 14 }}
                  onFocus={focusRingOn}
                  onBlur={focusRingOff}
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Icon picker */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('workflow.icon')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {WORKFLOW_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setFormIcon(emoji)}
                  style={{
                    width: 36, height: 36,
                    border: formIcon === emoji ? '2px solid rgba(99,102,241,0.8)' : '1px solid var(--border)',
                    borderRadius: 8,
                    background: formIcon === emoji ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
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

          {/* Description */}
          <div style={SECTION_CARD}>
            <div style={MICRO_LABEL}>{t('workflow.description')}</div>
            <input
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder={t('workflow.descPlaceholder')}
              maxLength={200}
              style={GLASS_INPUT}
              onFocus={focusRingOn}
              onBlur={focusRingOff}
            />
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}>
              <span style={{ ...MICRO_LABEL, marginBottom: 0 }}>
                {t('workflow.steps')} ({steps.length}/20)
              </span>
            </div>

            {steps.map((step, idx) => (
              <div
                key={step.id}
                style={{
                  background: 'var(--glass-bg-low)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 10,
                  boxShadow: hoveredStepIdx === idx
                    ? '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
                    : '0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={() => setHoveredStepIdx(idx)}
                onMouseLeave={() => setHoveredStepIdx(null)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {/* Drag handle — visible on hover */}
                  <GripVertical
                    size={14}
                    color={hoveredStepIdx === idx ? 'var(--text-muted)' : 'var(--text-muted)'}
                    style={{ flexShrink: 0, transition: 'all 0.15s ease', cursor: 'grab' }}
                  />

                  {/* Numbered indigo badge */}
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'rgba(99,102,241,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>

                  <input
                    value={step.title}
                    onChange={e => updateStep(idx, 'title', e.target.value)}
                    placeholder={t('workflow.stepTitlePlaceholder')}
                    maxLength={50}
                    style={{ ...GLASS_INPUT, flex: 1, fontSize: 12 }}
                    onFocus={focusRingOn}
                    onBlur={focusRingOff}
                  />
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(idx)}
                      style={{
                        background: 'none', border: 'none',
                        cursor: 'pointer', color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4,
                        flexShrink: 0, transition: 'all 0.15s ease',
                        opacity: hoveredStepIdx === idx ? 1 : 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
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
                    ...GLASS_INPUT,
                    background: 'var(--bg-hover)',
                    resize: 'vertical', minHeight: 60,
                    fontFamily: 'monospace', lineHeight: 1.6, fontSize: 13,
                    width: '100%', boxSizing: 'border-box',
                  }}
                  onFocus={focusRingOn}
                  onBlur={focusRingOff}
                />
              </div>
            ))}

            {/* Add step — dashed border pattern */}
            <button
              onClick={addStep}
              disabled={steps.length >= 20}
              onMouseEnter={() => setAddStepHovered(true)}
              onMouseLeave={() => setAddStepHovered(false)}
              style={{
                width: '100%',
                background: addStepHovered && steps.length < 20 ? 'var(--glass-bg-low)' : 'transparent',
                border: `1.5px dashed ${steps.length >= 20 ? 'var(--border)' : addStepHovered ? 'var(--text-muted)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '10px 16px',
                color: steps.length >= 20 ? 'var(--text-muted)' : 'var(--text-muted)',
                cursor: steps.length >= 20 ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <Plus size={13} />
              {t('workflow.addStep')}
            </button>
          </div>

          {/* Bottom actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 24 }}>
            <button
              onClick={goBack}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '7px 14px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--text-muted)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {t('workflow.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSubmit}
              onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = canSubmit ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))' : 'var(--bg-hover)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'var(--bg-hover)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                color: canSubmit ? 'var(--text-primary)' : 'var(--text-muted)',
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
              {editingId ? t('workflow.save') : t('workflow.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
