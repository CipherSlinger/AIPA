// Preview and edit a workflow derived from the current conversation.
// Saving writes through the same prefs.workflows path the workflow editor uses,
// so the result is indistinguishable from a hand-made workflow.
//
// Two ways to build the draft:
//   - "As it happened" replays the user's literal requests (the default).
//   - "Generalize with AIPA" asks the model to turn the stored conversation
//     into a reusable procedure. That costs a model call, so it only runs when
//     the button is pressed; the result is applied to the fields and labelled
//     step by step. Nothing is saved until Save, and a failure changes nothing.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, GitBranch, Sparkles, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { Workflow } from '../../types/app.types'
import type {
  SessionGeneralizeError,
  SessionWorkflowDraftData,
  SessionWorkflowDraftMetaData,
} from '../../../preload'
import { buildWorkflowDraft, localDateStamp } from '../../lib/sessionReuse'
import { workflowProvenance } from '../../lib/provenance'
import {
  applyDraft,
  canGeneralize,
  draftNotes,
  generalizeErrorKey,
  metaNote,
  type EditorStep,
} from '../../lib/generalizeDraft'
import {
  MAX_WORKFLOWS,
  MAX_NAME_LENGTH,
  MAX_DESC_LENGTH,
  MAX_STEP_PROMPT,
  MAX_STEPS,
} from '../workflows/workflowConstants'
import SessionReuseDialogShell from './SessionReuseDialogShell'

interface Props {
  /** The stored conversation to generalise; null when it was never saved. */
  sessionId: string | null
  sessionTitle: string | null
  onClose: () => void
}

type DraftMode = 'exact' | 'general'

interface AppliedGeneral {
  draft: SessionWorkflowDraftData
  meta: SessionWorkflowDraftMetaData
  stepsDropped: number
}

interface GeneralFailure {
  error: SessionGeneralizeError
  reason?: string
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

const modeBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

const modeBtnActiveStyle: React.CSSProperties = {
  background: 'rgba(99,102,241,0.18)',
  color: '#a5b4fc',
}

const bandStyle: React.CSSProperties = {
  padding: '10px 12px',
  marginBottom: 12,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: 10,
  fontSize: 11,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
}

const bandHeadingStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#a5b4fc',
  marginBottom: 3,
}

