// BackgroundWorkPopover — the list behind the status bar's background-work
// segment (wave 24, extended with unseen failures in wave 27).
//
// Groups appear only when they have rows. Failures come first: they are the
// group that is still owed an answer, and the segment may be showing a running
// job's label instead. A failed row opens its transcript when the run left one,
// and Settings -> Automations otherwise; every other row opens Settings ->
// Automations because that page owns the controls (Run now, edit, pause).
// `now` comes from the parent, which ticks only while this panel is open.

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle, ArrowUpRight, Pause } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import { formatDuration } from './statusBarConstants'
import { errorCodeText, relativeTimeText } from '../workflows/scheduleSummary'
import { failureStreakText, type UnseenFailure } from './automationFailures'
import type { AutomationJobData } from '../../../preload'

interface BackgroundWorkPopoverProps {
  running: AutomationJobData[]
  retrying: AutomationJobData[]
  /** Failed runs newer than the watermark captured when this panel opened. */
  failures: UnseenFailure[]
  /** How many more are beyond the listed rows. */
  hiddenFailures: number
  nextUp: AutomationJobData[]
  pausedAll: boolean
  now: number
  onClose: () => void
}

/**
 * When the in-flight run started.
 *
 * `lastRunAt` is written when a run *finishes*, so during a run the newest
 * `recentRuns` entry is the scheduler's own start stamp. Taking the later of
 * the two never reports elapsed time from the previous run.
 */
function runStartedAt(job: AutomationJobData): number | null {
  let latest: number | null = job.lastRunAt
  for (const ts of job.recentRuns) {
    if (typeof ts === 'number' && (latest === null || ts > latest)) latest = ts
  }
  return latest
}

const HEADING: CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--text-muted)', padding: '4px 6px 2px',
}

const ROW: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '4px 6px', border: 'none', borderRadius: 6,
  background: 'transparent', color: 'var(--text-primary)', fontSize: 11,
  cursor: 'pointer', textAlign: 'left',
}

const ELLIPSIS: CSSProperties = {
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', textAlign: 'left',
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={HEADING}>{title}</div>
      {children}
    </div>
  )
}

interface RowData {
  key: string
  label: string
  detail: string | null
}

// No explicit aria-label: the accessible name should keep the visible time
// ("Morning briefing for 2m"), which an override would drop.
function Row({ item, title, onClick }: { item: RowData; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={ROW}
      onMouseEnter={event => { event.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
    >
      <span style={ELLIPSIS}>{item.label}</span>
      {item.detail && (
        <span style={{
          flexShrink: 0, color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
        }}>
          {item.detail}
        </span>
      )}
    </button>
  )
}

interface FailureRowProps {
  failure: UnseenFailure
  time: string
  error: string
  streak: string | null
  title: string
  onClick: () => void
}

/**
 * A failed run is two lines: what failed and when, then why. The reason is what
 * makes the row actionable without opening Settings, and the streak is the
 * difference between one bad night and a schedule that never works.
 *
 * No aria-label on the button: its accessible name is the text inside it — job,
 * time, reason — which is exactly what a screen-reader user needs to choose.
 */
function FailureRow({ failure, time, error, streak, title, onClick }: FailureRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{ ...ROW, alignItems: 'flex-start', flexDirection: 'column', gap: 1 }}
      onMouseEnter={event => { event.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%' }}>
        <span style={ELLIPSIS}>{failure.jobName}</span>
        <span style={{
          flexShrink: 0, color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
        }}>
          {time}
        </span>
      </span>
      {(error || streak) && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
          fontSize: 10, color: 'var(--warning-text)', lineHeight: 1.4,
        }}>
          {/* Amber rather than red: the run already failed quietly, and this row
              is an invitation to look, not an alarm to dismiss. */}
          <AlertTriangle size={9} style={{ flexShrink: 0 }} />
          {error && <span>{error}</span>}
          {streak && <span>{streak}</span>}
        </span>
      )}
    </button>
  )
}

