// BackgroundWorkIndicator — the status bar's answer to "is anything running in
// the background right now?" (wave 24)
//
// Scheduled automations run while the window is closed or while the user is
// elsewhere, and Settings -> Automations was the only place that showed them.
// The segment stays absent unless a run is in flight or a retry is waiting, so
// a quiet app gets no extra status-bar noise. A failed list read clears the
// count rather than leaving a stale one on screen.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { useT } from '../../i18n'
import { pushEscapeHandler } from '../ui/escapeStack'
import type { AutomationJobData, AutomationLimitsData } from '../../../preload'
import BackgroundWorkPopover from './BackgroundWorkPopover'

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
        // A malformed payload is treated like a failed read, not as "no jobs".
        setSnapshot(Array.isArray(result?.jobs)
          ? { jobs: result.jobs, limits: result.limits ?? null }
          : null)
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
      }
    }
    // AppShell's capture handler exists only outside the chat view, so this
    // listener keeps Escape working in every view. The escape-stack entry runs
    // first there, letting that handler consume the key instead of closing
    // Settings or navigating away behind the open panel.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    const release = pushEscapeHandler(() => {
      setOpen(false)
      triggerRef.current?.focus()
    })
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      release()
    }
  }, [open])

  const running = useMemo(
    () => (snapshot?.jobs ?? []).filter(job => job.running),
    [snapshot],
  )
  const retrying = useMemo(
    () => (snapshot?.jobs ?? []).filter(job => !job.running && job.pendingRetry !== undefined),
    [snapshot],
  )
  const nextUp = useMemo(() => {
    // While everything is paused the stored nextRunAt is frozen; printing it
    // would promise a run that cannot start. A disabled job is never "next".
    if (!snapshot || snapshot.limits?.pausedAll) return []
    return snapshot.jobs
      .filter(job => job.enabled && !job.pausedAll && !job.running && job.nextRunAt !== null)
      .sort((a, b) => (a.nextRunAt as number) - (b.nextRunAt as number))
      .slice(0, 3)
  }, [snapshot])

  const visible = running.length > 0 || retrying.length > 0

  // If the data disappears (failed read, last run finished) the panel must not
  // spring back on the next successful read.
  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  if (!visible) return null

  // The accessible name keeps the visible words ("Running 2") and adds the
  // action, so label-in-name still holds for voice control.
  const visibleLabel = running.length > 0
    ? t('statusBar.background.running', { count: running.length })
    : t('statusBar.background.retry', { count: retrying.length })
  const ariaLabel = t('statusBar.background.aria', { label: visibleLabel })

  const toggle = () => {
    if (open) {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    setNow(Date.now())
    setOpen(true)
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
          color: running.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
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
          nextUp={nextUp}
          pausedAll={snapshot?.limits?.pausedAll === true}
          now={now}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
