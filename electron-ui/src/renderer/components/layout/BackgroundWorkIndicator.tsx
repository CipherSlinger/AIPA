// BackgroundWorkIndicator — the status bar's answer to "is anything running in
// the background right now?" (wave 24), extended in wave 27 with the runs that
// already failed while the user was away.
//
// Scheduled automations run while the window is closed or while the user is
// elsewhere, and Settings -> Automations was the only place that showed them.
// A failure used to leave nothing behind once the toast expired: the segment
// hid as soon as nothing was in flight. Now an unseen failure keeps the segment
// visible, in a warning tone rather than the neutral clock, until the user has
// looked at the list. A failed list read still clears everything rather than
// leaving a stale count on screen.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { useT } from '../../i18n'
import { pushEscapeHandler } from '../ui/escapeStack'
import type { AutomationJobData, AutomationLimitsData } from '../../../preload'
import BackgroundWorkPopover from './BackgroundWorkPopover'
import {
  appWatermarkStorage,
  deriveUnseenFailures,
  markFailuresSeen,
  resolveFailuresSeenAt,
} from './automationFailures'

interface AutomationSnapshot {
  jobs: AutomationJobData[]
  limits: AutomationLimitsData | null
}

/** Elapsed and due times stay honest only while the panel is open. */
const OPEN_REFRESH_MS = 30_000

