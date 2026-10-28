// Create / edit dialog for an automation.
//
// Extracted from SettingsAutomations so the workflow page can open it bound to
// the workflow being viewed. All scheduling and validation live in the main
// process (`src/main/automation/`); this dialog only edits the fields an
// `AutomationInputData` accepts and reports save errors verbatim.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { usePrefsStore } from '../../store'
import type { Persona } from '../../types/app.types'
import Toggle from '../ui/Toggle'
import { INPUT_STYLE } from '../settings/settingsConstants'
import { pushEscapeHandler } from '../ui/escapeStack'
import { clockText, describeCron } from './scheduleText'
import { SECONDARY, WARNING, primaryButtonStyle, smallButtonStyle } from './automationStyles'
import type {
  AutomationInputData,
  AutomationJobData,
  AutomationLimitsData,
  AutomationTriggerData,
} from '../../../preload'

export interface WorkflowOption {
  id: string
  name: string
  icon?: string
  personaId?: string
}

/**
 * Mirrors `ASSISTANT_PERSONA_ID` in src/main/automation/persona-plan.ts: the
 * reserved choice meaning "plain assistant". It is distinct from the empty
 * selection, which follows the workflow's expert.
 */
export const ASSISTANT_PERSONA_ID = '__assistant__'

// Stable empty array: an absent pref must not create a new reference per render.
const EMPTY_PERSONAS: Persona[] = []

type ScheduleKind = 'daily' | 'weekly' | 'interval' | 'cron'

export interface AutomationDialogProps {
  /** null = create a new automation. */
  job: AutomationJobData | null
  workflows: WorkflowOption[]
  limits: AutomationLimitsData | null
  /**
   * Create mode only: open pre-filled with this workflow as the action.
   * Name and trigger keep their defaults; the user can still change anything.
   */
  initialWorkflowId?: string
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
}

