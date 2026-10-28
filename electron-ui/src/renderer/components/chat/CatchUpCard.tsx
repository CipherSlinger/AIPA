// CatchUpCard — "While you were away" (wave 29).
//
// Schedules run while the window is closed. The status bar says what is
// running now, and an unseen failure keeps a badge up, but nothing on screen
// answers "what actually happened while I was gone?" the moment the user comes
// back. This card is that answer: a snapshot, computed once per launch from a
// "last opened" stamp, of the scheduled runs that completed in the gap.
//
// It mounts above the transcript rather than inside it on purpose. The
// transcript is virtualised (MessageList owns the scroll container), and an
// element inserted at its top would either have to become a synthetic row or
// shift the virtualizer's offset maths — the same reason TurnDiffCard is a
// sibling of the list, not a message. It also has to be visible on the welcome
// screen, where no MessageList exists at all. So it sits in the transcript
// column's normal flow: part of the chat view, above the messages, and gone
// with the view when the user navigates away.
//
// It never says the assistant "worked". It names the runs, their times and
// their outcomes; that is all the data supports.

import { useEffect, useState } from 'react'
import { ArrowUpRight, CalendarClock, X } from 'lucide-react'
import type { AutomationJobData } from '../../../preload'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import { errorCodeText, relativeTimeText } from '../workflows/scheduleSummary'
import {
  appStampStorage,
  claimLaunch,
  consumeCatchUp,
  deriveCatchUpRuns,
  gapText,
  isCatchUpConsumed,
  type CatchUpRun,
  type CatchUpSummary,
} from './catchUpSummary'

interface Launch {
  /** The stamp from before this launch — what the gap is measured from. */
  previous: number
  /** Mount time; also the "now" the relative ages are rendered against. */
  now: number
}

export default function CatchUpCard() {
  const t = useT()

  // Read and advance the stamp exactly once per process. `claimLaunch` is
  // memoised, and a consumed launch stays consumed, so a ChatPanel remount
  // (Settings and back) cannot raise the card a second time.
  const [launch] = useState<Launch | null>(() => {
    if (isCatchUpConsumed()) return null
    const now = Date.now()
    const previous = claimLaunch(appStampStorage(), now)
    return previous === null ? null : { previous, now }
  })
  const [summary, setSummary] = useState<CatchUpSummary | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Spend the launch's one appearance even when there is nothing to report: a
  // run that completes later in this session must not turn a remount into a
  // card over a conversation the user is typing in.
  useEffect(() => {
    if (!launch) return
    consumeCatchUp()
  }, [launch])

  // One snapshot at mount, no subscription: this card describes the gap, not
  // live state. A run that finishes after the read belongs to the status bar
  // and Settings, not to "while you were away".
  useEffect(() => {
    if (!launch) return
    const api = window.electronAPI
    if (!api?.automationList) return
    let alive = true
    api.automationList()
      .then(result => {
        if (!alive) return
        // A malformed payload is treated as "nothing to report" rather than
        // crashing the chat view over a background summary.
        const jobs: AutomationJobData[] = Array.isArray(result?.jobs) ? result.jobs : []
        setSummary(deriveCatchUpRuns(jobs, launch.previous))
      })
      .catch(err => {
        console.error('[AIPA] Could not read what ran while the app was closed', err)
        if (alive) setSummary(null)
      })
    return () => { alive = false }
  }, [launch])

  if (!launch || dismissed || !summary || summary.total === 0) return null

  const openAutomations = () => useUiStore.getState().openSettingsAt('automations')
  const openRun = (run: CatchUpRun) => {
    if (run.sessionId) {
      // The app-level bridge owns opening: it loads the transcript and closes
      // Settings, the same path Settings -> Automations uses.
      window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: run.sessionId }))
      return
    }
    openAutomations()
  }

  const outcomeText = (run: CatchUpRun): string => {
    if (run.outcome === 'success') return t('automation.status.success')
    const label = run.outcome === 'error' ? t('automation.status.error') : t('catchUp.skippedOutcome')
    const detail = errorCodeText(run.error, t)
    return detail ? `${label}: ${detail}` : label
  }

  return (
    <div className="chat-column" style={{ flexShrink: 0, padding: '6px 0 2px' }}>
      <div
        role="region"
        aria-label={t('catchUp.aria')}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--bg-input)',
          padding: '7px 10px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 20 }}>
          <CalendarClock size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {t('catchUp.title')}
          </span>
          <span
            title={t('catchUp.gapTitle')}
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
            }}
          >
            {gapText(launch.now - launch.previous)}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={openAutomations}
            title={t('statusBar.background.openSettings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', padding: 0,
              fontSize: 10, color: 'var(--accent-text)', cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--accent-text)' }}
          >
            <span>{t('catchUp.manage')}</span>
            <ArrowUpRight size={10} />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('catchUp.dismissAria')}
            title={t('catchUp.dismiss')}
            style={{
              background: 'none', border: 'none', padding: 2, marginLeft: 2,
              display: 'flex', alignItems: 'center',
              color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <X size={11} />
          </button>
        </div>

        {/* Skips keep their own count: the scheduler declining to run is not a
            failure, and calling it one would manufacture incidents. */}
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
          {summary.succeeded > 0 && (
            <span>{t('catchUp.succeeded', { count: summary.succeeded })}</span>
          )}
          {summary.failed > 0 && (
            <span style={{ color: 'var(--warning-text)' }}>
              {t('catchUp.failed', { count: summary.failed })}
            </span>
          )}
          {summary.skipped > 0 && (
            <span>{t('catchUp.skipped', { count: summary.skipped })}</span>
          )}
        </div>

        {summary.rows.map(run => {
          const failed = run.outcome === 'error'
          return (
            <button
              key={`${run.jobId}:${run.startedAt}`}
              type="button"
              onClick={() => openRun(run)}
              title={run.sessionId
                ? t('statusBar.background.openRun')
                : t('statusBar.background.openSettings')}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                width: '100%', minWidth: 0,
                padding: '2px 4px', margin: '0 -4px',
                borderRadius: 5,
                background: 'transparent', border: 'none',
                textAlign: 'left', cursor: 'pointer',
                fontSize: 11,
                color: failed ? 'var(--warning-text)' : 'var(--text-secondary)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {run.jobName}
              </span>
              <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {relativeTimeText(run.startedAt, t, launch.now)}
              </span>
              <span style={{ flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {outcomeText(run)}
              </span>
            </button>
          )
        })}

        {summary.hiddenCount > 0 && (
          <button
            type="button"
            onClick={openAutomations}
            title={t('statusBar.background.openSettings')}
            style={{
              alignSelf: 'flex-start',
              background: 'none', border: 'none', padding: 0,
              fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {t('catchUp.more', { count: summary.hiddenCount })}
          </button>
        )}
      </div>
    </div>
  )
}
