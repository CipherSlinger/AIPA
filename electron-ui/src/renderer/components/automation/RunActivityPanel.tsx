// RunActivityPanel — one page for "what actually ran last night?".
//
// Every job keeps its own remembered runs, so with fifteen jobs the question
// has no home: the status-bar popover lists only what is in flight, retrying or
// failing unseen, and Settings -> Automations owns one job at a time. This page
// is the missing cross-job read.
//
// It is a page rather than a Settings tab because it spans every job — the page
// that owns one job at a time is the wrong owner — and it has no nav-rail icon
// because it is an after-the-fact surface reached from the status bar and the
// command palette, not a place to work.
//
// Everything here comes from the stored record. The list is bounded in main;
// the header and the footer say so, because a list that silently stops would
// read as "this is everything that happened".

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, Clock, Inbox, ListChecks, Play, Search, Sparkles, X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import type {
  AutomationJobData,
  AutomationRunActivityData,
  AutomationRunActivityRowData,
  AutomationRunApprovalData,
  AutomationRunApprovalOutcomeData,
} from '../../../preload'
import { formatTokens } from '../../utils/formatUtils'
import { costText, errorCodeText, relativeTimeText } from '../workflows/scheduleSummary'
import { EmptyState, Pill } from '../archive/ArchiveChrome'
import { ELLIPSIS } from '../archive/archiveRecord'
import { approvalClause, approvalTone, approvalTooltip } from './runApproval'
import { prepareRunActivityInvestigation, prepareRunInvestigation } from './investigateRun'
import {
  RUN_ACTIVITY_SOURCES,
  RUN_ACTIVITY_STATUSES,
  RUN_ACTIVITY_WINDOWS,
  runActivityDurationText,
  runActivityEmptyState,
  runActivityJobChoices,
  runActivityJobExists,
  runActivityRefusalText,
  runActivityRunAgainState,
  runActivitySourceText,
  runActivityStatusText,
  runActivitySummaryText,
  runActivityWindowCutText,
  viewRunActivity,
  type RunActivityFilter,
  type RunActivityRunAgainState,
  type RunActivitySource,
  type RunActivityStatus,
  type RunActivityWindow,
} from './runActivity'

/**
 * The glyph of one held-request clause, chosen by tone.
 *
 * Settings -> Automations draws the same marks in its run history; the mapping
 * is repeated rather than imported so this lazily-loaded page does not pull the
 * whole Settings page into its chunk. Colour alone cannot separate a timeout
 * from a denial, so the glyph is what carries that difference.
 */
function approvalMark(
  outcome: AutomationRunApprovalOutcomeData,
): { color?: string; icon: React.ReactNode } {
  switch (approvalTone(outcome)) {
    case 'approved': return { color: 'var(--success-text)', icon: <Check size={9} aria-hidden /> }
    case 'denied': return { icon: <X size={9} aria-hidden /> }
    case 'expired': return { color: 'var(--warning-text)', icon: <Clock size={9} aria-hidden /> }
    case 'refused': return { color: 'var(--warning-text)', icon: <AlertTriangle size={9} aria-hidden /> }
    case 'interrupted': return { color: 'var(--danger-text)', icon: <AlertTriangle size={9} aria-hidden /> }
  }
}

/** Main's chain depth default, repeated for the one note word that names it. */
const CHAIN_MAX_DEPTH_FALLBACK = 4

const FILTER_FIELD: React.CSSProperties = {
  height: 24, boxSizing: 'border-box', padding: '0 8px',
  borderRadius: 8, fontSize: 11, maxWidth: 200,
  border: '1px solid var(--border)', background: 'var(--bg-hover)',
  color: 'var(--text-secondary)', cursor: 'pointer',
  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
}

const QUIET_LINK: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  font: 'inherit', fontSize: 11, color: 'var(--text-muted)',
  cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
}

/** A per-row action, quiet enough to sit beside the facts it acts on. */
const ROW_ACTION: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  background: 'none', border: 'none', padding: 0,
  font: 'inherit', fontSize: 11, color: 'var(--accent-text)',
  cursor: 'pointer',
}

const ASK_BUTTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 24, flexShrink: 0, padding: '0 9px', borderRadius: 8,
  border: '1px solid var(--accent-border)', background: 'var(--accent-bg)',
  color: 'var(--accent-text)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
}