export default function AutomationDialog({
  job,
  workflows,
  limits,
  initialWorkflowId,
  onClose,
}: AutomationDialogProps) {
  const { t } = useI18n()
  const editing = job !== null
  const personas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)

  // Only honour the preset when the workflow is actually in the list, so the
  // select and the saved id cannot disagree.
  const presetWorkflowId = initialWorkflowId && workflows.some(w => w.id === initialWorkflowId)
    ? initialWorkflowId
    : undefined

  const initialCron = job && job.trigger.kind === 'cron' ? describeCron(job.trigger.expr) : null
  const cronIsCustom = !!job && job.trigger.kind === 'cron' && !initialCron

  const defaultActionKind: 'workflow' | 'prompt' =
    job?.action.kind ?? (presetWorkflowId || workflows.length > 0 ? 'workflow' : 'prompt')

  const [name, setName] = useState(job?.name ?? '')
  const [enabled, setEnabled] = useState(job?.enabled ?? true)
  const [actionKind, setActionKind] = useState<'workflow' | 'prompt'>(defaultActionKind)
  const [workflowId, setWorkflowId] = useState(
    job?.action.kind === 'workflow' ? job.action.workflowId : (presetWorkflowId ?? workflows[0]?.id ?? ''),
  )
  const [prompt, setPrompt] = useState(job?.action.kind === 'prompt' ? job.action.prompt : '')
  // '' follows the workflow; ASSISTANT_PERSONA_ID is an explicit plain assistant;
  // anything else is a persona id.
  const [personaChoice, setPersonaChoice] = useState<string>(() => {
    const override = job?.personaId?.trim()
    if (override) return override
    // A prompt job has no workflow to inherit from, so it starts as the plain
    // assistant — the only run it could have had before this field existed.
    return defaultActionKind === 'prompt' ? ASSISTANT_PERSONA_ID : ''
  })
  // Kept as text so the empty state means "no limit" rather than 0. A number
  // state would make clearing the field indistinguishable from a $0 limit,
  // which would block every scheduled run.
  const [spendLimitText, setSpendLimitText] = useState(
    job?.dailyCostLimitUsd !== undefined ? String(job.dailyCostLimitUsd) : '',
  )
  // Off unless the job opted in: existing jobs keep announcing their successes.
  const [quietOnSuccess, setQuietOnSuccess] = useState(job?.quietOnSuccess === true)
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(() => {
    if (!job) return 'daily'
    if (job.trigger.kind === 'interval') return 'interval'
    const parsed = describeCron(job.trigger.expr)
    if (!parsed) return 'cron'
    return parsed.kind
  })
  const [hour, setHour] = useState(initialCron?.hour ?? 9)
  const [minute, setMinute] = useState(initialCron?.minute ?? 0)
  const [weekday, setWeekday] = useState(initialCron?.weekday ?? 1)
  const [intervalMinutes, setIntervalMinutes] = useState(
    job?.trigger.kind === 'interval' ? job.trigger.minutes : 60,
  )
  const [cronExpr, setCronExpr] = useState(
    cronIsCustom && job?.trigger.kind === 'cron' ? job.trigger.expr : '0 9 * * *',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => pushEscapeHandler(onClose), [onClose])

  const errorText = useCallback((code: string): string => {
    const key = `automation.errors.${code}`
    const translated = t(key)
    return translated === key ? code : translated
  }, [t])

  const trigger = useMemo<AutomationTriggerData>(() => {
    if (scheduleKind === 'interval') return { kind: 'interval', minutes: Number(intervalMinutes) || 0 }
    if (scheduleKind === 'cron') return { kind: 'cron', expr: cronExpr.trim() }
    if (scheduleKind === 'weekly') return { kind: 'cron', expr: `${minute} ${hour} * * ${weekday}` }
    return { kind: 'cron', expr: `${minute} ${hour} * * *` }
  }, [scheduleKind, intervalMinutes, cronExpr, minute, hour, weekday])

  const action = useMemo(() => {
    if (actionKind === 'workflow') return { kind: 'workflow', workflowId } as const
    return { kind: 'prompt', prompt: prompt.trim() } as const
  }, [actionKind, workflowId, prompt])

  // Empty means no limit. The upper bound is the main process's call; here we
  // only refuse a value that is not a positive amount at all, so Save cannot
  // post NaN into a rail that would then never fire.
  const spendLimitValue = spendLimitText.trim() === '' ? undefined : Number(spendLimitText)
  const spendLimitValid = spendLimitValue === undefined ||
    (Number.isFinite(spendLimitValue) && spendLimitValue > 0)

  const canSave = name.trim().length > 0 &&
    (actionKind === 'workflow' ? !!workflowId : prompt.trim().length > 0) &&
    spendLimitValid &&
    !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    // '' is not an id: omit it so the main process stores "follow the workflow".
    const personaId = personaChoice === '' ? undefined : personaChoice
    const input: AutomationInputData = {
      name: name.trim(), enabled, trigger, action,
      ...(personaId ? { personaId } : {}),
      // Omitting quiet mode when it is off is what turns it off on an edit;
      // absence is the default (announce success), never `false`.
      ...(quietOnSuccess ? { quietOnSuccess: true } : {}),
      // Omitting a cleared limit is what removes it; sending 0 would block
      // every scheduled run.
      ...(spendLimitValue !== undefined ? { dailyCostLimitUsd: spendLimitValue } : {}),
    }
    try {
      const result = job
        ? await window.electronAPI.automationUpdate(job.id, input)
        : await window.electronAPI.automationCreate(input)
      if (result.ok) onClose()
      else setError(errorText(result.error))
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const timeValue = clockText(hour, minute)

  const selectedWorkflow = workflows.find(w => w.id === workflowId)
  const workflowPersona = selectedWorkflow?.personaId
    ? personas.find(p => p.id === selectedWorkflow.personaId)
    : undefined
  const followWorkflowLabel = t('automation.expert.followWorkflow', {
    name: workflowPersona
      ? `${workflowPersona.emoji} ${workflowPersona.name}`.trim()
      : t('automation.expert.noBinding'),
  })
  // A saved override can outlive its persona. Keep it selectable so the field
  // shows what is stored instead of silently displaying a different choice.
  const orphanChoice = personaChoice !== '' &&
    personaChoice !== ASSISTANT_PERSONA_ID &&
    !personas.some(p => p.id === personaChoice)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'var(--glass-overlay)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--popup-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          width: 460, maxHeight: '82vh', overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
          {editing ? t('automation.dialog.editTitle') : t('automation.dialog.createTitle')}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.name')}</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('automation.field.namePlaceholder')}
            style={INPUT_STYLE}
            maxLength={80}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.action')}</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['workflow', 'prompt'] as const).map(kind => (
              <button
                key={kind}
                onClick={() => {
                  setActionKind(kind)
                  // Each action has its own default: a prompt job cannot follow
                  // a workflow, and a workflow should inherit its expert after a
                  // mode switch rather than silently keep an implicit override.
                  if (kind === 'prompt') {
                    setPersonaChoice(prev => prev === '' ? ASSISTANT_PERSONA_ID : prev)
                  } else {
                    setPersonaChoice(prev => prev === ASSISTANT_PERSONA_ID ? '' : prev)
                  }
                }}
                style={{
                  ...smallButtonStyle,
                  borderColor: actionKind === kind ? 'rgba(99,102,241,0.55)' : 'var(--border)',
                  color: actionKind === kind ? 'var(--accent-text)' : SECONDARY,
                  background: actionKind === kind ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {kind === 'workflow' ? t('automation.action.workflow') : t('automation.action.prompt')}
              </button>
            ))}
          </div>

          {actionKind === 'workflow' ? (
            workflows.length === 0 ? (
              <div style={{ fontSize: 11, color: WARNING, lineHeight: 1.5 }}>{t('automation.action.noWorkflows')}</div>
            ) : (
              <select
                value={workflowId}
                onChange={e => setWorkflowId(e.target.value)}
                style={INPUT_STYLE}
              >
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>
                    {`${w.icon ?? ''} ${w.name}`.trim()}
                  </option>
                ))}
              </select>
            )
          ) : (
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('automation.action.promptPlaceholder')}
              rows={4}
              maxLength={4000}
              style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.expert')}</label>
          <select
            value={personaChoice}
            onChange={e => setPersonaChoice(e.target.value)}
            style={INPUT_STYLE}
          >
            {/* Offered only for a workflow: a prompt job has no binding to
                follow, so showing it there would promise what cannot happen. */}
            {actionKind === 'workflow' && (
              <option value="">{followWorkflowLabel}</option>
            )}
            <option value={ASSISTANT_PERSONA_ID}>{t('automation.expert.assistant')}</option>
            {personas.map(p => (
              <option key={p.id} value={p.id}>
                {`${p.emoji} ${p.name}`.trim()}
              </option>
            ))}
            {orphanChoice && (
              <option value={personaChoice}>{t('automation.expert.missingOption')}</option>
            )}
          </select>
          {actionKind === 'workflow' && (
            // The override is durable: re-binding the workflow later must not
            // quietly change who runs this job.
            <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
              {t('automation.expert.overrideHint')}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.spendLimit')}</label>
          {/* Text rather than a number input: a number input normalizes a
              half-typed value to '' on some browsers, and an empty field here
              means "clear the limit" — Save must not do that by accident. */}
          <input
            type="text"
            inputMode="decimal"
            value={spendLimitText}
            onChange={e => setSpendLimitText(e.target.value)}
            placeholder={t('automation.field.spendLimitPlaceholder')}
            style={{ ...INPUT_STYLE, width: 160 }}
          />
          {/* The blind spot and the manual bypass are named once, here, where
              the user decides the number. */}
          <div style={{ fontSize: 11, color: SECONDARY, marginTop: 4, lineHeight: 1.5 }}>
            {t('automation.spend.limitHint')}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('automation.field.schedule')}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['daily', 'weekly', 'interval'] as const).map(kind => (
              <button
                key={kind}
                onClick={() => setScheduleKind(kind)}
                style={{
                  ...smallButtonStyle,
                  borderColor: scheduleKind === kind ? 'rgba(99,102,241,0.55)' : 'var(--border)',
                  color: scheduleKind === kind ? 'var(--accent-text)' : SECONDARY,
                  background: scheduleKind === kind ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {t(`automation.scheduleOption.${kind}`)}
              </button>
            ))}
            {/* Only offered for an existing job whose cron the picker cannot
                represent — editing must not silently rewrite it. */}
            {cronIsCustom && (
              <button
                onClick={() => setScheduleKind('cron')}
                style={{
                  ...smallButtonStyle,
                  borderColor: scheduleKind === 'cron' ? 'rgba(99,102,241,0.55)' : 'var(--border)',
                  color: scheduleKind === 'cron' ? 'var(--accent-text)' : SECONDARY,
                  background: scheduleKind === 'cron' ? 'rgba(99,102,241,0.12)' : 'transparent',
                }}
              >
                {t('automation.scheduleOption.cron')}
              </button>
            )}
          </div>

          {scheduleKind === 'interval' ? (
            <div>
              <label style={labelStyle}>{t('automation.field.interval')}</label>
              <input
                type="number"
                min={limits?.minIntervalMinutes ?? 5}
                max={10080}
                value={intervalMinutes}
                onChange={e => setIntervalMinutes(Number(e.target.value))}
                style={{ ...INPUT_STYLE, width: 140 }}
              />
            </div>
          ) : scheduleKind === 'cron' ? (
            <div>
              <label style={labelStyle}>{t('automation.field.cron')}</label>
              <input
                value={cronExpr}
                onChange={e => setCronExpr(e.target.value)}
                placeholder="0 9 * * *"
                style={{ ...INPUT_STYLE, fontFamily: 'monospace' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              {scheduleKind === 'weekly' && (
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('automation.field.day')}</label>
                  <select
                    value={weekday}
                    onChange={e => setWeekday(Number(e.target.value))}
                    style={INPUT_STYLE}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map(d => (
                      <option key={d} value={d}>{t(`automation.weekdays.${d}`)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{t('automation.field.time')}</label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={e => {
                    const [h, m] = e.target.value.split(':')
                    if (h !== undefined) setHour(Number(h))
                    if (m !== undefined) setMinute(Number(m))
                  }}
                  style={INPUT_STYLE}
                />
              </div>
            </div>
          )}

          {/* Lives with the schedule because it is about when the app calls
              the user, not about what the job does. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
            <div style={{ paddingTop: 1 }}>
              <Toggle
                value={quietOnSuccess}
                onChange={setQuietOnSuccess}
                aria-label={t('automation.field.quietOnSuccess')}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('automation.field.quietOnSuccess')}
              </div>
              <div style={{ fontSize: 11, color: SECONDARY, marginTop: 2, lineHeight: 1.5 }}>
                {t('automation.quietOnSuccess.hint')}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Toggle value={enabled} onChange={setEnabled} aria-label={t('automation.field.enabled')} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('automation.field.enabled')}</span>
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '6px 9px', borderRadius: 6, fontSize: 11,
            background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)', color: 'var(--danger-text)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={smallButtonStyle} onClick={onClose} disabled={saving}>
            {t('automation.cancel')}
          </button>
          <button
            style={{ ...primaryButtonStyle, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
            onClick={save}
            disabled={!canSave}
          >
            {saving ? t('automation.saving') : t('automation.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
