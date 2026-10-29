// BackgroundWorkPopover — the list behind the status bar's background-work
// segment (wave 24, extended with unseen failures in wave 27, retryable rows in
// wave 28, and jobs held by a department cap in wave 61).
//
// Groups appear only when they have rows. Failures come first: they are the
// group that is still owed an answer, and the segment may be showing a running
// job's label instead. A failed row opens its transcript when the run left one,
// and Settings -> Automations otherwise; every other row opens Settings ->
// Automations because that page owns the controls (Run now, edit, pause).
//
// A failed row also carries actions of its own: run the job again from the panel
// that announced the failure, and ask AIPA to look into it (wave 30), both
// without a trip through Settings. The actions are siblings inside a
// `role="group"` container — a button cannot legally contain another button, and
// the main action's accessible name has to stay the row's own text (job, time,
// reason). "Ask AIPA" drafts the question in a new conversation; it never sends.
//
// A held row is its own group, immediately after failures and before the state
// groups. It is separate because nothing broke: a department cap refused the
// scheduled occurrence, and the row's job is to name the cap and offer the one
// deliberate way past it. Run now is manual and therefore exempt from that cap,
// which is why the row can start a job the scheduler just stopped.
//
// Wave 64 adds Run all held inside that group. It is a batch over the jobs the
// limit still holds at the moment of the confirming click, re-read from the
// scheduler rather than taken from the render that showed the button: a hold
// can clear between arming and confirming, and a cleared job must not start.
//
// `now` comes from the parent, which ticks only while this panel is open.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle, ArrowUpRight, Building2, Check, Clock, Loader2, Pause, Play, RotateCcw,
  Sparkles, X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatStore, useDepartmentStore, useUiStore } from '../../store'
import { formatDuration } from './statusBarConstants'
import { errorCodeText, relativeTimeText } from '../workflows/scheduleSummary'
import { failureStreakText, type UnseenFailure } from './automationFailures'
import { buildInvestigatePrompt } from '../automation/investigatePrompt'
import { buildJobDepartmentOptions, resolveJobDepartment } from '../automation/jobDepartment'
import type { HeldJobs, JobHold } from '../automation/jobHold'
import {
  HELD_BATCH_ARM_MS,
  heldBatchHint,
  heldBatchLabel,
  heldBatchOutcome,
  heldBatchResultText,
  heldBatchTitle,
  nextHeldBatchPhase,
  selectHeldRunBatch,
  summarizeHeldBatch,
} from '../automation/heldBatch'
import type { HeldBatchOutcome, HeldBatchPhase } from '../automation/heldBatch'
import {
  RUN_APPROVAL_TIMEOUT_MINUTES,
  waitingApprovalKey,
  type WaitingApprovalRow,
} from '../automation/runApproval'
import type { Translate } from '../automation/scheduleText'
import DeptBudgetFrees from '../departments/DeptBudgetFrees'
import { budgetHolding } from '../departments/deptBudget.data'
import type {
  AutomationDeptBudgetReportData,
  AutomationJobData,
} from '../../../preload'

interface BackgroundWorkPopoverProps {
  /**
   * Runs holding one permission request for the user, oldest first. These are
   * also in `running`; they are passed separately because the answer controls
   * only make sense beside the verbatim ask.
   */
  waiting: WaitingApprovalRow[]
  running: AutomationJobData[]
  retrying: AutomationJobData[]
  /**
   * Jobs a department's daily cap refused, already capped by the indicator so
   * this panel stays presentational and cannot disagree with the segment.
   */
  held: HeldJobs
  /** Failed runs newer than the watermark captured when this panel opened. */
  failures: UnseenFailure[]
  /** How many more are beyond the listed rows. */
  hiddenFailures: number
  nextUp: AutomationJobData[]
  pausedAll: boolean
  /**
   * Jobs with a run in flight right now. A row lists a *past* failure, so the
   * failure's job may be running again already; that is the one case where the
   * row's "run again" action cannot start another run.
   */
  runningJobIds: ReadonlySet<string>
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

/**
 * A failed row is a group of two sibling buttons, so the hover background and
 * the padding belong to the container rather than to either action.
 */
const ROW_GROUP: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
  padding: '4px 6px', borderRadius: 6,
  transition: 'background 0.12s ease',
}

/** The row's main action: the two text lines, stretched, with no chrome. */
const ROW_MAIN: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1,
  flex: 1, minWidth: 0, padding: 0, border: 'none',
  background: 'transparent', color: 'var(--text-primary)', fontSize: 11,
  cursor: 'pointer', textAlign: 'left',
}

