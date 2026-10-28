// WorkflowSchedulesStrip -- every automation bound to one workflow, shown on
// the workflow detail page.
//
// The page used to fold all of a workflow's schedules into one sentence, which
// said when a run would happen and nothing about how the last one went. This
// strip keeps one quiet row per job: trigger, state, last outcome, spend, and
// the actions that do not need the Settings page. Delete stays in Settings —
// this is a status surface, not a management one.

import { useCallback, useState, type CSSProperties } from 'react'
import { CalendarClock, ExternalLink, Pause, Play, RefreshCw, Zap } from 'lucide-react'
import type { AutomationJobData } from '../../../preload'
import { useUiStore } from '../../store'
import type { AppLocale } from '../../utils/formatDate'
import { nextRunText } from '../automation/nextRunText'
import { scheduleText, watchWarningText, type Translate } from '../automation/scheduleText'
import { smallButtonStyle } from '../automation/automationStyles'
import { errorCodeText, outcomeText, spendText } from './scheduleSummary'

interface WorkflowSchedulesStripProps {
  jobs: AutomationJobData[]
  t: Translate
  /** Resolved app locale, so the absolute time matches Settings and the archive. */
  resolvedLocale: AppLocale
  /** Re-fetches the list after an action; the scheduler's event is the primary path. */
  onRefresh: () => void
}

// The chip stays for a disabled job: on a workflow page the schedules are what
// bring the workflow back to life, so "this row will not fire" deserves a
// marker, not another muted clause. Its wording is now the shared "Turned off"
// (see `nextRunText`), not the old `workflow.schedules.paused`: the job's switch
// is off, and calling that "Paused" beside Settings' "Turned off" was a second
// name for the same fact.
const pausedChipStyle: CSSProperties = {
  padding: '0 6px',
  borderRadius: 8,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--warning-text)',
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const actionStyle: CSSProperties = { ...smallButtonStyle, padding: '2px 7px', fontSize: 10.5 }

export interface StripNextRun {
  /**
   * `chip` keeps the at-a-glance marker for a turned-off job, `text` is the
   * shared clause, and `none` means another segment already owns the state.
   */
  kind: 'chip' | 'text' | 'none'
  text: string
  overdue: boolean
}

/**
 * What the row says about the next occurrence — the strip's one decision about
 * state, kept pure so it can be exercised without a DOM.
 *
 * A disabled job keeps the chip (the row must still look not-live) but the chip
 * carries the shared "Turned off" wording: `workflow.schedules.paused` used to
 * name the same switch differently from Settings, and "Paused" implied a state
 * the user had not chosen. A job whose watched path is gone prints no clause at
 * all: "waits for the watched path to change" would contradict the warning that
 * the watcher never attached, and two claims about one state is one too many.
 */
export function workflowSchedulesNextRun(
  job: AutomationJobData,
  t: Translate,
  locale: AppLocale,
  now: number = Date.now(),
): StripNextRun {
  const nextRun = nextRunText(job, t, locale, now)
  if (!job.enabled) return { kind: 'chip', text: nextRun.text, overdue: false }
  if (watchWarningText(job, t) !== null) return { kind: 'none', text: '', overdue: false }
  return { kind: 'text', text: nextRun.text, overdue: nextRun.overdue }
}