export default function BackgroundWorkIndicator() {
  const t = useT()
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [hover, setHover] = useState(false)
  // The timestamp up to which failures have been shown. Null until the first
  // good read has seeded it; nothing is counted before then.
  const [seenAt, setSeenAt] = useState<number | null>(null)
  // The watermark the open panel derives its failure list from. It is captured
  // when the panel opens and is *not* advanced when the badge is cleared, so the
  // rows the badge announced survive their own acknowledgement.
  const [openSince, setOpenSince] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.automationList) return
    let alive = true
    let seq = 0
    const load = async () => {
      const request = ++seq
      try {
        const result = await api.automationList()
        if (!alive || request !== seq) return
        if (!Array.isArray(result?.jobs)) {
          // A malformed payload is treated like a failed read, not as "no jobs".
          setSnapshot(null)
          return
        }
        setSnapshot({ jobs: result.jobs, limits: result.limits ?? null })
        // Seeding reads the history it just received, so it happens only after a
        // good read. A failed read must never write a watermark over history it
        // did not see: that would silently mark those failures as shown.
        setSeenAt(resolveFailuresSeenAt(result.jobs, appWatermarkStorage(), Date.now()))
      } catch (err) {
        // Keeping the previous snapshot here would claim work that may have
        // already finished; the segment simply hides instead.
        console.error('[AIPA] Could not load background automations', err)
        if (alive && request === seq) setSnapshot(null)
      }
    }
    void load()
    const unsubscribe = api.onAutomationChanged(() => { void load() })
    return () => { alive = false; unsubscribe() }
  }, [])

  // Only the open panel prints elapsed times, so the clock runs only while it
  // is open. Nothing polls in the background and nothing refetches per tick.
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), OPEN_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setOpenSince(null)
      }
    }
    // AppShell's capture handler exists only outside the chat view, so this
    // listener keeps Escape working in every view. The escape-stack entry runs
    // first there, letting that handler consume the key instead of closing
    // Settings or navigating away behind the open panel.
    const close = () => {
      setOpen(false)
      setOpenSince(null)
      triggerRef.current?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    const release = pushEscapeHandler(close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      release()
    }
  }, [open])

  const jobs = useMemo(() => snapshot?.jobs ?? [], [snapshot])
  const running = useMemo(() => jobs.filter(job => job.running), [jobs])
  const retrying = useMemo(
    () => jobs.filter(job => !job.running && job.pendingRetry !== undefined),
    [jobs],
  )
  // What still needs the user: failed runs newer than the current watermark.
  // Recomputed from the live snapshot on every render, so a failure that lands
  // after the panel was opened is never hidden by the watermark it arrived after.
  const unseen = useMemo(() => deriveUnseenFailures(jobs, seenAt), [jobs, seenAt])
  // What the open panel lists: derived from the watermark as it was at open.
  const openFailures = useMemo(() => deriveUnseenFailures(jobs, openSince), [jobs, openSince])
  const nextUp = useMemo(() => {
    // While everything is paused the stored nextRunAt is frozen; printing it
    // would promise a run that cannot start. A disabled job is never "next".
    if (!snapshot || snapshot.limits?.pausedAll) return []
    return jobs
      .filter(job => job.enabled && !job.pausedAll && !job.running && job.nextRunAt !== null)
      .sort((a, b) => (a.nextRunAt as number) - (b.nextRunAt as number))
      .slice(0, 3)
  }, [snapshot, jobs])

  // While the panel is open it must keep counting the rows it is showing, even
  // though opening it has already cleared the badge. Otherwise the segment
  // would vanish under the panel the instant it was acknowledged, taking the
  // list with it.
  const failureCount = Math.max(unseen.total, open ? openFailures.total : 0)
  const visible = running.length > 0 || retrying.length > 0 || failureCount > 0

  // The panel closes only when it has nothing left to list. Closing on "the
  // segment hid" would slam it shut the instant opening it cleared the badge —
  // which is exactly what happens when failures are the only signal. The next-up
  // group alone does not keep it open: the segment is hidden then, and a panel
  // anchored to a hidden trigger has nowhere to point.
  const panelEmpty = running.length === 0 && retrying.length === 0
    && openFailures.total === 0
  useEffect(() => {
    if (!open) return
    if (!panelEmpty) return
    setOpen(false)
    setOpenSince(null)
  }, [open, panelEmpty])

  if (!visible) return null

  // Priority: a run in flight, then a waiting retry, then failures. The segment's
  // text follows that order; the panel lists everything regardless.
  const failuresOnly = running.length === 0 && retrying.length === 0
  const visibleLabel = running.length > 0
    ? t('statusBar.background.running', { count: running.length })
    : retrying.length > 0
      ? t('statusBar.background.retry', { count: retrying.length })
      : t('statusBar.background.failures', { count: failureCount })
  // The accessible name keeps the visible words ("Running 2") and adds the
  // action, so label-in-name still holds for voice control. Whenever failures
  // are waiting the action sentence says they need attention, whatever the
  // segment's own label had to prioritise.
  const ariaLabel = failureCount > 0
    ? t('statusBar.background.failuresAria', { label: visibleLabel })
    : t('statusBar.background.aria', { label: visibleLabel })

  const toggle = () => {
    if (open) {
      setOpen(false)
      setOpenSince(null)
      triggerRef.current?.focus()
      return
    }
    setNow(Date.now())
    setOpen(true)
    // Capture the list before acknowledging it. The rows stay derived from the
    // old watermark so the user sees the failures the badge announced.
    setOpenSince(seenAt)
    if (unseen.total > 0) {
      const at = Date.now()
      markFailuresSeen(at, appWatermarkStorage())
      setSeenAt(at)
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0, marginLeft: 'auto' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={ariaLabel}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 6,
          border: 'none', cursor: 'pointer',
          fontSize: 10, whiteSpace: 'nowrap',
          background: hover || open ? 'var(--border)' : 'transparent',
          color: running.length > 0
            ? 'var(--text-secondary)'
            : failuresOnly ? 'var(--warning-text)' : 'var(--text-muted)',
          transition: 'all 0.15s ease',
        }}
      >
        {running.length > 0 ? (
          <>
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 4px rgba(74,222,128,0.6)',
                animation: 'pulse 1.2s ease-in-out infinite',
              }}
            />
            <span>{visibleLabel}</span>
          </>
        ) : failuresOnly ? (
          <>
            {/* A triangle in the warning tone, not the danger red: this is work
                that needs a look, not a dialog the app is insisting on. */}
            <AlertTriangle size={10} style={{ flexShrink: 0 }} />
            <span>{visibleLabel}</span>
          </>
        ) : (
          <>
            <Clock size={10} />
            <span>{visibleLabel}</span>
          </>
        )}
      </button>
      {open && (
        <BackgroundWorkPopover
          running={running}
          retrying={retrying}
          failures={openFailures.rows}
          hiddenFailures={openFailures.hiddenCount}
          nextUp={nextUp}
          pausedAll={snapshot?.limits?.pausedAll === true}
          now={now}
          onClose={() => {
            setOpen(false)
            setOpenSince(null)
          }}
        />
      )}
    </div>
  )
}
