// Settings → Automations.
//
// The list, the create/edit dialog and the "how it works" notes. All timing and
// execution live in the main process (`src/main/automation/`); this page only
// reflects state and sends CRUD requests, then waits for `automation:changed`
// instead of guessing what the scheduler did.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlarmClock, AlertTriangle, Clock, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { usePrefsStore } from '../../store'
import SettingsGroup from './SettingsGroup'
import Toggle from '../ui/Toggle'
import { INPUT_STYLE } from './settingsConstants'
import { pushEscapeHandler } from '../ui/escapeStack'
import type {
  AutomationInputData,
  AutomationJobData,
  AutomationLimitsData,
  AutomationTriggerData,
} from '../../../preload'
import type { Persona } from '../../types/app.types'

interface WorkflowOption {
  id: string
  name: string
  icon?: string
  personaId?: string
}

const SECONDARY = 'var(--text-muted)'
const WARNING = 'var(--warning-text)'

const smallButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '3px 8px',
  fontSize: 11,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

// Same fill as the settings Save button, so the page has one primary action
// colour rather than two shades that read as washed out in the light theme.
const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function clockText(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`
}

/** Render a stored cron back into the dialog's fields, or null when custom. */
function describeCron(expr: string): { kind: 'daily' | 'weekly'; hour: number; minute: number; weekday?: number } | null {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/)
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour) || month !== '*') return null
  const minute = Number(min)
  const h = Number(hour)
  if (minute > 59 || h > 23) return null
  if (dom === '*' && dow === '*') return { kind: 'daily', hour: h, minute }
  if (dom === '*' && /^[0-6]$/.test(dow)) return { kind: 'weekly', hour: h, minute, weekday: Number(dow) }
  return null
}

export default function SettingsAutomations() {
  const { t, resolvedLocale } = useI18n()
  const workflows = usePrefsStore(s => s.prefs.workflows) as WorkflowOption[] | undefined
  const personas = usePrefsStore(s => s.prefs.personas) as Persona[] | undefined

  const [jobs, setJobs] = useState<AutomationJobData[]>([])
  const [limits, setLimits] = useState<AutomationLimitsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<AutomationJobData | null | 'new'>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await window.electronAPI.automationList()
      setJobs(Array.isArray(result?.jobs) ? result.jobs : [])
      setLimits(result?.limits ?? null)
    } catch (err) {
      console.error('[AIPA] Could not load automations', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // The scheduler pushes this after every state change (start, finish, CRUD),
    // including runs it started on its own clock.
    return window.electronAPI.onAutomationChanged(() => { refresh() })
  }, [refresh])

  const workflowName = useCallback((id: string) => {
    return (workflows || []).find(w => w.id === id)?.name
  }, [workflows])

  /**
   * The expert a job's workflow runs as: a persona, 'missing' when the workflow
   * still names one that was deleted, or null when the job is not a workflow or
   * its workflow has no binding (the plain assistant).
   */
  const jobPersona = useCallback((job: AutomationJobData): Persona | 'missing' | null => {
    const action = job.action
    if (action.kind !== 'workflow') return null
    const workflow = (workflows || []).find(w => w.id === action.workflowId)
    if (!workflow?.personaId) return null
    return (personas || []).find(p => p.id === workflow.personaId) ?? 'missing'
  }, [workflows, personas])

  const scheduleText = useCallback((trigger: AutomationTriggerData): string => {
    if (trigger.kind === 'interval') {
      const n = trigger.minutes
      if (n % 1440 === 0) return t('automation.schedule.everyDays', { count: n / 1440 })
      if (n % 60 === 0) return t('automation.schedule.everyHours', { count: n / 60 })
      return t('automation.schedule.everyMinutes', { count: n })
    }
    const parsed = describeCron(trigger.expr)
    if (!parsed) return t('automation.schedule.cron', { expr: trigger.expr })
    const time = clockText(parsed.hour, parsed.minute)
    if (parsed.kind === 'daily') return t('automation.schedule.daily', { time })
    return t('automation.schedule.weekly', {
      day: t(`automation.weekdays.${parsed.weekday ?? 0}`),
      time,
    })
  }, [t])

  const timeText = (ts: number): string => new Date(ts).toLocaleString(resolvedLocale)

  const errorText = useCallback((code: string | null): string => {
    if (!code) return ''
    const key = `automation.errors.${code}`
    const translated = t(key)
    return translated === key ? code : translated
  }, [t])

  const toggleJob = async (job: AutomationJobData, enabled: boolean) => {
    setError(null)
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationSetEnabled(job.id, enabled)
      if (!result.ok) setError(t('automation.errors.toggleFailed', { error: errorText(result.error) }))
    } catch (err) {
      setError(t('automation.errors.toggleFailed', { error: String(err) }))
    } finally {
      setBusyId(null)
    }
  }

  const runNow = async (job: AutomationJobData) => {
    setError(null)
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationRunNow(job.id)
      if (!result.ok) setError(t('automation.errors.runFailed', { error: errorText(result.error) }))
    } catch (err) {
      setError(t('automation.errors.runFailed', { error: String(err) }))
    } finally {
      setBusyId(null)
    }
  }

  const removeJob = async (job: AutomationJobData) => {
    setConfirmingId(null)
    setError(null)
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationDelete(job.id)
      if (!result.ok) setError(t('automation.errors.deleteFailed', { error: errorText(result.error ?? 'not_found') }))
    } catch (err) {
      setError(t('automation.errors.deleteFailed', { error: String(err) }))
    } finally {
      setBusyId(null)
    }
  }

  const statusLine = (job: AutomationJobData): { text: string; color: string } => {
    if (job.running || job.lastStatus === 'running') {
      return { text: t('automation.status.running'), color: 'var(--accent-text)' }
    }
    if (!job.lastStatus || job.lastRunAt === null) {
      return { text: t('automation.neverRun'), color: SECONDARY }
    }
    const when = t('automation.lastRun', { time: timeText(job.lastRunAt) })
    const late = job.lastRunLate ? ` · ${t('automation.ranLate')}` : ''
    if (job.lastStatus === 'success') return { text: `${t('automation.status.success')} · ${when}${late}`, color: 'var(--success-text)' }
    if (job.lastStatus === 'skipped') return { text: `${t('automation.status.skipped')} · ${when}`, color: WARNING }
    const detail = errorText(job.lastError)
    return {
      text: `${t('automation.status.error')}${detail ? `: ${detail}` : ''} · ${when}${late}`,
      color: 'var(--danger-text)',
    }
  }

  return (
    <div className="settings-group-columns">
      <SettingsGroup title={t('automation.title')} icon={<AlarmClock size={13} />} groupKey="automations">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 12, color: SECONDARY, lineHeight: 1.5 }}>
            {t('automation.description')}
          </div>
          <button style={primaryButtonStyle} onClick={() => setDialog('new')}>
            <Plus size={13} />
            {t('automation.new')}
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 10, padding: '6px 9px', borderRadius: 6,
            background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)',
            color: 'var(--danger-text)', fontSize: 11,
          }}>
            <AlertTriangle size={12} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 12, color: SECONDARY, padding: '10px 0' }}>{t('common.loading')}</div>
        ) : jobs.length === 0 ? (
          <div style={{ fontSize: 12, color: SECONDARY, padding: '10px 0', lineHeight: 1.5 }}>
            {t('automation.empty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {jobs.map((job, index) => {
              const status = statusLine(job)
              const persona = jobPersona(job)
              const busy = busyId === job.id || job.running
              return (
                <div
                  key={job.id}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 0',
                    borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                    opacity: job.enabled ? 1 : 0.62,
                  }}
                >
                  <div style={{ paddingTop: 1 }}>
                    <Toggle
                      value={job.enabled}
                      onChange={v => toggleJob(job, v)}
                      disabled={busyId === job.id}
                      aria-label={t('automation.enabled')}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {job.name}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: SECONDARY }}>
                        <Clock size={11} />
                        {scheduleText(job.trigger)}
                      </span>
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                      fontSize: 11, color: SECONDARY, marginTop: 3, lineHeight: 1.45,
                    }}>
                      <span>
                        {job.action.kind === 'workflow'
                          ? t('automation.workflowAction', {
                              name: workflowName(job.action.workflowId) ?? t('automation.workflowMissingShort'),
                            })
                          : t('automation.promptAction', { text: job.action.prompt })}
                      </span>
                      {persona && (
                        // The expert behind a background job is the point of the
                        // binding, so it sits on the row rather than behind Edit.
                        <span
                          title={t('automation.personaHint')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '1px 7px', borderRadius: 9, fontWeight: 600,
                            color: persona === 'missing' ? WARNING : 'var(--accent-text)',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {persona === 'missing'
                            ? t('automation.personaMissing')
                            : `${persona.emoji} ${persona.name}`.trim()}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: status.color, marginTop: 4 }}>{status.text}</div>

                    {job.actionMissing && (
                      // Icon hugs the first line; centring it against a wrapped
                      // three-line warning leaves a hole beside the opening words.
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 5,
                        fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5,
                      }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>{t('automation.workflowMissing')}</span>
                      </div>
                    )}

                    {job.enabled && job.nextRunAt !== null && (
                      <div style={{ fontSize: 11, color: SECONDARY, marginTop: 2 }}>
                        {t('automation.nextRun', { time: timeText(job.nextRunAt) })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {confirmingId === job.id ? (
                      // Deleting is irreversible and there is no undo, so the
                      // confirmation replaces the row's actions instead of
                      // opening a second dialog on top of the settings page.
                      <>
                        <button
                          style={{ ...smallButtonStyle, borderColor: 'rgba(248,113,113,0.5)', color: 'var(--danger-text)' }}
                          onClick={() => removeJob(job)}
                        >
                          <Trash2 size={11} />
                          {t('automation.delete')}
                        </button>
                        <button style={smallButtonStyle} onClick={() => setConfirmingId(null)}>
                          {t('automation.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          style={{ ...smallButtonStyle, opacity: busy ? 0.5 : 1 }}
                          disabled={busy}
                          onClick={() => runNow(job)}
                          onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--text-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
                        >
                          <Play size={11} />
                          {t('automation.runNow')}
                        </button>
                        <button
                          style={{ ...smallButtonStyle, opacity: busy ? 0.5 : 1 }}
                          disabled={busy}
                          onClick={() => setDialog(job)}
                          onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--text-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
                        >
                          <Pencil size={11} />
                          {t('automation.edit')}
                        </button>
                        <button
                          style={smallButtonStyle}
                          disabled={busyId === job.id}
                          onClick={() => setConfirmingId(job.id)}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger-text)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
                        >
                          <Trash2 size={11} />
                          {t('automation.delete')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('automation.howItWorks')} icon={<Clock size={13} />} groupKey="automations-help">
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: SECONDARY, lineHeight: 1.6 }}>
          <li>{t('automation.appMustRun')}</li>
          <li>{t('automation.missedRunRule')}</li>
          <li>
            {t('automation.limitsNote', {
              count: limits?.maxRunsPerHour ?? 12,
              minutes: limits?.minIntervalMinutes ?? 5,
            })}
          </li>
        </ul>
      </SettingsGroup>

      {dialog !== null && (
        <AutomationDialog
          job={dialog === 'new' ? null : dialog}
          workflows={workflows || []}
          limits={limits}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

// ── Create / edit dialog ─────────────────────────────

type ScheduleKind = 'daily' | 'weekly' | 'interval' | 'cron'

interface AutomationDialogProps {
  /** null = create a new automation. */
  job: AutomationJobData | null
  workflows: WorkflowOption[]
  limits: AutomationLimitsData | null
  onClose: () => void
}

function AutomationDialog({ job, workflows, limits, onClose }: AutomationDialogProps) {
  const { t } = useI18n()
  const editing = job !== null

  const initialCron = job && job.trigger.kind === 'cron' ? describeCron(job.trigger.expr) : null
  const cronIsCustom = !!job && job.trigger.kind === 'cron' && !initialCron

  const [name, setName] = useState(job?.name ?? '')
  const [enabled, setEnabled] = useState(job?.enabled ?? true)
  const [actionKind, setActionKind] = useState<'workflow' | 'prompt'>(
    job?.action.kind ?? (workflows.length > 0 ? 'workflow' : 'prompt'),
  )
  const [workflowId, setWorkflowId] = useState(
    job?.action.kind === 'workflow' ? job.action.workflowId : (workflows[0]?.id ?? ''),
  )
  const [prompt, setPrompt] = useState(job?.action.kind === 'prompt' ? job.action.prompt : '')
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

  const canSave = name.trim().length > 0 &&
    (actionKind === 'workflow' ? !!workflowId : prompt.trim().length > 0) &&
    !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const input: AutomationInputData = { name: name.trim(), enabled, trigger, action }
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
                onClick={() => setActionKind(kind)}
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