export default function WorkflowSchedulesStrip({
  jobs,
  t,
  resolvedLocale,
  onRefresh,
}: WorkflowSchedulesStripProps) {
  // Only actions issued from this strip are marked busy. `job.running` covers
  // runs the scheduler started on its own clock.
  const [busyId, setBusyId] = useState<string | null>(null)

  const reportError = useCallback((key: string, error: string) => {
    useUiStore.getState().addToast('error', t(key, { error }))
  }, [t])

  const runNow = async (job: AutomationJobData) => {
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationRunNow(job.id)
      if (!result.ok) {
        reportError('automation.errors.runFailed', errorCodeText(result.error, t))
      } else {
        // The response only confirms the request; `automation:changed` carries
        // the real state. Fetching closes the race where the event fires before
        // this promise settles and is then overwritten by a stale list.
        onRefresh()
      }
    } catch (err) {
      reportError('automation.errors.runFailed', String(err))
    } finally {
      setBusyId(null)
    }
  }

  const toggleEnabled = async (job: AutomationJobData, enabled: boolean) => {
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationSetEnabled(job.id, enabled)
      if (!result.ok) {
        reportError('automation.errors.toggleFailed', errorCodeText(result.error, t))
      } else {
        onRefresh()
      }
    } catch (err) {
      reportError('automation.errors.toggleFailed', String(err))
    } finally {
      setBusyId(null)
    }
  }

  const openLastRun = (job: AutomationJobData) => {
    if (!job.lastSessionId) return
    // A bare session id: the app-level bridge resolves it and switches the
    // main view to chat, so this page does not need to know how sessions open.
    window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: job.lastSessionId }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', minWidth: 0 }}>
      {jobs.map(job => {
        const outcome = outcomeText(job, t)
        const spend = spendText(job, t)
        // Watch jobs share the one sentence the settings row uses, so a bound
        // job never reads here as a calendar schedule with a missing time.
        const watch = job.trigger.kind === 'watch'
        const watchWarning = watchWarningText(job, t)
        // The same next-occurrence clause Settings → Automations and the
        // archive print: off, waiting on a path, no occurrence, due/overdue, or
        // a real future time. This row used to format the timestamp itself and
        // silently drop the segment for watch jobs, so a missed occurrence read
        // as an upcoming one and a watcher as a schedule with no timing at all.
        const nextRun = workflowSchedulesNextRun(job, t, resolvedLocale)
        const running = job.running || job.lastStatus === 'running'
        // Pausing stays available during a run: it stops future runs, not the
        // current one. Only a request this strip is still awaiting locks the row.
        const busy = busyId === job.id
        return (
          <div
            key={job.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              minWidth: 0, fontSize: 11, color: 'var(--text-muted)',
            }}
          >
            {/* A calendar icon over an event-driven job would advertise a
                countdown that never arrives. */}
            {watch
              ? <RefreshCw size={11} style={{ flexShrink: 0, opacity: 0.8 }} />
              : <CalendarClock size={11} style={{ flexShrink: 0, opacity: 0.8 }} />}
            <span
              title={job.name}
              style={{
                fontWeight: 600, color: 'var(--text-secondary)',
                maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {job.name}
            </span>
            {/* A watch sentence carries an absolute path, which can be longer
                than the row; it may wrap, a countdown may not. */}
            <span style={{
              whiteSpace: watch ? 'normal' : 'nowrap',
              overflowWrap: 'anywhere', minWidth: 0,
            }}>
              {scheduleText(t, job.trigger)}
            </span>

            {watchWarning && (
              // The path is gone, so the watcher is not attached. Warn instead
              // of showing the sentence as if the job were live.
              <span style={{ color: 'var(--warning-text)', whiteSpace: 'nowrap' }}>
                {watchWarning}
              </span>
            )}

            {/* One claim about the state, decided in `workflowSchedulesNextRun`.
                A watch sentence carries words, not a timestamp, so it may wrap
                like the schedule above it. Overdue is also tinted here — the
                strip can use colour — but the text says so on its own. */}
            {nextRun.kind === 'chip' ? (
              <span style={pausedChipStyle}>{nextRun.text}</span>
            ) : nextRun.kind === 'text' && (
              <span style={{
                whiteSpace: watch ? 'normal' : 'nowrap',
                color: nextRun.overdue ? 'var(--warning-text)' : undefined,
              }}>
                {nextRun.text}
              </span>
            )}

            <span style={{ color: outcome.color, overflowWrap: 'anywhere', minWidth: 0 }}>
              {outcome.text}
            </span>
            {spend && (
              <span
                title={spend.title}
                style={{ whiteSpace: 'nowrap' }}
              >{`· ${spend.text}`}</span>
            )}

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {job.lastSessionId && (
                <button
                  type="button"
                  onClick={() => openLastRun(job)}
                  title={t('workflow.schedules.openHint')}
                  style={actionStyle}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <ExternalLink size={10} />
                  {t('workflow.schedules.open')}
                </button>
              )}
              {/* A live run already has its state on the row; a second start is
                  only possible after it finishes. */}
              {!running && (
                <button
                  type="button"
                  onClick={() => { void runNow(job) }}
                  disabled={busy}
                  style={{ ...actionStyle, opacity: busy ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <Zap size={10} />
                  {t('automation.runNow')}
                </button>
              )}
              <button
                type="button"
                onClick={() => { void toggleEnabled(job, !job.enabled) }}
                disabled={busy}
                style={{ ...actionStyle, opacity: busy ? 0.5 : 1 }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {job.enabled ? <Pause size={10} /> : <Play size={10} />}
                {job.enabled ? t('workflow.schedules.pause') : t('workflow.schedules.resume')}
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
