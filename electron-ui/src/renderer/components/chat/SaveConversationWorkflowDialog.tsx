// Preview and edit a workflow derived from the current conversation.
// Saving writes through the same prefs.workflows path the workflow editor uses,
// so the result is indistinguishable from a hand-made workflow.

import React, { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, GitBranch, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { Workflow } from '../../types/app.types'
import { buildWorkflowDraft, type DerivedStep } from '../../lib/sessionReuse'
import {
  MAX_WORKFLOWS,
  MAX_NAME_LENGTH,
  MAX_DESC_LENGTH,
  MAX_STEP_PROMPT,
} from '../workflows/workflowConstants'
import SessionReuseDialogShell from './SessionReuseDialogShell'

interface Props {
  sessionTitle: string | null
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 12,
  background: 'var(--bg-hover)',
  border: '1px solid var(--bg-active)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s ease',
}

export default function SaveConversationWorkflowDialog({ sessionTitle, onClose }: Props) {
  const t = useT()
  const messages = useChatStore(s => s.messages)
  const addToast = useUiStore(s => s.addToast)
  const draft = useMemo(
    () => buildWorkflowDraft(messages, sessionTitle, t),
    [messages, sessionTitle, t],
  )
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [steps, setSteps] = useState(draft.steps)

  const updateStep = useCallback((index: number, patch: Partial<Pick<DerivedStep, 'title' | 'prompt'>>) => {
    setSteps(current => current.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }, [])

  const removeStep = useCallback((index: number) => {
    setSteps(current => current.filter((_, i) => i !== index))
  }, [])

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      addToast('warning', t('sessionReuse.workflow.missingName'))
      return
    }
    const usable = steps.filter(step => step.prompt.trim())
    if (usable.length === 0) {
      addToast('warning', t('sessionReuse.workflow.missingSteps'))
      return
    }
    const existing = usePrefsStore.getState().prefs.workflows ?? []
    if (existing.length >= MAX_WORKFLOWS) {
      addToast('error', t('sessionReuse.workflow.limit', { max: MAX_WORKFLOWS }))
      return
    }
    const now = Date.now()
    const workflow: Workflow = {
      id: `wf-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, MAX_NAME_LENGTH),
      description: description.trim().slice(0, MAX_DESC_LENGTH),
      icon: '🔄',
      steps: usable.map((step, i) => ({
        id: `step-${now}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        title: step.title.trim().slice(0, MAX_NAME_LENGTH)
          || t('sessionReuse.workflow.stepFallback', { n: i + 1 }),
        prompt: step.prompt.trim().slice(0, MAX_STEP_PROMPT),
      })),
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    }
    const updated = [workflow, ...existing]
    usePrefsStore.getState().setPrefs({ workflows: updated })
    window.electronAPI?.prefsSet('workflows', updated)
    addToast('success', t('sessionReuse.workflow.saved', { name: workflow.name }))
    onClose()
  }, [name, description, steps, addToast, t, onClose])

  const empty = draft.totalTurns === 0

  return (
    <SessionReuseDialogShell
      title={t('sessionReuse.workflow.title')}
      subtitle={t('sessionReuse.workflow.subtitle')}
      icon={<GitBranch size={16} />}
      onClose={onClose}
      testId="workflow"
      footer={(
        <>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
              color: 'var(--text-secondary)', fontWeight: 500,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={empty || !name.trim() || steps.length === 0}
            data-reuse-save="workflow"
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: empty || !name.trim() || steps.length === 0 ? 'not-allowed' : 'pointer',
              background: empty || !name.trim() || steps.length === 0
                ? 'var(--bg-hover)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', color: 'var(--text-bright)', fontWeight: 600,
              opacity: empty || !name.trim() || steps.length === 0 ? 0.5 : 1,
            }}
          >
            {t('common.save')}
          </button>
        </>
      )}
    >
      {empty ? (
        <div style={{ padding: '28px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('sessionReuse.workflow.empty')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            {t('sessionReuse.workflow.emptyHint')}
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{t('sessionReuse.workflow.name')}</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              maxLength={MAX_NAME_LENGTH}
              placeholder={t('sessionReuse.workflow.namePlaceholder')}
              data-reuse-field="workflow-name"
              style={fieldStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('sessionReuse.workflow.description')}</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, MAX_DESC_LENGTH))}
              maxLength={MAX_DESC_LENGTH}
              placeholder={t('sessionReuse.workflow.descPlaceholder')}
              style={fieldStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
            />
          </div>

          {draft.truncated && (
            <div
              data-reuse-truncated="workflow"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '7px 10px', marginBottom: 12,
                background: 'rgba(234,179,8,0.10)',
                border: '1px solid rgba(234,179,8,0.28)',
                borderRadius: 8,
                fontSize: 11, color: 'rgba(253,224,71,0.92)', lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {t('sessionReuse.workflow.truncated', {
                  shown: draft.steps.length,
                  total: draft.totalTurns,
                  omitted: draft.totalTurns - draft.steps.length,
                })}
              </span>
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 6,
          }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>{t('sessionReuse.workflow.steps')}</label>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }} data-reuse-step-count>
              {steps.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((step, index) => (
              <div
                key={step.id}
                data-reuse-step={index}
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '9px 10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#818cf8',
                    background: 'rgba(99,102,241,0.14)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {index + 1}
                  </span>
                  <input
                    value={step.title}
                    onChange={e => updateStep(index, { title: e.target.value.slice(0, MAX_NAME_LENGTH) })}
                    maxLength={MAX_NAME_LENGTH}
                    aria-label={t('sessionReuse.workflow.stepTitle', { n: index + 1 })}
                    placeholder={t('sessionReuse.workflow.stepTitle', { n: index + 1 })}
                    style={{ ...fieldStyle, flex: 1, minWidth: 0, padding: '5px 8px', fontSize: 11 }}
                  />
                  <button
                    onClick={() => removeStep(index)}
                    title={t('sessionReuse.workflow.remove')}
                    aria-label={t('sessionReuse.workflow.remove')}
                    data-reuse-drop={index}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.10)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <textarea
                  value={step.prompt}
                  onChange={e => updateStep(index, { prompt: e.target.value.slice(0, MAX_STEP_PROMPT) })}
                  rows={3}
                  aria-label={t('sessionReuse.workflow.stepPrompt', { n: index + 1 })}
                  placeholder={t('sessionReuse.workflow.stepPromptPlaceholder')}
                  style={{
                    ...fieldStyle, marginTop: 7, fontSize: 11, lineHeight: 1.5,
                    resize: 'vertical', minHeight: 54, maxHeight: 160,
                  }}
                />
                <div style={{
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                  marginTop: 3, fontSize: 9.5, color: 'var(--text-muted)',
                }}>
                  <span>
                    {step.promptTruncated
                      ? t('sessionReuse.workflow.promptTruncated', { limit: MAX_STEP_PROMPT })
                      : ''}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {step.prompt.length}/{MAX_STEP_PROMPT}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SessionReuseDialogShell>
  )
}
