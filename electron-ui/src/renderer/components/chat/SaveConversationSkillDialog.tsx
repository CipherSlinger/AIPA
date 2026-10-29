// Preview and edit a SKILL.md derived from the current conversation.
// Installs through skillsInstall — the same channel the skill creator page
// uses — so permissions, storage location and listing behave identically.
//
// Two ways to build the draft:
//   - "As it happened" replays the user's literal requests (the default, and
//     no model call).
//   - "Generalize with AIPA" asks the model to turn the stored conversation
//     into a reusable skill. That costs a model call, so it only runs when the
//     button is pressed; the result is applied to the editable fields together
//     with the model's inferred notes. Nothing is installed until Install, and
//     a failure changes nothing.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Puzzle, Sparkles } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatStore, useUiStore } from '../../store'
import type {
  SessionGeneralizeError,
  SessionSkillDraftData,
  SessionWorkflowDraftMetaData,
} from '../../../preload'
import {
  MAX_SKILL_STEPS,
  assembleSkillContent,
  buildSkillDraft,
  skillInstallSlug,
} from '../../lib/sessionReuse'
import { canGeneralize, generalizeErrorKey, metaNote } from '../../lib/generalizeDraft'
import {
  SKILL_DIALOG_BODY_MAX,
  SKILL_DIALOG_DESC_MAX,
  SKILL_DIALOG_NAME_MAX,
  applySkillDraft,
  skillDraftNotes,
} from '../../lib/generalizeSkill'
import SessionReuseDialogShell from './SessionReuseDialogShell'

interface Props {
  /** The stored conversation to generalise; null when it was never saved. */
  sessionId: string | null
  sessionTitle: string | null
  onClose: () => void
}

type DraftMode = 'exact' | 'general'