const bandListStyle: React.CSSProperties = {
  margin: '3px 0 0',
  paddingLeft: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

export default function SaveConversationWorkflowDialog({
  sessionId,
  sessionTitle,
  onClose,
}: Props) {
  const { t, resolvedLocale } = useI18n()
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const addToast = useUiStore(s => s.addToast)
  const draft = useMemo(
    () => buildWorkflowDraft(messages, sessionTitle, t),
    [messages, sessionTitle, t],
  )
  const [mode, setMode] = useState<DraftMode>('exact')
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [icon, setIcon] = useState('🔄')
  const [steps, setSteps] = useState<EditorStep[]>(draft.steps)
  const [pending, setPending] = useState(false)
  const [applied, setApplied] = useState<AppliedGeneral | null>(null)
  const [failure, setFailure] = useState<GeneralFailure | null>(null)

  // One token per generalisation. A late answer whose token no longer matches
  // was cancelled, closed or superseded, and must not touch state.
  const requestRef = useRef(0)
  const aliveRef = useRef(true)
  const pendingRef = useRef(false)

  const availability = useMemo(
    () => canGeneralize(sessionId, isStreaming),
    [sessionId, isStreaming],
  )
  const unavailableKey = availability.reason === 'streaming'
    ? 'chat.reuse.generalize.unavailableStreaming'
    : 'chat.reuse.generalize.unavailableNoSession'

  const notes = useMemo(() => (applied ? draftNotes(applied.draft) : null), [applied])
  const appliedMeta = useMemo(() => (applied ? metaNote(applied.meta) : null), [applied])
  const appliedMetaKey = appliedMeta
    ? appliedMeta.key === 'truncated'
      ? 'chat.reuse.generalize.metaTruncated'
      : 'chat.reuse.generalize.metaFull'
    : null

  // Leaving the dialog while the model is working cancels the call. The
  // cleanup also fires when the menu closes the dialog around us; cancelling
  // twice is harmless, but no state is set after this point.
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      requestRef.current += 1
      if (pendingRef.current) {
        pendingRef.current = false
        void window.electronAPI?.sessionGeneralizeWorkflowCancel?.()
      }
    }
  }, [])

  // Choosing the literal mode again puts the deterministic draft back into the
  // fields. Without this, a generalised draft would keep sitting under an "As
  // it happened" label after the user switched back. Manual edits survive when
  // nothing was applied, so a stray mode toggle does not discard them.
  const selectExact = useCallback(() => {
    setMode('exact')
    setFailure(null)
    if (applied) {
      setName(draft.name)
      setDescription(draft.description)
      setSteps(draft.steps)
      setIcon('🔄')
      setApplied(null)
    }
  }, [applied, draft])

  const handleClose = useCallback(() => {
    requestRef.current += 1
    if (pendingRef.current) {
      pendingRef.current = false
      void window.electronAPI?.sessionGeneralizeWorkflowCancel?.()
    }
    onClose()
  }, [onClose])

  const updateStep = useCallback((index: number, patch: Partial<Pick<EditorStep, 'title' | 'prompt'>>) => {
    setSteps(current => current.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }, [])

  const removeStep = useCallback((index: number) => {
    setSteps(current => current.filter((_, i) => i !== index))
  }, [])

  const runGeneralize = useCallback(async () => {
    if (!availability.ok || pendingRef.current || !sessionId) return
    const token = requestRef.current + 1
    requestRef.current = token
    pendingRef.current = true
    setPending(true)
    setFailure(null)
    try {
      const api = window.electronAPI
      if (!api) {
        if (aliveRef.current && token === requestRef.current) {
          setFailure({ error: 'failed' })
        }
        return
      }
      const result = await api.sessionGeneralizeWorkflow({
        sessionId,
        locale: resolvedLocale,
        title: sessionTitle,
      })
      if (!aliveRef.current || token !== requestRef.current) return
      if (result.ok) {
        const next = applyDraft({ name, description, icon, steps }, result.draft)
        setName(next.name)
        setDescription(next.description)
        setIcon(next.icon)
        setSteps(next.steps)
        setApplied({ draft: result.draft, meta: result.meta, stepsDropped: next.stepsDropped })
      } else {
        // Keep every field exactly as it was: a refusal is not a draft.
        setFailure({ error: result.error, reason: result.reason })
      }
    } catch {
      if (!aliveRef.current || token !== requestRef.current) return
      setFailure({ error: 'failed' })
    } finally {
      if (aliveRef.current && token === requestRef.current) {
        pendingRef.current = false
        setPending(false)
      }
    }
  }, [availability.ok, sessionId, sessionTitle, resolvedLocale, name, description, icon, steps])

  const handleCancel = useCallback(() => {
    requestRef.current += 1
    pendingRef.current = false
    setPending(false)
    void window.electronAPI?.sessionGeneralizeWorkflowCancel?.()
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
      icon: icon || '🔄',
      steps: usable.map((step, i) => ({
        id: `step-${now}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        title: step.title.trim().slice(0, MAX_NAME_LENGTH)
          || t('sessionReuse.workflow.stepFallback', { n: i + 1 }),
        prompt: step.prompt.trim().slice(0, MAX_STEP_PROMPT),
      })),
      createdAt: now,
      updatedAt: now,
      runCount: 0,
      // Only a stored conversation can be pointed back to. A live, never-saved
      // chat has no id, so it records nothing rather than a dead source.
      ...workflowProvenance(sessionId, sessionTitle, localDateStamp()),
    }
    const updated = [workflow, ...existing]
    usePrefsStore.getState().setPrefs({ workflows: updated })
    window.electronAPI?.prefsSet('workflows', updated)
    addToast('success', t('sessionReuse.workflow.saved', { name: workflow.name }))
    onClose()
  }, [name, description, icon, steps, sessionId, sessionTitle, addToast, t, onClose])

  const empty = draft.totalTurns === 0 && !applied
  const failureKey = failure
    ? generalizeErrorKey(failure.error, Boolean(failure.reason && failure.reason.trim()))
    : null
  const saveDisabled = empty || !name.trim() || steps.length === 0

  return (
    <SessionReuseDialogShell
      title={t('sessionReuse.workflow.title')}
      subtitle={mode === 'general'
        ? t('chat.reuse.generalize.subtitleGeneral')
        : t('sessionReuse.workflow.subtitle')}
      icon={<GitBranch size={16} />}
      onClose={handleClose}
      testId="workflow"
      footer={(
        <>
          <button
            onClick={handleClose}
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
            disabled={saveDisabled}
            data-reuse-save="workflow"
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: saveDisabled ? 'not-allowed' : 'pointer',
              background: saveDisabled
                ? 'var(--bg-hover)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', color: 'var(--text-bright)', fontWeight: 600,
              opacity: saveDisabled ? 0.5 : 1,
            }}
          >
            {t('common.save')}
          </button>
        </>
      )}
    >
      <div
        role="group"
        aria-label={t('chat.reuse.generalize.modeLabel')}
        style={{
          display: 'inline-flex', gap: 3, padding: 3, marginBottom: 12,
          background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
          borderRadius: 8,
        }}
      >
        <button
          onClick={selectExact}
          aria-pressed={mode === 'exact'}
          data-generalize-mode="exact"
          style={{ ...modeBtnStyle, ...(mode === 'exact' ? modeBtnActiveStyle : {}) }}
        >
          {t('chat.reuse.generalize.modeExact')}
        </button>
        <button
          onClick={() => { if (availability.ok) setMode('general') }}
          disabled={!availability.ok}
          aria-pressed={mode === 'general'}
          title={availability.ok ? undefined : t(unavailableKey)}
          data-generalize-mode="general"
          style={{
            ...modeBtnStyle,
            ...(mode === 'general' ? modeBtnActiveStyle : {}),
            ...(availability.ok ? {} : { opacity: 0.45, cursor: 'not-allowed' }),
          }}
        >
          {t('chat.reuse.generalize.modeGeneral')}
        </button>
      </div>

      {mode === 'general' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={runGeneralize}
              disabled={pending || !availability.ok}
              title={availability.ok ? undefined : t(unavailableKey)}
              data-generalize-action
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                cursor: pending || !availability.ok ? 'not-allowed' : 'pointer',
                background: pending || !availability.ok
                  ? 'var(--bg-hover)'
                  : 'rgba(99,102,241,0.18)',
                border: '1px solid rgba(99,102,241,0.35)',
                color: '#a5b4fc',
                opacity: pending || !availability.ok ? 0.6 : 1,
              }}
            >
              <Sparkles size={13} />
              {pending
                ? t('chat.reuse.generalize.actionPending')
                : t('chat.reuse.generalize.action')}
            </button>
            {pending && (
              <button
                onClick={handleCancel}
                data-generalize-cancel
                style={{
                  padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('chat.reuse.generalize.cancel')}
              </button>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {availability.ok
                ? t('chat.reuse.generalize.actionHint')
                : t(unavailableKey)}
            </span>
          </div>

          {failure && failureKey && (
            <div
              role="alert"
              data-generalize-error={failure.error}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '8px 10px', marginTop: 10,
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.28)',
                borderRadius: 8,
                fontSize: 11, color: '#fca5a5', lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  title={failure.reason}
                  style={
                    failure.error === 'not_procedural' && failure.reason
                      ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                      : undefined
                  }
                >
                  {t(failureKey, failure.reason
                    ? { reason: failure.reason }
                    : undefined)}
                </div>
                <button
                  onClick={runGeneralize}
                  disabled={pending || !availability.ok}
                  data-generalize-retry
                  style={{
                    marginTop: 5, padding: '3px 8px', borderRadius: 6, fontSize: 10,
                    cursor: pending || !availability.ok ? 'not-allowed' : 'pointer',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.28)',
                    color: '#fca5a5', fontWeight: 600,
                    opacity: pending || !availability.ok ? 0.5 : 1,
                  }}
                >
                  {t('chat.reuse.generalize.tryAgain')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {applied && (
        <>
          <div
            data-generalize-applied
            style={{
              fontSize: 11, fontWeight: 600, color: '#a5b4fc',
              marginBottom: 8, lineHeight: 1.4,
            }}
          >
            {t('chat.reuse.generalize.appliedNotice')}
          </div>

          <div data-generalize-band style={bandStyle}>
            {applied.draft.summary.trim() && (
              <div style={{ marginBottom: notes && (notes.assumptions.length > 0 || notes.inputs.length > 0) ? 8 : 4 }}>
                <div style={bandHeadingStyle}>{t('chat.reuse.generalize.summaryHeading')}</div>
                <div style={{ color: 'var(--text-primary)' }}>{applied.draft.summary.trim()}</div>
              </div>
            )}

            <div data-generalize-count style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t('chat.reuse.generalize.inferredCount', {
                inferred: notes?.inferredCount ?? 0,
                observed: notes?.observedCount ?? 0,
              })}
            </div>

            {notes && notes.assumptions.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={bandHeadingStyle}>{t('chat.reuse.generalize.assumptionsHeading')}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('chat.reuse.generalize.assumptionsNote')}
                </div>
                <ul style={bandListStyle}>
                  {notes.assumptions.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {notes && notes.inputs.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={bandHeadingStyle}>{t('chat.reuse.generalize.inputsHeading')}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('chat.reuse.generalize.inputsNote')}
                </div>
                <ul style={bandListStyle}>
                  {notes.inputs.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {applied.stepsDropped > 0 && (
              <div data-generalize-dropped style={{ marginTop: 8, color: 'rgba(253,224,71,0.92)' }}>
                {t('chat.reuse.generalize.stepsDropped', {
                  count: applied.stepsDropped,
                  max: MAX_STEPS,
                })}
              </div>
            )}

            {appliedMeta && appliedMetaKey && (
              <div
                data-generalize-meta={appliedMeta.key}
                style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}
              >
                {t(appliedMetaKey, appliedMeta.params)}
              </div>
            )}
          </div>
        </>
      )}

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

          {!applied && draft.truncated && (
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
                  {step.basis === 'inferred' && (
                    <span
                      data-step-basis="inferred"
                      title={t('chat.reuse.generalize.basisInferredTip')}
                      style={{
                        flexShrink: 0, padding: '1px 6px', borderRadius: 999,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
                        background: 'rgba(234,179,8,0.14)',
                        border: '1px solid rgba(234,179,8,0.30)',
                        color: 'rgba(253,224,71,0.92)',
                        cursor: 'help',
                      }}
                    >
                      {t('chat.reuse.generalize.basisInferred')}
                    </span>
                  )}
                  {step.basis === 'observed' && (
                    <span
                      data-step-basis="observed"
                      style={{
                        flexShrink: 0, padding: '1px 6px', borderRadius: 999,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
                        background: 'rgba(148,163,184,0.12)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t('chat.reuse.generalize.basisObserved')}
                    </span>
                  )}
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