export default function BackgroundWorkPopover({
  running,
  retrying,
  failures,
  hiddenFailures,
  nextUp,
  pausedAll,
  now,
  onClose,
}: BackgroundWorkPopoverProps) {
  const { t, resolvedLocale } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus the panel itself, not a row: activating a row navigates away, so
  // moving focus onto one at open would make Enter do more than the user asked.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const openAutomations = () => {
    onClose()
    useUiStore.getState().openSettingsAt('automations')
  }

  const openRun = (sessionId: string) => {
    onClose()
    // The app-level bridge owns opening: it loads the transcript, restores the
    // session's persona and working directory, and closes Settings — the same
    // path Settings -> Automations takes from a run's "Open" link.
    window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: sessionId }))
  }

  const timeText = (ts: number) => new Date(ts).toLocaleString(resolvedLocale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const openSettingsLabel = t('statusBar.background.openSettings')
  const openRunLabel = t('statusBar.background.openRun')

  // One row shape for the state groups: name on the left, the one time fact
  // that matters for that state on the right.
  const row = (job: AutomationJobData, detail: string | null): RowData => ({
    key: job.id, label: job.name, detail,
  })
  const groups = [
    {
      title: t('statusBar.background.runningNow'),
      rows: running.map(job => {
        const startedAt = runStartedAt(job)
        return row(job, startedAt === null ? null : t('statusBar.background.runningFor', {
          time: formatDuration(Math.max(0, now - startedAt)),
        }))
      }),
    },
    {
      title: t('statusBar.background.waitingRetry'),
      rows: retrying.flatMap(job => {
        const retry = job.pendingRetry
        if (!retry) return []
        return [row(job, t('statusBar.background.retryDue', {
          time: formatDuration(Math.max(0, retry.dueAt - now)),
        }))]
      }),
    },
    {
      title: t('statusBar.background.nextUp'),
      rows: nextUp.flatMap(job => job.nextRunAt === null
        ? []
        : [row(job, t('statusBar.background.at', { time: timeText(job.nextRunAt) }))]),
    },
  ].filter(group => group.rows.length > 0)

  // Rebuilt on every render, so the streak follows the newest row as the list
  // changes rather than sticking to whichever row it first met.
  const streakShownFor = new Set<string>()

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('statusBar.background.title')}
      tabIndex={-1}
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 6,
        width: 300,
        maxWidth: 'calc(100vw - 24px)',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
        borderRadius: 10,
        padding: 8,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        outline: 'none',
      }}
    >
      {/* Reuses wave 22's pause wording; the banner explains the exceptions
          (manual runs and an in-flight run) on hover. */}
      {pausedAll && (
        <div
          title={t('automation.pauseAll.banner')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '2px 6px 6px',
            fontSize: 10, color: 'var(--text-muted)',
          }}
        >
          <Pause size={10} style={{ flexShrink: 0, color: 'var(--accent-text)' }} />
          <span>{t('automation.pauseAll.row')}</span>
        </div>
      )}

      {failures.length > 0 && (
        <Group title={t('statusBar.background.failedRuns')}>
          {failures.map(failure => {
            const sessionId = failure.sessionId
            // The streak belongs to the job, not to each run: repeating "3 in a
            // row" on all three rows would read as nine failures. It stays on the
            // newest row, which is where a reader starts.
            const isNewestForJob = !streakShownFor.has(failure.jobId)
            if (isNewestForJob) streakShownFor.add(failure.jobId)
            return (
              <FailureRow
                key={`${failure.jobId}:${failure.startedAt}`}
                failure={failure}
                time={relativeTimeText(failure.startedAt, t, now)}
                error={errorCodeText(failure.error, t)}
                streak={isNewestForJob ? failureStreakText(failure.failureStreak, t) : null}
                title={sessionId ? openRunLabel : openSettingsLabel}
                onClick={() => sessionId ? openRun(sessionId) : openAutomations()}
              />
            )
          })}
          {hiddenFailures > 0 && (
            // The panel lists five; the rest are named only as a count, and the
            // link goes where the whole history lives.
            <button
              type="button"
              onClick={openAutomations}
              title={openSettingsLabel}
              style={{ ...ROW, color: 'var(--text-muted)', fontSize: 10 }}
              onMouseEnter={event => { event.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={event => { event.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <span>{t('statusBar.background.moreFailures', { count: hiddenFailures })}</span>
            </button>
          )}
        </Group>
      )}

      {groups.map(group => (
        <Group key={group.title} title={group.title}>
          {group.rows.map(item => (
            <Row key={item.key} item={item} title={openSettingsLabel} onClick={openAutomations} />
          ))}
        </Group>
      ))}

      <button
        type="button"
        onClick={openAutomations}
        title={openSettingsLabel}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          width: '100%',
          marginTop: 4,
          padding: '6px 6px 2px',
          border: 'none',
          borderTop: '1px solid var(--border)',
          background: 'none',
          color: 'var(--accent-text)',
          fontSize: 11,
          cursor: 'pointer',
        }}
        onMouseEnter={event => { event.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={event => { event.currentTarget.style.color = 'var(--accent-text)' }}
      >
        <ArrowUpRight size={10} />
        <span style={{ flex: 1, textAlign: 'left' }}>{t('statusBar.background.manage')}</span>
      </button>
    </div>
  )
}