interface RunRowProps {
  row: AutomationRunActivityRowData
  t: ReturnType<typeof useI18n>['t']
  resolvedLocale: 'en' | 'zh-CN'
  investigating: boolean
  /** Whether the live job list lets this row be started / opened at all. */
  runAgain: RunActivityRunAgainState
  canOpenJob: boolean
  starting: boolean
  started: boolean
  onOpen: () => void
  onInvestigate: () => void
  onRunAgain: () => void
  onOpenJob: () => void
}

function RunRow({
  row, t, resolvedLocale, investigating, runAgain, canOpenJob, starting, started,
  onOpen, onInvestigate, onRunAgain, onOpenJob,
}: RunRowProps) {
  const { run, jobId, jobName } = row
  const state = runActivityStatusText(run, t)
  const duration = runActivityDurationText(run.durationMs, t)
  const usage = run.usage
  const tokens = usage ? usage.inputTokens + usage.outputTokens : 0
  const cost = usage?.costUsd !== undefined && usage.costUsd > 0 ? costText(usage.costUsd) : null
  // A skip's status already says why it did not run; only a failure carries an
  // extra sentence, and it is the stored code translated when the locale knows
  // it.
  const detail = run.status === 'error' && run.error ? errorCodeText(run.error, t) : ''
  const when = new Date(run.startedAt).toLocaleString(resolvedLocale)
  const sessionId = run.sessionId ?? null
  const openLabel = sessionId
    ? t('automation.runActivity.row.openTranscript')
    : t('automation.runActivity.row.openJob', { name: jobName })

  // A start is offered only while the job can accept one. Running and missing
  // work are disabled with a reason; a deleted job (or a job list that could
  // not be read) has no action at all — the row keeps its record, but there is
  // no live target to act on.
  const showRunAgain = runAgain.kind === 'available'
    || runAgain.kind === 'running'
    || runAgain.kind === 'missing-action'
  const runAgainTitle = runAgain.kind === 'available'
    ? t('automation.runActivity.row.runAgainHint')
    : runAgain.kind === 'running'
      ? t('automation.runActivity.row.runAgainRunning')
      : t('automation.runActivity.row.runAgainMissingAction')
  const runAgainDisabled = runAgain.kind !== 'available' || starting

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      // Keys pressed inside a nested control belong to that control: Ask AIPA
      // must not additionally open the row behind it.
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      className="row-focus-inset"
      title={openLabel}
      aria-label={`${jobName} — ${state.text} — ${when}. ${openLabel}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        padding: '8px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-active)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span
          style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 122 }}
          title={relativeTimeText(run.startedAt, t)}
        >
          {when}
        </span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600,
          color: 'var(--text-primary)', ...ELLIPSIS,
        }}>
          {jobName}
        </span>
        {/* How the run came due. A record written before main stored it says
            "not recorded" rather than "scheduled". */}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
          {runActivitySourceText(run.source, t)}
        </span>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8,
        fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
      }}>
        <span style={{ color: state.color }} title={detail || undefined}>
          {state.text}{detail ? `: ${detail}` : ''}
        </span>
        {run.retry !== undefined && (
          <span style={{ color: 'var(--accent-text)' }}>
            {t('automation.retry.badge', { attempt: run.retry })}
          </span>
        )}
        {(run.approvals ?? []).map((approval: AutomationRunApprovalData, index) => {
          const mark = approvalMark(approval.outcome)
          return (
            <span
              key={`${approval.askedAt}-${index}`}
              title={approvalTooltip(approval, t)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: mark.color }}
            >
              <span style={{ display: 'inline-flex', flexShrink: 0 }}>{mark.icon}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {approvalClause(approval, t, ms => runActivityDurationText(ms, t))}
              </span>
            </span>
          )
        })}
        {run.chain?.nextJobId && (
          <span style={{ color: 'var(--accent-text)' }} title={t('automation.chain.historyStartedHint')}>
            {t('automation.chain.historyStarted', {
              name: run.chain.nextJobName ?? run.chain.nextJobId,
            })}
          </span>
        )}
        {run.chain?.note && (
          <span style={{ color: 'var(--warning-text)' }} title={t('automation.chain.noteHint')}>
            {t(`automation.chain.note.${run.chain.note}`, { depth: CHAIN_MAX_DEPTH_FALLBACK })}
          </span>
        )}
        {duration && <span>{duration}</span>}
        {tokens > 0 && <span>{t('automation.usage.tokens', { count: formatTokens(tokens) })}</span>}
        {cost && <span>{cost}</span>}
        {run.late && <span>{t('automation.ranLate')}</span>}
        {sessionId && (
          // The transcript this run left. The row itself opens it; the id is
          // shown so a run can be matched against a folder listing.
          <span style={{ color: 'var(--text-subtle)' }} title={sessionId}>
            {t('automation.runActivity.row.session', { id: sessionId.slice(0, 8) })}
          </span>
        )}
        {run.status === 'error' && (
          // Same drafted-question path Settings and the popover use; this page
          // must not grow a second version of it.
          <button
            type="button"
            disabled={investigating}
            onClick={e => { e.stopPropagation(); onInvestigate() }}
            title={t('automation.investigate.title')}
            aria-label={t('automation.investigate.aria', { name: jobName })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'none', border: 'none', padding: 0, marginLeft: 'auto',
              font: 'inherit', fontSize: 11, color: 'var(--accent-text)',
              cursor: investigating ? 'default' : 'pointer',
              opacity: investigating ? 0.6 : 1,
            }}
          >
            <Sparkles size={10} />
            {t('automation.investigate.ask')}
          </button>
        )}

        {(showRunAgain || canOpenJob || started) && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            // With a failure's Ask AIPA already on the right, these follow it;
            // without one they claim the row's right edge themselves.
            marginLeft: run.status === 'error' ? 10 : 'auto',
          }}>
            {showRunAgain && (
              <button
                type="button"
                disabled={runAgainDisabled}
                onClick={e => {
                  e.stopPropagation()
                  if (runAgain.kind === 'available') onRunAgain()
                }}
                title={runAgainTitle}
                aria-label={`${t('automation.runActivity.row.runAgain')} — ${jobName}`}
                style={{
                  ...ROW_ACTION,
                  cursor: runAgainDisabled ? 'default' : 'pointer',
                  opacity: runAgainDisabled ? 0.55 : 1,
                }}
              >
                <Play size={10} />
                {starting
                  ? t('automation.runActivity.row.starting')
                  : t('automation.runActivity.row.runAgain')}
              </button>
            )}
            {canOpenJob && (
              // Only a job present in a successful live read gets this. A
              // deleted job's row keeps its record but has no target here.
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onOpenJob() }}
                title={t('automation.runActivity.row.openJob', { name: jobName })}
                style={ROW_ACTION}
              >
                {t('automation.runActivity.row.openJobLabel')}
              </button>
            )}
            {started && (
              // The new run has not finished, so it is not a row yet. Say it
              // started on the row the user clicked instead of inventing one.
              <span style={{ fontSize: 10, color: 'var(--success-text)' }}>
                {t('automation.runActivity.row.runStarted')}
              </span>
            )}
          </span>
        )}
      </div>

      {/* The job id is not decoration: a renamed job keeps one row name, and
          two jobs can share a name. Hidden from the row, kept on it. */}
      <span hidden data-job-id={jobId} />
    </div>
  )
}

export default function RunActivityPanel() {
  const { t, resolvedLocale } = useI18n()
  const addToast = useUiStore(s => s.addToast)
  const [data, setData] = useState<AutomationRunActivityData | null>(null)
  // `null` means "the live job list is not known" — a failed read, or the first
  // one still in flight. Per-row actions that need a live job are withheld
  // until a successful read says which jobs exist.
  const [jobs, setJobs] = useState<AutomationJobData[] | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<RunActivityStatus>('all')
  const [source, setSource] = useState<RunActivitySource>('all')
  const [jobId, setJobId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // The page's own copy calls this "run history" and "every job's remembered
  // runs, newest first": "newest first" orders the whole remembered set, it
  // does not promise that only recent runs matter. So the default is `all` —
  // opening the page must not silently hide older runs the footer still counts.
  const [windowRange, setWindowRange] = useState<RunActivityWindow>('all')
  const [investigating, setInvestigating] = useState<string | null>(null)
  const [starting, setStarting] = useState<Set<string>>(() => new Set())
  const [started, setStarted] = useState<Record<string, true>>({})
  const seqRef = useRef(0)
  const startedTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = startedTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const load = useCallback(async () => {
    const request = ++seqRef.current
    try {
      const api = window.electronAPI
      const result = await api.automationRunActivity()
      // An event-triggered refetch can land before an older response; only the
      // newest request may write, or the list would move backwards.
      if (request !== seqRef.current) return
      if (!result || !Array.isArray(result.rows)) throw new Error('unreadable run activity')

      // The run list is the page; the job list only decides which row actions
      // are honest. Its failure must not turn a readable run list into an
      // unreadable page, so it degrades to "no per-row actions" instead.
      let nextJobs: AutomationJobData[] | null = null
      try {
        const listed = api.automationList ? await api.automationList() : null
        if (listed && Array.isArray(listed.jobs)) nextJobs = listed.jobs
      } catch (err) {
        console.error('[AIPA] Could not read automation jobs for run-row actions', err)
      }

      if (request !== seqRef.current) return
      setData(result)
      setJobs(nextJobs)
      setReadFailed(false)
    } catch (err) {
      console.error('[AIPA] Could not read the cross-job run list', err)
      // The header, the chips and the body must agree. Keeping the previous
      // rows beside a "could not be read" state would be two answers at once,
      // so a failed read drops them and the page says what it knows: nothing.
      if (request === seqRef.current) {
        setReadFailed(true)
        setData(null)
        setJobs(null)
      }
    } finally {
      if (request === seqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // The scheduler pushes this after every state change, including runs it
    // started on its own clock while this page was open.
    return window.electronAPI.onAutomationChanged(() => { void load() })
  }, [load])

  const rows = useMemo(() => data?.rows ?? [], [data])

  // A job can be deleted or lose its last remembered run between reads. A
  // selector value that names nothing would filter the whole page to an empty
  // result and look like a bug.
  const filter: RunActivityFilter = useMemo(
    () => ({ status, source, jobId, query }),
    [status, source, jobId, query],
  )
  const view = useMemo(
    () => viewRunActivity(rows, filter, windowRange, Date.now()),
    [rows, filter, windowRange],
  )
  const choices = useMemo(() => runActivityJobChoices(view.windowed), [view.windowed])

  useEffect(() => {
    if (jobId !== null && !choices.some(choice => choice.id === jobId)) setJobId(null)
  }, [choices, jobId])

  const emptyState = runActivityEmptyState({
    readFailed,
    loaded: rows.length,
    total: data?.total ?? 0,
    visible: view.visible.length,
    windowRows: view.windowRows,
    window: windowRange,
  })

  const clearFilters = () => {
    setStatus('all')
    setSource('all')
    setJobId(null)
    setQuery('')
  }

  const openRow = (row: AutomationRunActivityRowData) => {
    if (row.run.sessionId) {
      // The app-level bridge owns opening a transcript; the same event the
      // archive, the palette and Settings dispatch.
      window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: row.run.sessionId }))
      return
    }
    // No transcript: the job that remembers this run is the only place with
    // more context, so land on its row in Settings. A deleted job has no row
    // to land on, so the click does nothing rather than opening a dead target.
    if (!runActivityJobExists(row.jobId, jobs)) return
    useUiStore.getState().focusAutomationJob(row.jobId)
  }

  const investigate = async (row: AutomationRunActivityRowData) => {
    const key = `${row.jobId}\u0000${row.run.startedAt}`
    setInvestigating(key)
    try {
      await prepareRunInvestigation({
        jobId: row.jobId,
        jobName: row.jobName,
        startedAt: row.run.startedAt,
        t,
        addToast,
      })
    } finally {
      setInvestigating(null)
    }
  }

  const markStarted = (key: string) => {
    setStarted(prev => (prev[key] ? prev : { ...prev, [key]: true }))
    const existing = startedTimers.current.get(key)
    if (existing) clearTimeout(existing)
    // The confirmation belongs to the click, not to the record forever: clear
    // it after a few seconds, by which time a real run has usually produced its
    // own state change.
    const timer = setTimeout(() => {
      setStarted(prev => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
      startedTimers.current.delete(key)
    }, 12_000)
    startedTimers.current.set(key, timer)
  }

  /**
   * Start a job from its remembered run.
   *
   * A manual run is exempt from the global pause by design, so this path is
   * allowed even while other runs are paused; the tooltip says so before the
   * click. A refusal is reported in words, and a run the scheduler accepted but
   * could not actually start is caught by `result.job.running` — the same test
   * the status-bar panel uses.
   */
  const startRun = async (row: AutomationRunActivityRowData, key: string) => {
    const api = window.electronAPI
    if (!api?.automationRunNow) {
      addToast('error', runActivityRefusalText('unexpected_error', row.jobName, t))
      return
    }
    setStarting(prev => new Set(prev).add(key))
    try {
      const result = await api.automationRunNow(row.jobId)
      if (!result.ok) {
        addToast('warning', runActivityRefusalText(result.error, row.jobName, t))
        return
      }
      if (!result.job.running) {
        addToast('warning', runActivityRefusalText(
          result.job.lastError ?? 'unexpected_error',
          row.jobName,
          t,
        ))
        return
      }
      // No row is appended: the list is the stored record, and a run in flight
      // is not a record yet. The row that was clicked says the start happened.
      markStarted(key)
      addToast('success', t('statusBar.background.runStarted', { name: row.jobName }))
    } catch (err) {
      console.error('[AIPA] Could not start a run from the run history', err)
      addToast('error', runActivityRefusalText('unexpected_error', row.jobName, t))
    } finally {
      setStarting(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const askAboutRuns = () => {
    prepareRunActivityInvestigation({
      rows: view.visible,
      window: windowRange,
      filter,
      loaded: rows.length,
      total: data?.total ?? 0,
      cap: data?.cap ?? 500,
      t,
      addToast,
    })
  }

  // The header names the bounds: what the window/filter leave on screen, what
  // the window kept, and what main loaded against what is remembered. The
  // footer repeats the parts a reader is most likely to get wrong (the per-job
  // bound, the 500-row cap, and that deleted jobs took their runs with them).
  const summary = runActivitySummaryText({
    shown: view.visible.length,
    windowRows: view.windowRows,
    window: windowRange,
    loaded: rows.length,
    total: data?.total ?? 0,
  }, t)

  const windowCut = runActivityWindowCutText(view.windowHidden, rows.length, t)

  const filtered = filter.status !== 'all'
    || filter.source !== 'all'
    || filter.jobId !== null
    || filter.query.trim().length > 0

  // Nothing on screen means there is no set to ask about. The draft would
  // describe a window and filters that match nothing, which is not a question.
  const askDisabled = loading || data === null || view.visible.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
        }}>
          <ListChecks size={14} color="var(--accent-text)" />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
          {t('automation.runActivity.title')}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', ...ELLIPSIS }} title={summary}>
          {summary}
        </span>
        <button
          type="button"
          disabled={askDisabled}
          onClick={askAboutRuns}
          title={askDisabled
            ? t('automation.runActivity.ask.nothing')
            : t('automation.runActivity.ask.title')}
          aria-label={t('automation.runActivity.ask.action')}
          style={{
            ...ASK_BUTTON,
            cursor: askDisabled ? 'default' : 'pointer',
            opacity: askDisabled ? 0.5 : 1,
          }}
        >
          <Sparkles size={11} />
          {t('automation.runActivity.ask.action')}
        </button>
        {view.hidden > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-subtle)', flexShrink: 0 }}>
            {t(view.hidden === 1 ? 'automation.runActivity.hiddenOne' : 'automation.runActivity.hidden', {
              count: view.hidden,
            })}
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{
        flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <select
          value={windowRange}
          onChange={e => setWindowRange(e.target.value as RunActivityWindow)}
          aria-label={t('automation.runActivity.window.aria')}
          style={FILTER_FIELD}
        >
          {RUN_ACTIVITY_WINDOWS.map(value => (
            <option key={value} value={value}>
              {t(`automation.runActivity.window.${value}`)}
            </option>
          ))}
        </select>

        <select
          value={jobId ?? ''}
          onChange={e => setJobId(e.target.value === '' ? null : e.target.value)}
          aria-label={t('automation.runActivity.filter.jobAria')}
          style={FILTER_FIELD}
        >
          <option value="">{t('automation.runActivity.filter.jobAll')}</option>
          {choices.map(choice => (
            <option key={choice.id} value={choice.id}>
              {t('automation.runActivity.filter.jobOption', { name: choice.name, count: choice.count })}
            </option>
          ))}
        </select>

        {RUN_ACTIVITY_STATUSES.map(chip => (
          <Pill
            key={chip}
            active={status === chip}
            onClick={() => setStatus(chip)}
            // Counts describe the rows in the window, never the filter's
            // result: a chip that changed its own number when clicked would be
            // counting something else than what it names.
            title={t(windowRange === 'all'
              ? 'automation.runActivity.chipHint'
              : 'automation.runActivity.chipHintWindowed')}
          >
            {`${t(`automation.runActivity.chip.${chip}`)} ${view.counts[chip]}`}
          </Pill>
        ))}

        <span aria-hidden="true" style={{ width: 1, height: 14, flexShrink: 0, background: 'var(--border)' }} />

        <select
          value={source}
          onChange={e => setSource(e.target.value as RunActivitySource)}
          aria-label={t('automation.runActivity.filter.sourceAria')}
          style={FILTER_FIELD}
        >
          {RUN_ACTIVITY_SOURCES.map(value => (
            <option key={value} value={value}>
              {t(`automation.runActivity.source.${value}`)}
            </option>
          ))}
        </select>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 140,
          height: 24, boxSizing: 'border-box', padding: '0 9px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-hover)',
          transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        }}>
          <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('automation.runActivity.searchPlaceholder')}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onFocus={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = '0 0 0 2px var(--accent-bg)'
                bar.style.borderColor = 'var(--accent-border)'
              }
            }}
            onBlur={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'none'
                bar.style.borderColor = 'var(--border)'
              }
            }}
            style={{
              flex: 1, minWidth: 0, background: 'none', border: 'none',
              color: 'var(--text-primary)', fontSize: 11,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('automation.runActivity.clearSearch')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
            >
              <X size={10} />
            </button>
          )}
        </div>

        {filtered && (
          <button onClick={clearFilters} className="archive-hover-link" style={QUIET_LINK}>
            {t('automation.runActivity.clearFilters')}
          </button>
        )}
      </div>

      {/* List. The first read says it is reading rather than "no runs yet": an
          empty state shown before the answer arrives would be a false fact. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && data === null && !readFailed ? (
          <div style={{ padding: '20px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
            {t('automation.runActivity.loading')}
          </div>
        ) : emptyState === 'none' ? view.visible.map(row => {
          const key = `${row.jobId}\u0000${row.run.startedAt}`
          return (
            <RunRow
              key={key}
              row={row}
              t={t}
              resolvedLocale={resolvedLocale}
              investigating={investigating === key}
              runAgain={runActivityRunAgainState(row.jobId, jobs)}
              canOpenJob={runActivityJobExists(row.jobId, jobs)}
              starting={starting.has(key)}
              started={started[key] === true}
              onOpen={() => openRow(row)}
              onInvestigate={() => { void investigate(row) }}
              onRunAgain={() => { void startRun(row, key) }}
              onOpenJob={() => { useUiStore.getState().focusAutomationJob(row.jobId) }}
            />
          )
        }) : (
          <EmptyState
            icon={emptyState === 'unreadable'
              ? <AlertTriangle size={22} color="var(--warning-text)" />
              : emptyState === 'no-window'
                ? <Clock size={22} color="var(--text-muted)" />
                : emptyState === 'no-match'
                  ? <Search size={22} color="var(--text-muted)" />
                  : <Inbox size={22} color="var(--text-muted)" />}
            title={t(`automation.runActivity.empty.${emptyState}.title`)}
            hint={t(`automation.runActivity.empty.${emptyState}.hint`, {
              perJob: data?.perJob ?? 20,
              label: windowRange === 'all'
                ? ''
                : t(`automation.runActivity.window.label.${windowRange}`),
            })}
            onClear={emptyState === 'no-window'
              ? () => setWindowRange('all')
              : emptyState === 'no-match'
                ? clearFilters
                : emptyState === 'unreadable'
                  ? () => { void load() }
                  : undefined}
            clearLabel={emptyState === 'no-window'
              ? t('automation.runActivity.empty.no-window.showAll')
              : emptyState === 'no-match'
                ? t('automation.runActivity.clearFilters')
                : emptyState === 'unreadable'
                  ? t('automation.runActivity.retry')
                  : undefined}
          />
        )}
      </div>

      {/* The bound, in the page's own words. It sits below the scroller so it
          can never be mistaken for a row and never scrolls out of sight. The
          window's cut is stated beside it rather than folded into a count. */}
      <div style={{
        flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        padding: '7px 16px', borderTop: '1px solid var(--border)',
        fontSize: 10, color: 'var(--text-subtle)', lineHeight: 1.5,
      }}>
        <span>
          {t('automation.runActivity.capNote', { perJob: data?.perJob ?? 20, cap: data?.cap ?? 500 })}
        </span>
        {windowCut && <span>· {windowCut}</span>}
        {!loading && data !== null && jobs === null && (
          <span style={{ color: 'var(--warning-text)' }}>
            · {t('automation.runActivity.jobsUnreadable')}
          </span>
        )}
      </div>
    </div>
  )
}