const ELLIPSIS: CSSProperties = {
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', textAlign: 'left',
}

/**
 * The request exactly as the engine stated it.
 *
 * Monospace and selectable, because the user is being asked to judge a command
 * or a path: reflowing it, eliding it or translating it would remove the only
 * thing they can act on. It scrolls instead of growing the panel without bound.
 */
const APPROVAL_SUBJECT: CSSProperties = {
  margin: '1px 0', padding: '4px 6px', borderRadius: 4,
  background: 'var(--bg-hover)',
  borderLeft: '2px solid var(--warning-text)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 10, lineHeight: 1.45,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  maxHeight: 120, overflowY: 'auto',
  userSelect: 'text',
}

/** One of the two answers to a held request. */
function ApprovalButton({
  tone, label, ariaLabel, busy, onClick,
}: {
  tone: 'approve' | 'deny'
  label: string
  ariaLabel: string
  busy: boolean
  onClick: () => void
}) {
  const approve = tone === 'approve'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        flex: 1, minWidth: 0, padding: '3px 6px',
        borderRadius: 5, fontSize: 10, cursor: busy ? 'default' : 'pointer',
        border: `1px solid ${approve ? 'var(--accent-text)' : 'var(--border)'}`,
        background: approve ? 'var(--bg-hover)' : 'transparent',
        color: approve ? 'var(--accent-text)' : 'var(--text-secondary)',
        opacity: busy ? 0.55 : 1,
        transition: 'opacity 0.12s ease',
      }}
    >
      {busy
        ? <Loader2 size={10} style={{ animation: 'spin 0.9s linear infinite' }} />
        : approve ? <Check size={10} /> : <X size={10} />}
      <span style={ELLIPSIS}>{label}</span>
    </button>
  )
}

/** The square icon actions a failed row offers beside its main button. */
const ICON_ACTION: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, width: 18, height: 18, padding: 0,
  border: 'none', borderRadius: 4, background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer',
  transition: 'opacity 0.12s ease, color 0.12s ease',
}

/**
 * The refusal codes `automation:runNow` can return, in the panel's own words.
 *
 * Settings -> Automations prefixes a generic "Could not start the run:" to the
 * code, which reads wrong for a refusal that is really "this job is already
 * running". These sentences state what happened. Anything else goes through
 * `errorCodeText` inside a sentence, so a raw code is never shown on its own.
 */
function refusalText(code: string, name: string, t: Translate): string {
  switch (code) {
    case 'already_running':
      return t('statusBar.background.runAlreadyRunning', { name })
    case 'not_found':
      return t('statusBar.background.runNotFound', { name })
    case 'too_many_running':
      return t('statusBar.background.runTooMany', { name })
    // Not a wire refusal today: a manual run on a job whose workflow was
    // deleted is acknowledged and then recorded as a failure. The caller
    // detects that through `running` and names it with this same mapping.
    case 'workflow_missing':
      return t('statusBar.background.runWorkflowMissing', { name })
    case 'nothing_to_run':
      return t('statusBar.background.runNothingToRun', { name })
    default: {
      const reason = errorCodeText(code, t)
      return t('statusBar.background.runRefused', { name, reason: reason || code })
    }
  }
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
  /** Start this failure's job again; the row never removes itself. */
  onRunAgain: () => void
  runAria: string
  /** What the action does, and what a manual run is exempt from. */
  runTitle: string
  /** Why the action is unavailable while the job is running already. */
  runBusyTitle: string
  /** Draft a question about this failure in a new conversation. */
  onInvestigate: () => void
  investigateAria: string
  /** What the action does, and that it sends nothing on its own. */
  investigateTitle: string
  /** This row's question is being prepared (the job list is being read). */
  investigating: boolean
  /** A run for this job is in flight right now. */
  running: boolean
  /** This row has already asked for a start and is waiting on the IPC reply. */
  starting: boolean
  /**
   * Touch screens have no hover, so an action revealed only on hover would be
   * invisible exactly where it is the only way to reach it.
   */
  alwaysShowAction: boolean
}

/**
 * A failed run is two lines: what failed and when, then why. The reason is what
 * makes the row actionable without opening Settings, and the streak is the
 * difference between one bad night and a schedule that never works.
 *
 * The main button keeps no aria-label: its accessible name is the text inside
 * it — job, time, reason — which is exactly what a screen-reader user needs to
 * choose. The two icon actions beside it name their own job, so a screen reader
 * hears "Ask AIPA about Morning briefing" and "Run Morning briefing again"
 * rather than two bare verbs.
 */
