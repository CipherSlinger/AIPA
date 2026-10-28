// Settings → Automations.
//
// The list and the "how it works" notes. The create/edit dialog lives in
// `../automation/AutomationDialog` because the workflow page mounts it too. All
// timing and execution live in the main process (`src/main/automation/`); this
// page only reflects state and sends CRUD requests, then waits for
// `automation:changed` instead of guessing what the scheduler did.

import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, AlertTriangle, Clock, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { usePrefsStore } from '../../store'
import SettingsGroup from './SettingsGroup'
import Toggle from '../ui/Toggle'
import { formatTokens } from '../../utils/formatUtils'
import AutomationDialog, { type WorkflowOption } from '../automation/AutomationDialog'
import { scheduleText } from '../automation/scheduleText'
import { SECONDARY, WARNING, primaryButtonStyle, smallButtonStyle } from '../automation/automationStyles'
import type { AutomationJobData, AutomationLimitsData } from '../../../preload'
import type { Persona } from '../../types/app.types'

/**
 * Money as the engine reported it. Costs stay compact: a settings row has room
 * for `$0.03`, and very small amounts keep a third digit instead of rounding
 * away to `$0.00`.
 */
function costText(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
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

  /**
   * Spend appended to the status line.
   *
   * Codex reports tokens but no money, so the cost segment is omitted rather
   * than rendered as `$0`. Only an actual run (success or failure) has spend:
   * a skipped or interrupted job leaves the previous figure out of this line.
   */
  const usageLine = (job: AutomationJobData): { text: string; title: string } | null => {
    if (job.lastStatus !== 'success' && job.lastStatus !== 'error') return null
    const usage = job.lastUsage
    // Cache reads stay out of the headline count: they are reported separately
    // and would dwarf the conversation tokens in a compact figure.
    const runTokens = usage ? usage.inputTokens + usage.outputTokens : 0
    const runCost = usage?.costUsd !== undefined && usage.costUsd > 0 ? usage.costUsd : 0
    const totalCost = job.totalCostUsd !== undefined && job.totalCostUsd > 0 ? job.totalCostUsd : 0
    if (runTokens === 0 && runCost === 0 && totalCost === 0) return null

    const parts: string[] = []
    if (runTokens > 0) parts.push(t('automation.usage.tokens', { count: formatTokens(runTokens) }))
    if (runCost > 0) parts.push(costText(runCost))
    // The first run's lifetime total is its own cost; repeating it would add a
    // segment that says nothing. After that, the running total earns its place.
    if (totalCost > 0 && totalCost > runCost + 1e-9) {
      parts.push(t('automation.usage.totalCost', { cost: costText(totalCost) }))
    }

    const detail: string[] = []
    if (usage) {
      if (usage.inputTokens > 0) {
        detail.push(t('automation.usage.tooltip.input', { count: formatTokens(usage.inputTokens) }))
      }
      if (usage.outputTokens > 0) {
        detail.push(t('automation.usage.tooltip.output', { count: formatTokens(usage.outputTokens) }))
      }
      if (usage.cachedInputTokens !== undefined && usage.cachedInputTokens > 0) {
        detail.push(t('automation.usage.tooltip.cached', { count: formatTokens(usage.cachedInputTokens) }))
      }
    }
    const lifetime: string[] = []
    if (job.totalTokens !== undefined && job.totalTokens > 0) {
      lifetime.push(t('automation.usage.tooltip.totalTokens', { count: formatTokens(job.totalTokens) }))
    }
    if (totalCost > 0) {
      lifetime.push(t('automation.usage.tooltip.totalCost', { cost: costText(totalCost) }))
    }
    const title = [...(detail.length > 0 ? [detail.join(' · ')] : []), ...lifetime].join('\n')
    return { text: parts.join(' · '), title }
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
              const usage = usageLine(job)
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
                        {scheduleText(t, job.trigger)}
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

                    <div style={{ fontSize: 11, color: status.color, marginTop: 4, lineHeight: 1.45 }}>
                      <span>{status.text}</span>
                      {usage && (
                        // Muted so the spend reads as an aside to the outcome,
                        // not a second status. The tooltip carries the parts a
                        // compact row has no room for.
                        <span style={{ color: SECONDARY }} title={usage.title}>{` · ${usage.text}`}</span>
                      )}
                    </div>

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
