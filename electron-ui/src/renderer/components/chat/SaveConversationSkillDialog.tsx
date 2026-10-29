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
  type SkillDraft,
  type SkillProvenance,
} from '../../lib/sessionReuse'
import { canGeneralize, generalizeErrorKey, metaNote } from '../../lib/generalizeDraft'
import {
  SKILL_DIALOG_BODY_MAX,
  SKILL_DIALOG_DESC_MAX,
  SKILL_DIALOG_NAME_MAX,
  applySkillDraft,
  skillDraftNotes,
} from '../../lib/generalizeSkill'
import {
  INSTALL_REPLACE_WARNING_KEY,
  resolveInstallOutcome,
} from '../skills/installOutcome'
import SessionReuseDialogShell from './SessionReuseDialogShell'

interface Props {
  /** The stored conversation to generalise; null when it was never saved. */
  sessionId: string | null
  sessionTitle: string | null
  /**
   * Which conversation the dialog is looking at. `chat` is the one open beside
   * the header; `stored` is a saved conversation that is not open, picked from
   * the Skills section. Only the former has live messages to replay.
   */
  origin?: 'chat' | 'stored'
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

/** Filled from a `skill_exists` refusal; the dialog stays open while it shows. */
interface InstallConflict {
  dirPath?: string
  name?: string
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

export default function SaveConversationSkillDialog({
  sessionId,
  sessionTitle,
  origin = 'chat',
  onClose,
}: Props) {
  const { t, resolvedLocale } = useI18n()
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const addToast = useUiStore(s => s.addToast)
  const fromStored = origin === 'stored'
  // Both origins install from a stored conversation, so both can record where
  // the draft came from. An unsaved chat has no id and therefore no source: the
  // dialog must not invent one just to fill the line in SKILL.md.
  const provenance = useMemo<SkillProvenance | undefined>(
    () => (sessionId?.trim() ? { sessionId, title: sessionTitle } : undefined),
    [sessionId, sessionTitle],
  )
  // A stored conversation has no live messages here — the open chat may be an
  // entirely different conversation — so borrowing its text would be a lie.
  // The fields start empty and stay so until the model's draft is applied.
  const draft = useMemo<SkillDraft>(
    () => (fromStored
      ? { name: '', description: '', body: '', totalTurns: 0, truncated: false }
      : buildSkillDraft(messages, sessionTitle, t)),
    [fromStored, messages, sessionTitle, t],
  )
  // The chat origin owns the user's switch. A stored conversation is always
  // generalised: the literal replay needs messages this origin does not have.
  const [modeChoice, setModeChoice] = useState<DraftMode>('exact')
  const mode: DraftMode = fromStored ? 'general' : modeChoice
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [body, setBody] = useState(draft.body)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [conflict, setConflict] = useState<InstallConflict | null>(null)
  const [pending, setPending] = useState(false)
  const [applied, setApplied] = useState<AppliedSkill | null>(null)
  const [failure, setFailure] = useState<GeneralFailure | null>(null)

  // One token per generalisation. A late answer whose token no longer matches
  // was cancelled, closed or superseded, and must not touch state.
  const requestRef = useRef(0)
  const aliveRef = useRef(true)
  const pendingRef = useRef(false)

  const availability = useMemo(
    // Streaming belongs to the open chat. A saved conversation picked from the
    // Skills section is not the one currently arriving, so it is never blocked
    // by the chat panel's state.
    () => canGeneralize(sessionId, fromStored ? false : isStreaming),
    [sessionId, fromStored, isStreaming],
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
  const content = assembleSkillContent(installSlug, description, body, provenance)
  // Only the chat origin can claim the conversation has no turns: a stored
  // conversation's transcript is read by the model, not by this dialog. The
  // empty literal draft there must not be mistaken for an empty conversation.
  const empty = !fromStored && draft.totalTurns === 0 && !applied
  const canInstall = !empty && !!name.trim() && !!description.trim() && !!body.trim() && !installing

  // Choosing the literal mode again puts the deterministic draft back into the
  // fields, and stops a generalisation whose answer would otherwise land under
  // an "As it happened" label. Manual edits survive when nothing was applied.
  const selectExact = useCallback(() => {
    // A stored conversation has nothing to replay; the disabled button already
    // says so, and this guard keeps a programmatic call from blanking fields.
    if (fromStored) return
    if (pendingRef.current) {
      requestRef.current += 1
      pendingRef.current = false
      setPending(false)
      void window.electronAPI?.sessionGeneralizeSkillCancel?.()
    }
    setModeChoice('exact')
    setFailure(null)
    if (applied) {
      setName(draft.name)
      setDescription(draft.description)
      setBody(draft.body)
      setApplied(null)
    }
  }, [fromStored, applied, draft])

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

  // `replace` is only true from the Replace button in the conflict band below;
  // the footer Install button and a retry both send false.
  const submit = useCallback(async (replace: boolean) => {
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
    setErrorDetail('')
    try {
      const result = await window.electronAPI.skillsInstall({
        name: installSlug,
        content: assembleSkillContent(installSlug, description, body, provenance),
        replace,
      })
      const outcome = resolveInstallOutcome(result, { replaceRequested: replace })
      if (outcome.kind === 'installed') {
        setConflict(null)
        addToast(
          'success',
          t(outcome.replaced ? 'sessionReuse.skill.replaced' : 'sessionReuse.skill.saved', {
            name: installSlug,
          }),
        )
        onClose()
      } else if (outcome.kind === 'exists') {
        // Keep every field and the dialog: the generated folder is taken, and
        // the user still needs to see exactly which skill is in the way.
        setConflict({
          ...(outcome.dirPath ? { dirPath: outcome.dirPath } : {}),
          ...(outcome.name ? { name: outcome.name } : {}),
        })
      } else {
        setConflict(null)
        setError(t(outcome.messageKey))
        // Main's sentence is a secondary detail for a real failure code, not
        // the headline; `exists` never reaches this branch.
        if (outcome.kind === 'failed' && outcome.error) setErrorDetail(outcome.error)
      }
    } catch (err) {
      setConflict(null)
      setError(t('sessionReuse.skill.failed'))
      setErrorDetail(String(err))
    } finally {
      setInstalling(false)
    }
  }, [name, installSlug, description, body, provenance, addToast, t, onClose])

  const handleInstall = useCallback(() => {
    void submit(false)
  }, [submit])

  const handleReplace = useCallback(() => {
    if (!conflict) return
    void submit(true)
  }, [conflict, submit])

  const handleOpenExisting = useCallback(() => {
    if (!conflict?.dirPath) return
    useUiStore.getState().openSkillDetail(conflict.dirPath)
    onClose()
  }, [conflict, onClose])

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
          disabled={fromStored}
          aria-pressed={mode === 'exact'}
          title={fromStored ? t('chat.reuse.generalize.unavailableExactStored') : undefined}
          data-generalize-mode="exact"
          style={{
            ...modeBtnStyle,
            ...(mode === 'exact' ? modeBtnActiveStyle : {}),
            ...(fromStored ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
          }}
        >
          {t('chat.reuse.generalize.modeExact')}
        </button>
        <button
          onClick={() => { if (availability.ok) setModeChoice('general') }}
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

          {/* Until a draft arrives there is nothing truthful to put in the
              fields; say what pressing Generalize will do rather than leaving
              an unexplained blank editor. */}
          {fromStored && !applied && (
            <div
              data-generalize-stored-empty
              style={{
                padding: '8px 10px', marginBottom: 12,
                background: 'var(--bg-hover)',
                border: '1px solid var(--bg-active)',
                borderRadius: 8,
                fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
              }}
            >
              {t('chat.reuse.generalize.storedEmptyHint')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={labelStyle}>{t('sessionReuse.skill.name')}</label>
              <input
                autoFocus
                value={name}
                onChange={e => {
                  setName(e.target.value.slice(0, SKILL_DIALOG_NAME_MAX))
                  // A new name is a new folder; the old conflict no longer
                  // describes what Replace would overwrite.
                  if (conflict) setConflict(null)
                }}
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
            {/* No name yet means no real destination; the hash fallback is an
                implementation detail, not a path worth advertising. */}
            {name.trim() && (
              <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }} data-reuse-install-path>
                {t('sessionReuse.skill.installPath', { name: installSlug })}
              </span>
            )}
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

          {conflict && (
            <div
              role="alert"
              data-install-conflict
              style={{
                marginTop: 10, padding: '9px 11px', borderRadius: 8,
                background: 'rgba(234,179,8,0.08)',
                border: '1px solid rgba(234,179,8,0.28)',
                fontSize: 11, color: 'rgba(253,224,71,0.92)', lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600 }}>{t('skill.existsTitle')}</div>
              {/* Same two lines as the creator: the folder in the way, and the
                  promise that nothing was written this time. */}
              {conflict.dirPath && (
                <div>{t('skill.existsBody', { path: conflict.dirPath })}</div>
              )}
              {conflict.name && (
                <div>{t('skill.existsName', { name: conflict.name })}</div>
              )}
              <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                {t(INSTALL_REPLACE_WARNING_KEY)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                {conflict.dirPath && (
                  <button
                    onClick={handleOpenExisting}
                    data-install-open-existing
                    style={{
                      padding: '4px 10px', borderRadius: 7, fontSize: 11,
                      border: '1px solid rgba(234,179,8,0.35)', background: 'transparent',
                      color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t('skill.existsOpen')}
                  </button>
                )}
                <button
                  onClick={handleReplace}
                  disabled={installing}
                  data-install-replace
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11,
                    border: '1px solid rgba(234,179,8,0.45)',
                    background: 'rgba(234,179,8,0.16)',
                    color: 'rgba(253,224,71,0.95)', fontWeight: 700,
                    cursor: installing ? 'not-allowed' : 'pointer',
                    opacity: installing ? 0.5 : 1,
                  }}
                >
                  {installing ? t('skill.replacing') : t('skill.existsReplace')}
                </button>
              </div>
            </div>
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
              <div style={{ minWidth: 0 }}>
                <div>{error}</div>
                {errorDetail && (
                  <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {errorDetail}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </SessionReuseDialogShell>
  )
}