function FailureRow({
  failure, time, error, streak, title, onClick,
  onRunAgain, runAria, runTitle, runBusyTitle,
  onInvestigate, investigateAria, investigateTitle, investigating,
  running, starting, alwaysShowAction,
}: FailureRowProps) {
  // The container tints while either action is hovered or focused. State
  // rather than inline handlers on the buttons keeps the highlight alive when
  // the mouse leaves onto the icon or the keyboard tabs between the two.
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || focused
  const locked = running || starting
  // Locked rows keep the icons on screen: a disabled control that vanishes
  // reads as a glitch, and the spinner needs to be visible anyway.
  const actionVisible = active || alwaysShowAction || locked || investigating

  return (
    <div
      role="group"
      aria-label={failure.jobName}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        // Moving between the row's own buttons is not leaving the row.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      style={{ ...ROW_GROUP, background: active ? 'var(--bg-hover)' : 'transparent' }}
    >
      <button type="button" onClick={onClick} title={title} style={ROW_MAIN}>
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
      <button
        type="button"
        aria-label={investigateAria}
        title={investigateTitle}
        aria-busy={investigating || undefined}
        onClick={() => { if (!investigating) onInvestigate() }}
        onMouseEnter={event => { event.currentTarget.style.color = 'var(--text-primary)' }}
        onMouseLeave={event => { event.currentTarget.style.color = 'var(--accent-text)' }}
        style={{
          ...ICON_ACTION,
          color: 'var(--accent-text)',
          opacity: actionVisible ? 1 : 0,
        }}
      >
        {investigating
          ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} />
          : <Sparkles size={13} />}
      </button>
      <button
        type="button"
        aria-label={runAria}
        title={running ? runBusyTitle : runTitle}
        aria-disabled={locked}
        aria-busy={starting || undefined}
        onClick={() => { if (!locked) onRunAgain() }}
        onMouseEnter={event => {
          if (!locked) event.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={event => {
          event.currentTarget.style.color = locked ? 'var(--text-muted)' : 'var(--text-secondary)'
        }}
        style={{
          ...ICON_ACTION,
          color: locked ? 'var(--text-muted)' : 'var(--text-secondary)',
          cursor: locked ? 'default' : 'pointer',
          opacity: !actionVisible ? 0 : locked && !starting ? 0.4 : 1,
          // `pointer-events: none` would swallow the tooltip that says why the
          // action is unavailable, so the control stays hoverable and the
          // handler guard above is what makes it inert.
        }}
      >
        {starting
          ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} />
          : <RotateCcw size={13} />}
      </button>
    </div>
  )
}

interface HeldRowProps {
  hold: JobHold
  time: string
  department: string
  departmentTitle: string | undefined
  title: string
  onClick: () => void
  /** Start this job by hand, bypassing the cap that held it. */
  onRunNow: () => void
  runAria: string
  runTitle: string
  runBusyTitle: string
  /** A run for this job is in flight right now. */
  running: boolean
  /** This row has already asked for a start and is waiting on the IPC reply. */
  starting: boolean
  alwaysShowAction: boolean
}

/**
 * A held job was stopped by a limit the user set, not by anything breaking.
 * The row therefore carries a clock in the warning tone rather than the failure
 * triangle: it should be noticed, but it is not an alarm to dismiss. The
 * department line names whose cap stopped it; a deleted node or an unfiled job
 * says so in words, never as a bare id.
 *
 * Like a failure row, the actions are siblings inside a group. The main button
 * keeps the row's own text as its accessible name, and Run now names its job.
 */