interface AppliedSkill {
  draft: SessionSkillDraftData
  meta: SessionWorkflowDraftMetaData
  bodyTruncated: boolean
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

const monoStyle: React.CSSProperties = {
  ...fieldStyle,
  padding: '10px 12px',
  fontSize: 11,
  lineHeight: 1.55,
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
  background: 'var(--bg-primary)',
  color: '#a5b4fc',
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

export default function SaveConversationSkillDialog({ sessionId, sessionTitle, onClose }: Props) {
  const { t, resolvedLocale } = useI18n()
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const addToast = useUiStore(s => s.addToast)
  const draft = useMemo(
    () => buildSkillDraft(messages, sessionTitle, t),
    [messages, sessionTitle, t],
  )
  const [mode, setMode] = useState<DraftMode>('exact')
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [body, setBody] = useState(draft.body)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [applied, setApplied] = useState<AppliedSkill | null>(null)
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

  const notes = useMemo(() => (applied ? skillDraftNotes(applied.draft) : null), [applied])
  const appliedMeta = useMemo(() => (applied ? metaNote(applied.meta) : null), [applied])

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
        void window.electronAPI?.sessionGeneralizeSkillCancel?.()
      }
    }
  }, [])

  // One normalizer for the preview, the installed directory and the SKILL.md
  // `name:` — the dialog must not advertise a path the installer will not create.
  const installSlug = skillInstallSlug(name)
  const content = assembleSkillContent(installSlug, description, body)
  const empty = draft.totalTurns === 0 && !applied
  const canInstall = !empty && !!name.trim() && !!description.trim() && !!body.trim() && !installing

  // Choosing the literal mode again puts the deterministic draft back into the
  // fields, and stops a generalisation whose answer would otherwise land under
  // an "As it happened" label. Manual edits survive when nothing was applied.
  const selectExact = useCallback(() => {
    if (pendingRef.current) {
      requestRef.current += 1
      pendingRef.current = false
      setPending(false)
      void window.electronAPI?.sessionGeneralizeSkillCancel?.()
    }
    setMode('exact')
    setFailure(null)
    if (applied) {
      setName(draft.name)
      setDescription(draft.description)
      setBody(draft.body)
      setApplied(null)
    }
  }, [applied, draft])

  const handleClose = useCallback(() => {
    requestRef.current += 1
    if (pendingRef.current) {
      pendingRef.current = false
      void window.electronAPI?.sessionGeneralizeSkillCancel?.()
    }
    onClose()
  }, [onClose])

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
      const result = await api.sessionGeneralizeSkill({
        sessionId,
        locale: resolvedLocale,
        title: sessionTitle,
      })
      if (!aliveRef.current || token !== requestRef.current) return
      if (result.ok) {
        const next = applySkillDraft({ name, description, body }, result.draft)
        setName(next.name)
        setDescription(next.description)
        setBody(next.body)
        setApplied({
          draft: result.draft,
          meta: result.meta,
          bodyTruncated: next.bodyTruncated,
        })
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
  }, [availability.ok, sessionId, sessionTitle, resolvedLocale, name, description, body])

  const handleCancel = useCallback(() => {
    requestRef.current += 1
    pendingRef.current = false
    setPending(false)
    void window.electronAPI?.sessionGeneralizeSkillCancel?.()
  }, [])

  const handleInstall = useCallback(async () => {
    if (!name.trim()) {
      addToast('warning', t('sessionReuse.skill.missingName'))
      return
    }
    if (!description.trim()) {
      addToast('warning', t('sessionReuse.skill.missingDescription'))
      return
    }
    if (!body.trim()) {
      addToast('warning', t('sessionReuse.skill.missingBody'))
      return
    }
    setInstalling(true)
    setError('')
    try {
      const result = await window.electronAPI.skillsInstall({
        name: installSlug,
        content: assembleSkillContent(installSlug, description, body),
      })
      if (result?.success) {
        addToast('success', t('sessionReuse.skill.installed', { name: installSlug }))
        onClose()
      } else {
        setError(result?.error || t('sessionReuse.skill.failed'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setInstalling(false)
    }
  }, [name, installSlug, description, body, addToast, t, onClose])

  const failureKey = failure
    ? generalizeErrorKey(failure.error, Boolean(failure.reason && failure.reason.trim()))
    : null

  return (
    <SessionReuseDialogShell
      title={t('sessionReuse.skill.title')}
      subtitle={mode === 'general'
        ? t('chat.reuse.generalize.skillSubtitleGeneral')
        : t('sessionReuse.skill.subtitle')}
      icon={<Puzzle size={16} />}
      width={560}
      onClose={handleClose}
      testId="skill"
      footer={(
        <>
          <button
            onClick={handleClose}
            disabled={installing}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: installing ? 'not-allowed' : 'pointer',
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
              color: 'var(--text-secondary)', fontWeight: 500,
              opacity: installing ? 0.5 : 1,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleInstall}
            disabled={!canInstall}
            data-reuse-save="skill"
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: canInstall ? 'pointer' : 'not-allowed',
              background: canInstall
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-hover)',
              border: 'none', color: 'var(--text-bright)', fontWeight: 600,
              opacity: canInstall ? 1 : 0.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {installing && (
              <span style={{
                width: 11, height: 11, borderRadius: '50%',
                border: '2px solid var(--text-faint)',
                borderTopColor: 'var(--text-primary)',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }} />
            )}
            {installing ? t('sessionReuse.skill.installing') : t('sessionReuse.skill.install')}
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
                ? t('chat.reuse.generalize.skillActionHint')
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
            {t('chat.reuse.generalize.skillAppliedNotice')}
          </div>

          <div data-generalize-band style={bandStyle}>
            {notes && notes.assumptions.length > 0 && (
              <div>
                <div style={bandHeadingStyle}>
                  {t('chat.reuse.generalize.assumptionsHeading')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('chat.reuse.generalize.skillAssumptionsNote')}
                </div>
                <ul style={bandListStyle}>
                  {notes.assumptions.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {notes && notes.inputs.length > 0 && (
              <div style={{ marginTop: notes.assumptions.length > 0 ? 8 : 0 }}>
                <div style={bandHeadingStyle}>
                  {t('chat.reuse.generalize.skillInputsHeading')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('chat.reuse.generalize.skillInputsNote')}
                </div>
                <ul style={bandListStyle}>
                  {notes.inputs.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {applied.bodyTruncated && (
              <div
                data-generalize-body-truncated
                style={{
                  marginTop: 8,
                  color: 'rgba(253,224,71,0.92)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('chat.reuse.generalize.skillBodyTruncated', { max: SKILL_DIALOG_BODY_MAX })}
              </div>
            )}

            {appliedMeta?.key === 'truncated' && (
              <div
                data-generalize-meta="truncated"
                style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}
              >
                {t('chat.reuse.generalize.metaTruncated', appliedMeta.params)}
              </div>
            )}
          </div>
        </>
      )}

      {empty && mode === 'exact' ? (
        <div style={{ padding: '28px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('sessionReuse.skill.empty')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            {t('sessionReuse.skill.emptyHint')}
          </div>
        </div>
      ) : (
        <>
          {!applied && draft.truncated && (
            <div
              data-reuse-truncated="skill"
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
                {t('sessionReuse.skill.truncated', {
                  shown: Math.min(draft.totalTurns, MAX_SKILL_STEPS),
                  total: draft.totalTurns,
                  omitted: draft.totalTurns - Math.min(draft.totalTurns, MAX_SKILL_STEPS),
                })}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('sessionReuse.skill.name')}</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value.slice(0, SKILL_DIALOG_NAME_MAX))}
                maxLength={SKILL_DIALOG_NAME_MAX}
                placeholder={t('sessionReuse.skill.namePlaceholder')}
                data-reuse-field="skill-name"
                style={fieldStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('sessionReuse.skill.description')}</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, SKILL_DIALOG_DESC_MAX))}
                maxLength={SKILL_DIALOG_DESC_MAX}
                placeholder={t('sessionReuse.skill.descPlaceholder')}
                style={fieldStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--bg-active)' }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6,
          }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['edit', 'preview'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTab(m)}
                  data-reuse-tab={m}
                  style={{
                    padding: '3px 10px', borderRadius: 7, fontSize: 10,
                    fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
                    border: tab === m
                      ? '1px solid rgba(99,102,241,0.4)'
                      : '1px solid var(--border)',
                    background: tab === m ? 'rgba(99,102,241,0.14)' : 'transparent',
                    color: tab === m ? '#818cf8' : 'var(--text-muted)',
                  }}
                >
                  {t(m === 'edit' ? 'sessionReuse.skill.editTab' : 'sessionReuse.skill.previewTab')}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }} data-reuse-install-path>
              {t('sessionReuse.skill.installPath', { name: installSlug })}
            </span>
          </div>

          {tab === 'edit' ? (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={SKILL_DIALOG_BODY_MAX}
              rows={14}
              aria-label={t('sessionReuse.skill.body')}
              placeholder={t('sessionReuse.skill.bodyPlaceholder')}
              style={{ ...monoStyle, resize: 'vertical', minHeight: 220, maxHeight: 360 }}
            />
          ) : (
            <pre
              data-reuse-preview="skill"
              style={{
                ...monoStyle,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflow: 'auto',
                maxHeight: 320,
                minHeight: 220,
                color: 'var(--text-secondary)',
              }}
            >
              {content}
            </pre>
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              marginTop: 10, padding: '6px 10px', borderRadius: 6,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5', fontSize: 11, lineHeight: 1.45,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </>
      )}
    </SessionReuseDialogShell>
  )
}
