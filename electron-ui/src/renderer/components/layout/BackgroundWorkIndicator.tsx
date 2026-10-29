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
//
// Wave 61 adds jobs held by a department's daily cap. A hold is the last signal
// because the user set the limit themselves: the work is stopped, not broken,
// so it never outranks a failure. The panel offers the one deliberate way past
// the cap, Run now, which is a manual run and therefore exempt from it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Clock, Hourglass } from 'lucide-react'
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
import { deriveHeldJobs } from '../automation/jobHold'
import { deriveWaitingApprovals } from '../automation/runApproval'
import {
  APPROVAL_FOCUS_EVENT,
  approvalFocusState,
  parseApprovalFocus,
  type ApprovalFocusTarget,
} from '../automation/approvalFocus'

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
  // The request an attention click or a palette row asked for. `focusChecked`
  // says a list read started *after* that ask has landed, so "gone" is only
  // ever claimed on fresh evidence rather than on a stale snapshot.
  const [focusTarget, setFocusTarget] = useState<ApprovalFocusTarget | null>(null)
  const [focusChecked, setFocusChecked] = useState(false)
  const focusWantedRef = useRef(false)
  // Mirrors for handlers that live outside a render: the latest watermark the
  // failures were counted against, and a way to re-read the job list.
  const seenAtRef = useRef<number | null>(null)
  const reloadRef = useRef<() => void>(() => {})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.automationList) return
    let alive = true
    let seq = 0
    // A read that cannot answer drops the focus request: the panel must not
    // keep guessing about the user's request, and "could not read" is not "gone".
    const abandonFocus = () => {
      if (!focusWantedRef.current) return
      focusWantedRef.current = false
      setFocusTarget(null)
      setFocusChecked(false)
    }
    const load = async () => {
      const request = ++seq
      try {
        const result = await api.automationList()
        if (!alive || request !== seq) return
        if (!Array.isArray(result?.jobs)) {
          // A malformed payload is treated like a failed read, not as "no jobs".
          setSnapshot(null)
          abandonFocus()
          return
        }
        setSnapshot({ jobs: result.jobs, limits: result.limits ?? null })
        // Seeding reads the history it just received, so it happens only after a
        // good read. A failed read must never write a watermark over history it
        // did not see: that would silently mark those failures as shown.
        setSeenAt(resolveFailuresSeenAt(result.jobs, appWatermarkStorage(), Date.now()))
        if (focusWantedRef.current) {
          focusWantedRef.current = false
          setFocusChecked(true)
        }
      } catch (err) {
        // Keeping the previous snapshot here would claim work that may have
        // already finished; the segment simply hides instead.
        console.error('[AIPA] Could not load background automations', err)
        if (alive && request === seq) {
          setSnapshot(null)
          abandonFocus()
        }
      }
    }
    reloadRef.current = () => { void load() }
    void load()
    const unsubscribe = api.onAutomationChanged(() => { void load() })
    return () => {
      alive = false
      reloadRef.current = () => {}
      unsubscribe()
    }
  }, [])

  useEffect(() => { seenAtRef.current = seenAt }, [seenAt])

  // Closing the panel also drops whatever request it was pointed at: a later
  // open must not inherit a stale focus and announce "gone" for no reason.
  const closePanel = useCallback((refocusTrigger: boolean) => {
    setOpen(false)
    setOpenSince(null)
    setFocusTarget(null)
    setFocusChecked(false)
    focusWantedRef.current = false
    if (refocusTrigger) triggerRef.current?.focus()
  }, [])

  // An attention click (pet bubble or OS notification) or a palette row asks
  // for one request. The list is re-read before the panel decides whether that
  // request is still there; the event may arrive while the panel is shut.
  useEffect(() => {
    const onFocusApproval = (event: Event) => {
      const target = parseApprovalFocus((event as CustomEvent).detail)
      if (!target) return
      focusWantedRef.current = true
      setFocusTarget(target)
      setFocusChecked(false)
      setNow(Date.now())
      setOpen(true)
      setOpenSince(seenAtRef.current)
      reloadRef.current()
    }
    window.addEventListener(APPROVAL_FOCUS_EVENT, onFocusApproval)
    return () => window.removeEventListener(APPROVAL_FOCUS_EVENT, onFocusApproval)
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
        closePanel(false)
      }
    }
    // AppShell's capture handler exists only outside the chat view, so this
    // listener keeps Escape working in every view. The escape-stack entry runs
    // first there, letting that handler consume the key instead of closing
    // Settings or navigating away behind the open panel.
    const close = () => closePanel(true)
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
  }, [open, closePanel])

  const jobs = useMemo(() => snapshot?.jobs ?? [], [snapshot])
  // Runs whose live turn is holding one permission request for the user. They
  // are also `running` jobs; the segment names them first because a click is
  // the only thing that moves them.
  const waiting = useMemo(() => deriveWaitingApprovals(jobs), [jobs])

  // A held request's wait is counted in the panel, and its deadline is minutes
  // away; a thirty-second tick would make "waited 4s" jump to "waited 34s". The
  // faster clock runs only while something is actually waiting, so a quiet app
  // still wakes up once per panel refresh at most.
  useEffect(() => {
    if (waiting.length === 0) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [waiting.length])

  const running = useMemo(() => jobs.filter(job => job.running), [jobs])
  // A failure row is a past run; the same job may be running again now, which is
  // the one case where its retry action must stay inert. The panel gets ids, not
  // whole jobs, so it cannot start showing live state of its own.
  const runningJobIds = useMemo(() => new Set(running.map(job => job.id)), [running])
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
  // Jobs stopped by a department's own daily cap. Derived once here from the
  // same snapshot as everything else, so the segment's count and the rows the
  // panel lists can never disagree, and nothing flickers while the panel fills.
  const held = useMemo(() => deriveHeldJobs(jobs), [jobs])
  const heldCount = held.rows.length + held.hidden
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
  const visible = waiting.length > 0 || running.length > 0 || retrying.length > 0
    || failureCount > 0 || heldCount > 0
  // What the click pointed at, as far as a read started after it can tell.
  const focusState = approvalFocusState(focusTarget, waiting, focusChecked)
  // The panel must open even when the segment has nothing else to say: the
  // request it was asked to show may already be gone, and that answer — "it is
  // no longer waiting" — is itself what the click owed the user.
  const focusHoldsPanel = focusState === 'pending' || focusState === 'gone'

  // The panel closes only when it has nothing left to list. Closing on "the
  // segment hid" would slam it shut the instant opening it cleared the badge —
  // which is exactly what happens when failures are the only signal. The next-up
  // group alone does not keep it open: the segment is hidden then, and a panel
  // anchored to a hidden trigger has nowhere to point. A focus request being
  // checked or already gone is a message, so it holds the panel open too.
  const panelEmpty = waiting.length === 0 && running.length === 0
    && retrying.length === 0 && openFailures.total === 0 && heldCount === 0
    && !focusHoldsPanel
  useEffect(() => {
    if (!open) return
    if (!panelEmpty) return
    closePanel(false)
  }, [open, panelEmpty, closePanel])

  if (!visible && !(open && focusHoldsPanel)) return null

  // Priority: a held request first (the run cannot move without an answer),
  // then a run in flight, then a waiting retry, then failures, then a held job.
  // Held is last because the user set the limit themselves: the work is
  // stopped, not broken, so however many jobs are held it never outranks a
  // failure. The segment's text follows that order; the panel lists everything
  // regardless.
  const waitingOnly = waiting.length > 0 && running.length === 0
    && retrying.length === 0 && failureCount === 0 && heldCount === 0
  const failuresOnly = waiting.length === 0 && running.length === 0
    && retrying.length === 0 && failureCount > 0
  const heldOnly = waiting.length === 0 && running.length === 0
    && retrying.length === 0 && failureCount === 0 && heldCount > 0
  const visibleLabel = waiting.length > 0
    ? t('statusBar.background.waitingAnswer', { count: waiting.length })
    : running.length > 0
      ? t('statusBar.background.running', { count: running.length })
      : retrying.length > 0
        ? t('statusBar.background.retry', { count: retrying.length })
        : failureCount > 0
          ? t('statusBar.background.failures', { count: failureCount })
          : t('statusBar.background.held', { count: heldCount })
  // The accessible name keeps the visible words ("Running 2") and adds the
  // action, so label-in-name still holds for voice control. Whenever failures
  // are waiting the action sentence says they need attention, whatever the
  // segment's own label had to prioritise. A hold is informational, so its
  // sentence is used only when held is what the segment actually says.
  const ariaLabel = waitingOnly
    ? t('statusBar.background.waitingAnswerAria', { label: visibleLabel })
    : failureCount > 0
      ? t('statusBar.background.failuresAria', { label: visibleLabel })
      : heldOnly
        ? t('statusBar.background.heldAria', { label: visibleLabel })
        : t('statusBar.background.aria', { label: visibleLabel })

  const toggle = () => {
    if (open) {
      closePanel(true)
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
      {/* A panel opened by an alert may outlive the segment (the request was
          the only reason it showed), so the trigger is what hides, not the
          root. */}
      {visible && <button
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
          color: waiting.length > 0 || failuresOnly || heldOnly
            ? 'var(--warning-text)'
            : running.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
          transition: 'all 0.15s ease',
        }}
      >
        {waiting.length > 0 ? (
          <>
            {/* A held request is the one state where the app is waiting on the
                user, not the other way round: the warning tone and the
                hourglass read as "nothing moves until you answer". */}
            <Hourglass size={10} style={{ flexShrink: 0 }} />
            <span>{visibleLabel}</span>
          </>
        ) : running.length > 0 ? (
          <>
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                // The theme's success token, not a fixed hex: the light theme
                // needs a darker green to read on its status bar.
                background: 'var(--success)',
                boxShadow: '0 0 4px var(--success)',
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
      </button>}
      {open && (
        <BackgroundWorkPopover
          waiting={waiting}
          running={running}
          retrying={retrying}
          held={held}
          failures={openFailures.rows}
          hiddenFailures={openFailures.hiddenCount}
          nextUp={nextUp}
          pausedAll={snapshot?.limits?.pausedAll === true}
          runningJobIds={runningJobIds}
          now={now}
          focus={focusTarget}
          focusState={focusState}
          onClose={() => closePanel(false)}
        />
      )}
    </div>
  )
}