function HeldRow({
  hold, time, department, departmentTitle, title, onClick,
  onRunNow, runAria, runTitle, runBusyTitle, running, starting, alwaysShowAction,
}: HeldRowProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || focused
  // The same two reasons a failure row's action is inert: the job may already
  // be running, or this row's start may still be awaiting its IPC reply.
  const locked = running || starting
  const actionVisible = active || alwaysShowAction || locked

  return (
    <div
      role="group"
      aria-label={hold.job.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        // Moving between the row's own buttons is not leaving the row.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      style={{ ...ROW_GROUP, background: active ? 'var(--bg-hover)' : 'transparent' }}
    >
      <button type="button" onClick={onClick} title={title} style={ROW_MAIN}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
          {/* Amber clock, not the failure triangle: a hold is a schedule that
              stopped, not work that went wrong. */}
          <Clock size={9} style={{ flexShrink: 0, color: 'var(--warning-text)' }} />
          <span style={ELLIPSIS}>{hold.job.name}</span>
          <span style={{
            flexShrink: 0, color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
          }}>
            {time}
          </span>
        </span>
        <span
          title={departmentTitle}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, width: '100%',
            fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4,
          }}
        >
          <Building2 size={9} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {department}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={runAria}
        title={running ? runBusyTitle : runTitle}
        aria-disabled={locked}
        aria-busy={starting || undefined}
        onClick={() => { if (!locked) onRunNow() }}
        onMouseEnter={event => {
          if (!locked) event.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={event => {
          event.currentTarget.style.color = locked ? 'var(--text-muted)' : 'var(--text-secondary)'
        }}
        style={{
          ...ICON_ACTION,
          color: locked ? 'var(--text-muted)' : 'var(--text-secondary)',
          cursor: locked ? 'default' : 'pointer',
          opacity: !actionVisible ? 0 : locked && !starting ? 0.4 : 1,
        }}
      >
        {starting
          ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} />
          : <RotateCcw size={13} />}
      </button>
    </div>
  )
}

export default function BackgroundWorkPopover({
  waiting,
  running,
  retrying,
  held,
  failures,
  hiddenFailures,
  nextUp,
  pausedAll,
  runningJobIds,
  now,
  onClose,
}: BackgroundWorkPopoverProps) {
  const { t, resolvedLocale } = useI18n()
  const addToast = useUiStore(state => state.addToast)
  const departments = useDepartmentStore(state => state.departments)
  // One ordered mapping per tree or language change: held rows resolve their
  // department against exactly the tree Settings shows, so a deleted node reads
  // as deleted here too rather than being guessed from an id.
  const departmentOptions = useMemo(
    () => buildJobDepartmentOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )

  // The held group's forecast. Read through the same channel the department
  // Brief uses — this panel adds no IPC surface of its own — and only while the
  // group is on screen. A failed read leaves the list null, which prints no
  // line: the forecast is an extra, and "could not read" is not "no cap".
  const [budgetReports, setBudgetReports] = useState<
    AutomationDeptBudgetReportData[] | null
  >(null)
  // A stable key instead of the array: the held rows are rebuilt on every tick
  // of `now`, and an identity dependency would re-read the caps each second.
  const heldDepartmentKey = useMemo(() => {
    const ids = new Set<string>()
    for (const hold of held.rows) {
      if (typeof hold.departmentId === 'string' && hold.departmentId) ids.add(hold.departmentId)
    }
    return [...ids].sort().join('|')
  }, [held.rows])

  useEffect(() => {
    const ids = heldDepartmentKey ? heldDepartmentKey.split('|') : []
    const api = window.electronAPI
    if (ids.length === 0 || !api?.automationDeptBudgets) {
      setBudgetReports(null)
      return
    }
    let alive = true
    const load = () => {
      api.automationDeptBudgets()
        .then(reports => {
          if (alive) setBudgetReports(Array.isArray(reports) ? reports : [])
        })
        .catch(() => {
          if (alive) setBudgetReports(null)
        })
    }
    load()
    // A finished run or a cap edit moves the figure this line forecasts from;
    // the scheduler broadcasts `automation:changed` for both.
    const off = api.onAutomationChanged(load)
    return () => {
      alive = false
      off()
    }
  }, [heldDepartmentKey])

  // One cap for the whole group, or no line at all. Held jobs can be held by
  // different caps, and one sentence cannot honestly speak for two different
  // limits; when every row resolves to the same cap, this is that report.
  const heldCaps = useMemo(() => {
    if (!budgetReports || !heldDepartmentKey) return []
    const caps: AutomationDeptBudgetReportData[] = []
    for (const departmentId of heldDepartmentKey.split('|')) {
      const report = budgetHolding(budgetReports, departmentId)
      if (report && !caps.some(cap => cap.departmentId === report.departmentId)) caps.push(report)
    }
    return caps
  }, [budgetReports, heldDepartmentKey])

  const panelRef = useRef<HTMLDivElement>(null)
  // Jobs whose start request is still awaiting the IPC reply. Keyed by job, not
  // by row: the same job can occupy two failure rows, and both must show the
  // same spinner and refuse a second click.
  const [startingJobs, setStartingJobs] = useState<ReadonlySet<string>>(() => new Set())
  // The state above is for rendering; this mirror is read synchronously so two
  // clicks inside one frame cannot both pass the guard before React re-renders.
  const startingRef = useRef<Set<string>>(new Set())
  // The row whose question is being prepared; also blocks a second click while
  // the job list is on its way.
  const [investigatingJobId, setInvestigatingJobId] = useState<string | null>(null)
  // Requests whose answer is on its way to main, keyed by job + request. The
  // mirror ref is read synchronously so a double click cannot answer twice.
  const [answering, setAnswering] = useState<ReadonlySet<string>>(() => new Set())
  const answeringRef = useRef<Set<string>>(new Set())
  // Run all held. The number the button names is every held job, including the
  // ones beyond the rows the panel lists.
  const heldCount = held.rows.length + held.hidden
  const [batchPhase, setBatchPhase] = useState<HeldBatchPhase>({ kind: 'idle' })
  // Same reason as startingRef: the render state lags a click by a frame, and
  // two clicks inside that frame must not both get through the arming guard.
  const batchPhaseRef = useRef<HeldBatchPhase>({ kind: 'idle' })

  // Focus the panel itself, not a row: activating a row navigates away, so
  // moving focus onto one at open would make Enter do more than the user asked.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // A changed held count means the number in the label no longer describes the
  // set behind it; the confirming click must not survive that.
  useEffect(() => {
    const current = batchPhaseRef.current
    if (current.kind !== 'armed' || current.count === heldCount) return
    batchPhaseRef.current = { kind: 'idle' }
    setBatchPhase({ kind: 'idle' })
  }, [heldCount])

  // The confirmation lets go on its own if the second click never comes.
  useEffect(() => {
    if (batchPhase.kind !== 'armed') return
    const timer = window.setTimeout(() => {
      batchPhaseRef.current = { kind: 'idle' }
      setBatchPhase({ kind: 'idle' })
    }, HELD_BATCH_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [batchPhase])

  // Escape while armed disarms, not only closes: the indicator's own handler
  // closes the panel a moment later, and an armed button must not outlive it.
  useEffect(() => {
    if (batchPhase.kind !== 'armed') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      batchPhaseRef.current = { kind: 'idle' }
      setBatchPhase({ kind: 'idle' })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [batchPhase])

  // Read once: whether the pointing device can hover. A row action revealed
  // only on hover would be invisible on a touch screen, where it is the only
  // way to reach it.
  const hoverCapable = useMemo(() => {
    try {
      return window.matchMedia('(hover: none)').matches === false
    } catch {
      return true
    }
  }, [])

  /**
   * Start one job by hand from this panel.
   *
   * A failure row reruns the job that failed; a held row starts the job the cap
   * refused, which is allowed because a manual run is exempt from that cap.
   * Both share this one path so their guards, refusals and feedback cannot
   * drift apart.
   */
  const startRun = async (jobId: string, jobName: string) => {
    const api = window.electronAPI
    if (!api?.automationRunNow) {
      // Preload missing or stale: say so instead of leaving the click silent.
      addToast('error', t('statusBar.background.runRefused', {
        name: jobName,
        reason: t('automation.errors.unexpected_error'),
      }))
      return
    }
    if (startingRef.current.has(jobId)) return
    startingRef.current.add(jobId)
    setStartingJobs(new Set(startingRef.current))
    try {
      const result = await api.automationRunNow(jobId)
      if (!result.ok) {
        // A refusal is not a generic failure: say which one it was.
        addToast('warning', refusalText(result.error, jobName, t))
        return
      }
      // A manual run can be accepted and still not start — its workflow was
      // deleted, or produced no prompt. The scheduler records that reason on
      // the job before returning this view, so `running` is the honest test
      // for "it is actually going", and the reason is the right toast.
      if (!result.job.running) {
        addToast('warning', refusalText(
          result.job.lastError ?? 'unexpected_error',
          jobName,
          t,
        ))
        return
      }
      // The scheduler broadcasts `automation:changed`; the indicator reloads on
      // that event, so nothing here polls for the run's progress.
      addToast('success', t('statusBar.background.runStarted', { name: jobName }))
    } catch (err) {
      console.error('[AIPA] Could not start an automation from the background panel', err)
      addToast('error', t('statusBar.background.runRefused', {
        name: jobName,
        reason: t('automation.errors.unexpected_error'),
      }))
    } finally {
      startingRef.current.delete(jobId)
      setStartingJobs(new Set(startingRef.current))
    }
  }

  const runAgain = (failure: UnseenFailure) => startRun(failure.jobId, failure.jobName)

  /**
   * Answer one held request.
   *
   * The job id and the request id both go to main: this answers that one
   * request only, and nothing about the choice is stored for later. A
   * `not_waiting` reply is normal — the deadline may have passed between this
   * render and the click — so it is said in words and the row is left to the
   * next `automation:changed` broadcast.
   */
  const answerApproval = async (row: WaitingApprovalRow, approved: boolean) => {
    const api = window.electronAPI
    if (!api?.automationApprovalRespond) {
      addToast('error', t('automation.errors.unexpected_error'))
      return
    }
    const key = waitingApprovalKey(row.job.id, row.wait.requestId)
    if (answeringRef.current.has(key)) return
    answeringRef.current.add(key)
    setAnswering(new Set(answeringRef.current))
    try {
      const result = await api.automationApprovalRespond(row.job.id, row.wait.requestId, approved)
      if (!result.ok) {
        addToast(
          result.error === 'not_waiting' ? 'warning' : 'error',
          result.error === 'not_waiting'
            ? t('statusBar.background.waitingGone')
            : t('automation.errors.unexpected_error'),
        )
        return
      }
      // The run continues either way; these say so, and the denial toast names
      // the refusal rather than implying the job died.
      addToast('success', approved
        ? t('statusBar.background.waitingApproved', { name: row.job.name })
        : t('statusBar.background.waitingDenied', { name: row.job.name }))
    } catch (err) {
      console.error('[AIPA] Could not answer a held automation request', err)
      addToast('error', t('automation.errors.unexpected_error'))
    } finally {
      answeringRef.current.delete(key)
      setAnswering(new Set(answeringRef.current))
    }
  }

  const applyBatchPhase = (next: HeldBatchPhase) => {
    batchPhaseRef.current = next
    setBatchPhase(next)
  }

  /**
   * Start every job the limit still holds when the confirming click lands.
   *
   * The panel received held rows, not jobs, so the list is re-read here. That
   * read is also what makes the batch honest: the number on the button may be
   * seconds old, and a hold that cleared in between — a manual run finished, a
   * cap raised, a newer record — must not be started from the render behind the
   * label. Starts are awaited one at a time so each record lands in the
   * scheduler before the next request leaves; nothing is retried.
   */
  const runAllHeld = async () => {
    const running = nextHeldBatchPhase(batchPhaseRef.current, { type: 'click', heldCount })
    if (running.kind !== 'running') return
    applyBatchPhase(running)

    let outcome: HeldBatchOutcome
    try {
      const api = window.electronAPI
      if (!api?.automationList || !api?.automationRunNow) {
        outcome = { kind: 'unreadable' }
      } else {
        const listed = await api.automationList()
        const jobs: AutomationJobData[] | null = Array.isArray(listed?.jobs) ? listed.jobs : null
        if (!jobs) {
          outcome = { kind: 'unreadable' }
        } else {
          const ids = selectHeldRunBatch(jobs)
          if (ids.length === 0) {
            outcome = { kind: 'none' }
          } else {
            let started = 0
            for (const id of ids) {
              try {
                const result = await api.automationRunNow(id)
                // Accepted is not the same as going: a deleted workflow is
                // acknowledged and only becomes a recorded failure later.
                if (result.ok && result.job.running) started += 1
              } catch (err) {
                // One refusal must not abandon the rest. It is counted as not
                // started, never retried.
                console.error(
                  '[AIPA] Could not start a held automation from the background panel',
                  err,
                )
              }
            }
            outcome = heldBatchOutcome(summarizeHeldBatch(ids.length, started))
          }
        }
      }
    } catch (err) {
      console.error('[AIPA] Could not read the job list for the held batch', err)
      outcome = { kind: 'unreadable' }
    }
    applyBatchPhase({ kind: 'done', outcome })
  }

  // The same click both arms and confirms. The ref decides which, so a double
  // click inside one frame arms and then starts exactly one batch rather than
  // leaving the button stuck in a pending state.
  const onRunAllHeld = () => {
    const current = batchPhaseRef.current
    if (current.kind === 'running') return
    if (current.kind === 'armed') {
      void runAllHeld()
      return
    }
    applyBatchPhase(nextHeldBatchPhase(current, { type: 'click', heldCount }))
  }

  const disarmHeldBatch = () => {
    applyBatchPhase(nextHeldBatchPhase(batchPhaseRef.current, { type: 'disarm' }))
  }

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

  /**
   * Turn a failure into a question, not an answer.
   *
   * This panel deliberately receives only the failure rows (see the note in
   * BackgroundWorkIndicator: it gets ids, not whole jobs, so it cannot start
   * showing live state of its own). The prompt needs the whole job — trigger,
   * streak, spend rail, history — so the list is read once at click time, for
   * this row only. A failed read says so and leaves the conversation alone.
   */
  const investigate = async (failure: UnseenFailure) => {
    const api = window.electronAPI
    if (!api?.automationList) {
      addToast('error', t('automation.investigate.unavailable', { name: failure.jobName }))
      return
    }
    setInvestigatingJobId(failure.jobId)
    try {
      const result = await api.automationList()
      const jobs: AutomationJobData[] = Array.isArray(result?.jobs) ? result.jobs : []
      const job = jobs.find(candidate => candidate.id === failure.jobId)
      if (!job) {
        addToast('warning', t('automation.investigate.unavailable', { name: failure.jobName }))
        return
      }
      const record = (job.history ?? []).find(r => r.startedAt === failure.startedAt) ?? null
      const text = buildInvestigatePrompt({ job, record })
      // The same new-conversation call the app menu's New Session and the
      // command palette's New conversation make. The question then waits in the
      // composer; this never sends it.
      useChatStore.getState().clearMessages()
      useUiStore.getState().setActiveNavItem('chat')
      useUiStore.getState().prefillComposer(text)
      onClose()
      addToast('success', t('automation.investigate.prepared', { name: job.name }))
    } catch (err) {
      console.error('[AIPA] Could not prepare a question about a failed run', err)
      addToast('error', t('automation.investigate.unavailable', { name: failure.jobName }))
    } finally {
      setInvestigatingJobId(null)
    }
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

  // The batch block outlives the rows it acted on. Starting the jobs clears
  // their holds on the next reload, and the result line is exactly what should
  // still be readable then; the button reappears only when two are held again.
  const showHeldBatch = heldCount >= 2
    || batchPhase.kind === 'running' || batchPhase.kind === 'done'

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
        // A little wider while a request is held: commands and paths are shown
        // unabridged, and 300px wraps most of them into an unreadable column.
        width: waiting.length > 0 ? 340 : 300,
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

      {waiting.length > 0 && (
        // First, above failures: these are the only rows where the app is
        // stopped and the user is the thing it is waiting for. A failure can be
        // read later; a held request loses its run after a stated deadline.
        <Group title={t('statusBar.background.waitingGroup')}>
          {waiting.map(({ job, wait }) => {
            const key = waitingApprovalKey(job.id, wait.requestId)
            const busy = answering.has(key)
            return (
              <div
                key={key}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 3,
                  padding: '3px 6px 5px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ ...ELLIPSIS, fontWeight: 600 }}>{job.name}</span>
                  <span style={{
                    flexShrink: 0, color: 'var(--warning-text)', fontSize: 10,
                    fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
                  }}>
                    {t('statusBar.background.waitingWaited', {
                      time: formatDuration(Math.max(0, now - wait.since)),
                    })}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('statusBar.background.waitingSince', { time: timeText(wait.since) })}
                </span>
                {/* Verbatim, selectable and scrollable. This is the whole point
                    of the panel: approve what will actually run. */}
                <div
                  title={t('statusBar.background.waitingAskLabel')}
                  aria-label={t('statusBar.background.waitingAskLabel')}
                  style={APPROVAL_SUBJECT}
                >
                  {wait.subject}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <ApprovalButton
                    tone="approve"
                    label={t('statusBar.background.waitingApprove')}
                    ariaLabel={t('statusBar.background.waitingApproveAria', { name: job.name })}
                    busy={busy}
                    onClick={() => { void answerApproval({ job, wait }, true) }}
                  />
                  <ApprovalButton
                    tone="deny"
                    label={t('statusBar.background.waitingDeny')}
                    ariaLabel={t('statusBar.background.waitingDenyAria', { name: job.name })}
                    busy={busy}
                    onClick={() => { void answerApproval({ job, wait }, false) }}
                  />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {t('statusBar.background.waitingTimeout', {
                    minutes: RUN_APPROVAL_TIMEOUT_MINUTES,
                  })}
                </span>
              </div>
            )
          })}
          <span style={{
            fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4,
            padding: '3px 6px 2px',
          }}>
            {t('statusBar.background.waitingOnce')}
          </span>
        </Group>
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
                onRunAgain={() => { void runAgain(failure) }}
                runAria={t('statusBar.background.runAgainAria', { name: failure.jobName })}
                // States the exemptions rather than staying silent about them:
                // this panel can show "Paused" above a row that still starts.
                runTitle={t('statusBar.background.runAgainTitle', { name: failure.jobName })}
                runBusyTitle={t('statusBar.background.runAgainWhileRunning', { name: failure.jobName })}
                onInvestigate={() => { void investigate(failure) }}
                investigateAria={t('automation.investigate.aria', { name: failure.jobName })}
                investigateTitle={t('automation.investigate.title')}
                investigating={investigatingJobId === failure.jobId}
                running={runningJobIds.has(failure.jobId)}
                starting={startingJobs.has(failure.jobId)}
                alwaysShowAction={!hoverCapable}
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

      {(held.rows.length > 0 || showHeldBatch) && (
        <Group title={t('statusBar.background.heldJobs')}>
          {held.rows.map(hold => {
            // Resolve against the same tree Settings uses. A node that no
            // longer exists and a job filed nowhere are distinct states, and
            // both are said in words rather than as a raw id.
            const department = resolveJobDepartment(hold.departmentId, departmentOptions)
            const departmentText = department.state === 'found'
              ? department.label
              : department.state === 'stale'
                ? t('automation.department.missingOption')
                : t('automation.department.none')
            const departmentTitle = department.state === 'found'
              ? t('automation.department.rowTitle', { path: department.path })
              : department.state === 'stale'
                ? t('automation.department.missingHint')
                : t('automation.department.hint')
            return (
              <HeldRow
                key={`${hold.job.id}:${hold.at}`}
                hold={hold}
                time={relativeTimeText(hold.at, t, now)}
                department={departmentText}
                departmentTitle={departmentTitle}
                title={openSettingsLabel}
                onClick={openAutomations}
                onRunNow={() => { void startRun(hold.job.id, hold.job.name) }}
                runAria={t('statusBar.background.runHeldAria', { name: hold.job.name })}
                // The cap is why the run stopped and Run now is why it may
                // start: that exemption belongs in the tooltip, not the row.
                runTitle={t('statusBar.background.runHeldTitle', { name: hold.job.name })}
                runBusyTitle={t('statusBar.background.runHeldWhileRunning', { name: hold.job.name })}
                running={runningJobIds.has(hold.job.id)}
                starting={startingJobs.has(hold.job.id)}
                alwaysShowAction={!hoverCapable}
              />
            )
          })}
          {/* Under the rows it describes: when the cap that stopped them is
              expected to free. Never "they will run then" — the occurrences are
              gone, and only the limit stops holding. */}
          {heldCaps.length === 1 && (
            <div style={{ padding: '2px 6px 1px' }}>
              <DeptBudgetFrees report={heldCaps[0]} />
            </div>
          )}
          {showHeldBatch && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              padding: '2px 6px 3px',
            }}>
              {(heldCount >= 2 || batchPhase.kind === 'running') && (
                <button
                  type="button"
                  onClick={onRunAllHeld}
                  onMouseLeave={disarmHeldBatch}
                  disabled={batchPhase.kind === 'running'}
                  aria-busy={batchPhase.kind === 'running' || undefined}
                  title={heldBatchTitle(t)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    width: '100%', padding: '4px 6px',
                    borderRadius: 6, fontSize: 11,
                    cursor: batchPhase.kind === 'running' ? 'default' : 'pointer',
                    // Arming tints the button like the warning-toned rows above:
                    // this is the deliberate spend the cap exempts, not a
                    // destructive act, so it never borrows the danger red.
                    border: `1px solid ${batchPhase.kind === 'armed' ? 'var(--warning-text)' : 'var(--border)'}`,
                    background: batchPhase.kind === 'armed' ? 'var(--bg-hover)' : 'transparent',
                    color: batchPhase.kind === 'armed'
                      ? 'var(--warning-text)'
                      : 'var(--text-secondary)',
                    opacity: batchPhase.kind === 'running' ? 0.6 : 1,
                    transition: 'all 0.12s ease',
                  }}
                >
                  {batchPhase.kind === 'running'
                    ? <Loader2 size={11} style={{ animation: 'spin 0.9s linear infinite' }} />
                    : <Play size={11} />}
                  <span>{heldBatchLabel(batchPhase, heldCount, t)}</span>
                </button>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {batchPhase.kind === 'done'
                  ? heldBatchResultText(batchPhase.outcome, t)
                  : heldBatchHint(t)}
              </span>
            </div>
          )}
          {held.hidden > 0 && (
            // Same count-and-link shape as the failures group: the panel caps
            // the list, and Settings owns the whole set.
            <button
              type="button"
              onClick={openAutomations}
              title={openSettingsLabel}
              style={{ ...ROW, color: 'var(--text-muted)', fontSize: 10 }}
              onMouseEnter={event => { event.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={event => { event.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <span>{t('statusBar.background.moreHeld', { count: held.hidden })}</span>
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
