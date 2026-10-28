// Settings → Automations.
//
// The list and the "how it works" notes. The create/edit dialog lives in
// `../automation/AutomationDialog` because the workflow page mounts it too. All
// timing and execution live in the main process (`src/main/automation/`); this
// page only reflects state and sends CRUD requests, then waits for
// `automation:changed` instead of guessing what the scheduler did.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlarmClock, AlertTriangle, Clock, Copy, History, Pause, Pencil, Play, Plus, Puzzle, RefreshCw, RotateCcw, Search, Sparkles, Trash2, Wallet, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { usePluginStore } from '../../store/pluginStore'
import { getPluginDisplayName } from '../plugins/pluginIcons'
import SettingsGroup from './SettingsGroup'
import { INPUT_STYLE } from './settingsConstants'
import Toggle from '../ui/Toggle'
import { formatTokens } from '../../utils/formatUtils'
import AutomationDialog, { ASSISTANT_PERSONA_ID, type WorkflowOption } from '../automation/AutomationDialog'
import { scheduleText, watchWarningText } from '../automation/scheduleText'
import { nextRunText } from '../automation/nextRunText'
import {
  JOB_FILTER_STATUSES,
  countJobsByStatus,
  hasActiveFilters,
  matchesJob,
  type JobFilterStatus,
  type JobSearchContext,
} from '../automation/jobFilter'
import {
  JOB_SORT_MODES,
  sortJobs,
  type JobSortMode,
} from '../automation/jobSort'
import { buildInvestigatePrompt } from '../automation/investigatePrompt'
import { SECONDARY, WARNING, primaryButtonStyle, smallButtonStyle } from '../automation/automationStyles'
import { RUN_HISTORY_CAP, viewRunHistory } from './runHistoryView'
import type {
  AutomationJobData,
  AutomationLimitsData,
  AutomationMemoryDigestData,
  AutomationRunRecordData,
} from '../../../preload'
import type { Persona } from '../../types/app.types'

/** Which runs a job's history disclosure is currently showing, and how. */
type RunHistoryUi = { expanded: boolean; failuresOnly: boolean }

const RUN_HISTORY_UI_DEFAULT: RunHistoryUi = { expanded: false, failuresOnly: false }

/** The quiet text control under a run list ("Show all" / "Show fewer"). */
const QUIET_LINK: CSSProperties = {
  background: 'none', border: 'none', padding: 0, margin: '4px 0 0',
  font: 'inherit', fontSize: 11, color: 'var(--accent-text)', cursor: 'pointer',
}

/**
 * The filter row's reset, in the archive's quiet underlined style. It shares
 * the row with 24px fields and chips, so it carries no vertical margin of its
 * own; the empty-state call site adds spacing instead.
 */
const FILTER_LINK: CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  font: 'inherit', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
  textDecoration: 'underline', textUnderlineOffset: 3,
}

/** The expert a row should name: a person, the plain assistant, or a broken binding. */
type JobExpert =
  | { kind: 'persona'; persona: Persona; override: boolean }
  | { kind: 'assistant'; override: boolean }
  | { kind: 'missing'; override: boolean }

/**
 * Money as the engine reported it. Costs stay compact: a settings row has room
 * for `$0.03`, and very small amounts keep a third digit instead of rounding
 * away to `$0.00`.
 */
function costText(usd: number): string {
  // A reported $0 is a real report (some engines say the turn was free), and
  // "<$0.001" would read as a small charge rather than none.
  if (usd === 0) return '$0'
  if (usd < 0.001) return '<$0.001'
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * One history row keeps the error beside its outcome, but a raw engine message
 * can be arbitrarily long; the full text stays on the row's title.
 */
function clipText(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

export default function SettingsAutomations() {
  const { t, resolvedLocale } = useI18n()
  const workflows = usePrefsStore(s => s.prefs.workflows) as WorkflowOption[] | undefined
  const personas = usePrefsStore(s => s.prefs.personas) as Persona[] | undefined
  const plugins = usePluginStore(s => s.plugins)
  const addToast = useUiStore(s => s.addToast)

  const [jobs, setJobs] = useState<AutomationJobData[]>([])
  const [limits, setLimits] = useState<AutomationLimitsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<AutomationJobData | null | 'new'>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pauseBusy, setPauseBusy] = useState(false)
  // The budget field is kept as text so an empty value means "no cap" instead of
  // $0; a null draft means "show what the store says", and typing replaces it.
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const [budgetBusy, setBudgetBusy] = useState(false)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Run-history disclosure state, keyed by job id: one job showing every run
  // must never reopen another job expanded, and a job that disappears takes
  // its entry with it on the next interaction rather than leaking into a new
  // job that happens to reuse the slot.
  const [runHistoryUi, setRunHistoryUi] = useState<Record<string, RunHistoryUi>>({})
  // The filter row is page-local: no pref is written, so opening Settings a
  // second time starts from the whole list. Keeping it out of the store also
  // means none of the row/dialog actions below have to know it exists.
  const [filterText, setFilterText] = useState('')
  const [filterStatuses, setFilterStatuses] = useState<JobFilterStatus[]>([])
  // Ordering is page-local for the same reason as the filter row: no pref is
  // written and opening Settings again starts from "Next run". Because it lives
  // in component state rather than being derived from the list payload, a
  // scheduler refresh re-sorts the new jobs with the mode the user already
  // chose instead of snapping back to the default.
  const [sortMode, setSortMode] = useState<JobSortMode>('nextRun')

  // The pause travels in the scheduler's limits payload; a null payload (the
  // list call failed) reads as not paused rather than inventing a banner.
  const pausedAll = limits?.pausedAll === true
  // Only enabled jobs are affected by a pause: a job already switched off is
  // not suspended a second time, and counting it would overstate the damage.
  const enabledCount = jobs.filter(job => job.enabled).length

  // The one daily cap across every job. `globalSpend` is derived by the main
  // process at list time from the same jobs, so it is safe to show beside them.
  const globalLimit = limits?.globalDailyCostLimitUsd
  const globalSpend = limits?.globalSpend
  const budgetText = budgetDraft ?? (globalLimit !== undefined ? String(globalLimit) : '')

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
   * A job's origin plugin, as a badge label. An uninstalled plugin is not an
   * error: the job outlives it, so the raw id stands in and the tooltip says
   * the name is gone. The lookup never affects the row's controls — a
   * plugin-made job is edited and deleted like any other.
   */
  const pluginOrigin = useCallback((id: string): { name: string; installed: boolean } => {
    const plugin = plugins.find(p => p.manifest.id === id)
    return plugin
      ? { name: getPluginDisplayName(plugin.manifest, resolvedLocale), installed: true }
      : { name: id, installed: false }
  }, [plugins, resolvedLocale])

  /**
   * The expert that will actually run this job: its own override first, then
   * the workflow's binding. `missing` stays truthful for a deleted persona in
   * either place, and `override` lets the row say which of the two it is.
   * Null means no chip: nothing is bound, so the plain assistant runs.
   */
  const jobExpert = useCallback((job: AutomationJobData): JobExpert | null => {
    const overrideId = typeof job.personaId === 'string' ? job.personaId.trim() : ''
    if (overrideId) {
      if (overrideId === ASSISTANT_PERSONA_ID) return { kind: 'assistant', override: true }
      const persona = (personas || []).find(p => p.id === overrideId)
      return persona
        ? { kind: 'persona', persona, override: true }
        : { kind: 'missing', override: true }
    }
    const action = job.action
    if (action.kind !== 'workflow') return null
    const workflow = (workflows || []).find(w => w.id === action.workflowId)
    if (!workflow?.personaId) return null
    const persona = (personas || []).find(p => p.id === workflow.personaId)
    return persona
      ? { kind: 'persona', persona, override: false }
      : { kind: 'missing', override: false }
  }, [workflows, personas])

  /**
   * The job facts the pure predicate cannot derive on its own.
   *
   * The schedule sentence is localized and the workflow/persona names live in
   * other stores, so they are resolved here and handed over as plain strings.
   * The predicate stays React-free and the filter row cannot drift from the
   * row's own wording: both call the same `scheduleText` / `jobExpert`.
   */
  const searchContextFor = useCallback((job: AutomationJobData): JobSearchContext => {
    const expert = jobExpert(job)
    return {
      workflowName: job.action.kind === 'workflow'
        ? workflowName(job.action.workflowId) ?? null
        : null,
      scheduleSentence: scheduleText(t, job.trigger),
      personaName: expert?.kind === 'persona' ? expert.persona.name : null,
    }
  }, [jobExpert, workflowName, t])

  const filterQuery = useMemo(
    () => ({ text: filterText, statuses: filterStatuses }),
    [filterText, filterStatuses],
  )
  const filteredJobs = useMemo(
    () => jobs.filter(job => matchesJob(job, filterQuery, searchContextFor(job))),
    [jobs, filterQuery, searchContextFor],
  )
  // Filter first, then order: sorting the whole list and filtering afterwards
  // would give the same rows, but this way the count, the empty state and the
  // sort all talk about the same filtered set. The comparator never mutates
  // `filteredJobs`, so the memo remains safe to reuse.
  const sortedJobs = useMemo(
    () => sortJobs(filteredJobs, sortMode, { now: Date.now(), locale: resolvedLocale }),
    [filteredJobs, sortMode, resolvedLocale],
  )
  // Counts see the text query but not the status selection, so a chip shows
  // what clicking it would add rather than zeroing itself out.
  const statusCounts = useMemo(
    () => countJobsByStatus(jobs, filterQuery, searchContextFor),
    [jobs, filterQuery, searchContextFor],
  )
  const filtersActive = hasActiveFilters(filterQuery)
  // Escape and the two reset buttons all land here; clearing is one state
  // update per dimension so React never renders a half-reset row.
  const clearFilters = () => {
    setFilterText('')
    setFilterStatuses([])
  }

  const timeText = (ts: number): string => new Date(ts).toLocaleString(resolvedLocale)

  const errorText = useCallback((code: string | null): string => {
    if (!code) return ''
    const key = `automation.errors.${code}`
    const translated = t(key)
    return translated === key ? code : translated
  }, [t])

  /** One past run's outcome, in the same words the status line uses. */
  const runStatus = useCallback((record: AutomationRunRecordData): { text: string; color: string } => {
    if (record.status === 'success') return { text: t('automation.status.success'), color: 'var(--success-text)' }
    if (record.status === 'skipped') {
      // The generic skip label names the hourly cap; a spend-stop must say so
      // instead, or the row would blame the wrong rail. The global budget gets
      // its own words: the job's own limit may not even be set. A miss the job
      // chose to skip says so too, or it would read as the hourly cap firing.
      const text = record.error === 'global_budget_exceeded'
        ? t('automation.status.globalBudgetSkipped')
        : record.error === 'budget_exceeded'
          ? t('automation.status.budgetSkipped')
          : record.error === 'missed_while_closed'
            ? t('automation.status.missedSkipped')
            : t('automation.status.skipped')
      return { text, color: WARNING }
    }
    return { text: t('automation.status.error'), color: 'var(--danger-text)' }
  }, [t])

  /** Compact duration: whole minutes once a run passes one, seconds below. */
  const durationText = useCallback((ms: number | null): string | null => {
    if (ms === null) return null
    if (ms < 60_000) {
      const seconds = ms / 1000
      return t('automation.history.seconds', {
        seconds: seconds < 10 ? seconds.toFixed(1).replace(/\.0$/, '') : String(Math.round(seconds)),
      })
    }
    return t('automation.history.minutes', { minutes: Math.round(ms / 60_000) })
  }, [t])

  /**
   * The memory snapshot a run saw, as one compact fact: which tiers, how many
   * characters, whether a budget clipped it. A failed read gets its own words
   * because "no memory" and "memory unavailable" are different answers to the
   * same post-mortem question. Returns null for legacy records and skips, which
   * have no digest — the row must say nothing rather than invent one.
   */
  const memoryLine = useCallback((memory: AutomationMemoryDigestData | undefined): {
    text: string
    title: string
    color?: string
    /** A successful snapshot that still skipped some files, shown separately. */
    unreadable?: { text: string; title: string }
  } | null => {
    if (!memory) return null
    if (memory.state === 'failed') {
      return {
        text: t('automation.memory.unavailable'),
        title: t('automation.memory.unavailableHint'),
        color: WARNING,
      }
    }
    // A failed whole-read keeps "memory unavailable" precedence; this clause is
    // only for a run that continued with the files it could load.
    const unreadable = memory.unreadable > 0
      ? {
          text: t('automation.memory.unreadable', { count: memory.unreadable }),
          title: t('automation.memory.unreadableHint'),
        }
      : undefined
    if (memory.tiers.length === 0 && memory.chars === 0) {
      return { text: t('automation.memory.empty'), title: t('automation.memory.emptyHint'), unreadable }
    }
    const tiers = memory.tiers.map(tier => t(`automation.memory.tier.${tier}`)).join(' · ')
    const chars = t('automation.memory.chars', { count: formatTokens(memory.chars) })
    return {
      text: tiers ? t('automation.memory.summary', { tiers, chars }) : chars,
      title: t('automation.memory.title'),
      unreadable,
    }
  }, [t])

  /**
   * Change one job's history view. The map is per job id rather than a single
   * open/closed flag so expansion cannot travel to a different row, and a
   * disclosure that is closed drops its entry entirely — reopening starts
   * from the default (five runs, no filter) rather than from a stale state.
   */
  const patchRunHistoryUi = (jobId: string, patch: Partial<RunHistoryUi>) => {
    setRunHistoryUi(prev => ({
      ...prev,
      [jobId]: { ...(prev[jobId] ?? RUN_HISTORY_UI_DEFAULT), ...patch },
    }))
  }

  const resetRunHistoryUi = (jobId: string) => {
    setRunHistoryUi(prev => {
      if (!(jobId in prev)) return prev
      const next = { ...prev }
      delete next[jobId]
      return next
    })
  }

  const openRun = (sessionId: string) => {
    // The app-level bridge owns opening: it loads the transcript, restores the
    // session's persona and working directory, and closes Settings — the same
    // path the archive and command palette take.
    window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: sessionId }))
  }

  /**
   * Turn a failure into a question, not an answer.
   *
   * Settings is not the chat view and owns no bridge, so the new conversation
   * goes through the call the app menu's New Session and the command palette's
   * New conversation already make: `clearMessages`. The question is then parked
   * in the composer's prefill channel and the chat view opens; nothing is sent
   * until the user reads it and presses Enter.
   */
  const askInvestigate = (job: AutomationJobData) => {
    const record = [...(job.history ?? [])].reverse().find(r => r.status === 'error') ?? null
    const text = buildInvestigatePrompt({ job, record })
    useChatStore.getState().clearMessages()
    useUiStore.getState().setActiveNavItem('chat')
    useUiStore.getState().prefillComposer(text)
    addToast('success', t('automation.investigate.prepared', { name: job.name }))
  }

  /**
   * The one mutation for the global switch. The scheduler owns every timing
   * decision; this call only says "suspend" or "resume", and the pushed
   * `automation:changed` event brings back the recalculated schedule.
   */
  const togglePausedAll = async () => {
    setError(null)
    setPauseBusy(true)
    try {
      const result = await window.electronAPI.automationSetPausedAll(!pausedAll)
      if (!result.ok) setError(t('automation.pauseAll.failed', { error: errorText(result.error) }))
    } catch (err) {
      setError(t('automation.pauseAll.failed', { error: String(err) }))
    } finally {
      setPauseBusy(false)
    }
  }

  /**
   * Save or clear the one daily budget. `null` is the wire-level "no cap"; an
   * emptied field saves the same thing so clearing never requires a second click
   * on a different button.
   *
   * Only values that cannot be a dollar amount are refused here. The upper bound
   * (`MAX_DAILY_COST_LIMIT_USD`) belongs to the main process, and its refusal
   * comes back as a stable code shown in this same inline slot.
   */
  const saveGlobalBudget = async (clear: boolean) => {
    if (budgetBusy) return
    setBudgetError(null)
    let value: number | null = null
    if (!clear) {
      const text = budgetText.trim()
      if (text !== '') {
        const parsed = Number(text)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setBudgetError(t('automation.budget.invalid'))
          return
        }
        value = parsed
      }
    }
    setBudgetBusy(true)
    try {
      const result = await window.electronAPI.automationSetGlobalBudget(value)
      if (result.ok) {
        // Show the normalized number (or an empty field) rather than the raw
        // draft, so "5.00" is rewritten as the value the store actually holds.
        setBudgetDraft(result.globalDailyCostLimitUsd !== undefined
          ? String(result.globalDailyCostLimitUsd)
          : '')
      } else {
        setBudgetError(errorText(result.error))
      }
    } catch (err) {
      setBudgetError(t('automation.budget.failed', { error: String(err) }))
    } finally {
      setBudgetBusy(false)
    }
  }

  /**
   * The shared window's readout.
   *
   * Same honesty rules as the per-job row: an unmeasured window says so instead
   * of printing $0, and a lower bound is prefixed with `≥` because some run in
   * the window reported no money or an evicted record may sit inside it.
   */
  const budgetReadout = ((): { text: string; notes: string[]; color: string } | null => {
    if (!globalSpend) return null
    const limitText = globalLimit !== undefined ? costText(globalLimit) : null
    if (globalSpend.measuredUsd !== undefined) {
      const lowerBound = globalSpend.partial || globalSpend.unreportedRuns > 0
      const spent = `${lowerBound ? '≥ ' : ''}${costText(globalSpend.measuredUsd)}`
      const notes: string[] = []
      if (globalSpend.unreportedRuns > 0) notes.push(t('automation.budget.lowerBoundNote'))
      if (globalSpend.partial) notes.push(t('automation.budget.partialNote'))
      return {
        text: limitText
          ? t('automation.budget.readoutWithLimit', { spent, limit: limitText })
          : t('automation.budget.readout', { spent }),
        notes,
        color: globalLimit !== undefined && globalSpend.measuredUsd + 1e-9 >= globalLimit
          ? WARNING
          : SECONDARY,
      }
    }
    if (globalSpend.unmeasured) {
      return { text: t('automation.budget.unmeasured'), notes: [], color: WARNING }
    }
    return { text: t('automation.budget.noRuns'), notes: [], color: SECONDARY }
  })()

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

  /**
   * Make a switched-off copy. No confirmation: unlike Delete this is
   * reversible (delete the copy), so a dialog would only add friction.
   *
   * The toast must not read as "now it will run too" — the copy is created
   * disabled. If the original already names a deleted workflow, the copy will
   * be flagged the same way, and the sentence says so rather than letting the
   * success message cover it.
   */
  const duplicateJob = async (job: AutomationJobData) => {
    setError(null)
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationClone(job.id)
      if (!result.ok) {
        setError(t('automation.duplicate.failed', { error: errorText(result.error) }))
        return
      }
      addToast('success', t(
        result.job.actionMissing ? 'automation.duplicate.doneActionMissing' : 'automation.duplicate.done',
        { name: result.job.name },
      ))
    } catch (err) {
      setError(t('automation.duplicate.failed', { error: String(err) }))
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
    if (job.lastStatus === 'skipped') {
      // A spend stop is still a skip, not a failure of the work; name the rail
      // that stopped it so it is not mistaken for the hourly cap. The global
      // daily budget is a different rail from the job's own limit, and a miss
      // the user chose to skip is not a rail at all.
      const text = job.lastError === 'global_budget_exceeded'
        ? t('automation.status.globalBudgetSkipped')
        : job.lastError === 'budget_exceeded'
          ? t('automation.status.budgetSkipped')
          : job.lastError === 'missed_while_closed'
            ? t('automation.status.missedSkipped')
            : t('automation.status.skipped')
      return { text: `${text} · ${when}`, color: WARNING }
    }
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

  /**
   * The spend rail on the row, shown only for a job that has one.
   *
   * The figure is the sum of costs the engines actually reported for runs
   * started in the rolling 24 hours. A window with no reported cost says so
   * instead of printing $0: Codex reports no money, and a limit that looks
   * satisfied while it cannot see the spend would be a lie.
   */
  const spendLimitLine = (job: AutomationJobData): { text: string; color: string; title: string } | null => {
    const limit = job.dailyCostLimitUsd
    if (limit === undefined) return null
    const limitText = costText(limit)
    const window = job.spendWindow
    const windowTitle = t('automation.spend.windowTitle')
    if (!window) {
      // Old job data without the derived window (e.g. a window from a moment
      // ago); the limit itself is still worth naming.
      return { text: t('automation.spend.limitOnly', { limit: limitText }), color: SECONDARY, title: windowTitle }
    }
    if (window.reportedCostUsd !== undefined) {
      // Unreported runs and evicted history both make the sum a lower bound;
      // the row marks it rather than presenting it as the whole truth.
      const lowerBound = window.partial || window.unreportedRuns > 0
      const spent = `${lowerBound ? '≥ ' : ''}${costText(window.reportedCostUsd)}`
      const notes = [windowTitle]
      if (window.unreportedRuns > 0) {
        notes.push(t('automation.spend.lowerBoundHint', { count: window.unreportedRuns }))
      }
      if (window.partial) notes.push(t('automation.spend.partialHint'))
      return {
        text: t('automation.spend.window', { spent, limit: limitText }),
        color: window.reportedCostUsd + 1e-9 >= limit ? WARNING : SECONDARY,
        title: notes.join('\n'),
      }
    }
    if (window.unmeasured) {
      return {
        text: t('automation.spend.unmeasured', { limit: limitText }),
        color: WARNING,
        title: windowTitle,
      }
    }
    return { text: t('automation.spend.noRuns', { limit: limitText }), color: SECONDARY, title: windowTitle }
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

        {/* One switch for every schedule. Quiet by design: it sits below the
            page description, not above the job list, and its copy says how
            many jobs it touches so the consequence is explicit. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 10, padding: '7px 9px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: pausedAll ? 'var(--bg-hover)' : 'transparent',
        }}>
          <Pause size={13} style={{ flexShrink: 0, color: pausedAll ? 'var(--accent-text)' : SECONDARY }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: SECONDARY, lineHeight: 1.45 }}>
            {pausedAll
              ? t('automation.pauseAll.activeHint', { count: enabledCount })
              : t('automation.pauseAll.idleHint', { count: enabledCount })}
          </div>
          <button
            style={{ ...(pausedAll ? primaryButtonStyle : smallButtonStyle), opacity: pauseBusy ? 0.5 : 1 }}
            disabled={pauseBusy}
            onClick={togglePausedAll}
          >
            {pausedAll ? <Play size={11} /> : <Pause size={11} />}
            {pausedAll ? t('automation.pauseAll.resume') : t('automation.pauseAll.pause')}
          </button>
        </div>

        {pausedAll && (
          // The banner answers "why did nothing run?" without requiring the
          // user to notice a switch. It also states the two exceptions the
          // scheduler guarantees: manual runs work and in-flight runs finish.
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            marginBottom: 10, padding: '7px 10px', borderRadius: 6,
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            fontSize: 11.5, color: SECONDARY, lineHeight: 1.5,
          }}>
            <Pause size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent-text)' }} />
            <span>{t('automation.pauseAll.banner')}</span>
          </div>
        )}

        {/* One daily cap across every job. It sits beside Pause-all because it
            is the other switch over the whole store rather than a property of a
            job; the per-job fields still exist and still apply on top of it. */}
        <div style={{
          marginBottom: 10, padding: '7px 9px', borderRadius: 6,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Wallet size={13} style={{ flexShrink: 0, color: SECONDARY }} />
            <div style={{ flex: 1, minWidth: 140, fontSize: 11.5, color: SECONDARY, lineHeight: 1.45 }}>
              <div>{t('automation.budget.label')}</div>
              {budgetReadout && (
                <div style={{ marginTop: 2, fontSize: 11, color: budgetReadout.color }}>
                  {budgetReadout.text}
                  {budgetReadout.notes.length > 0 && (
                    // Named inline, not only in a tooltip: a total that may be
                    // low must not look exact on a settings page the user only
                    // glances at.
                    <div style={{ fontSize: 10.5, color: SECONDARY }}>
                      {budgetReadout.notes.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={budgetText}
              onChange={e => { setBudgetDraft(e.target.value); setBudgetError(null) }}
              placeholder={t('automation.budget.placeholder')}
              aria-label={t('automation.budget.label')}
              disabled={budgetBusy}
              style={{ ...INPUT_STYLE, width: 96, fontSize: 12, padding: '4px 8px' }}
            />
            <button
              style={{ ...smallButtonStyle, opacity: budgetBusy ? 0.5 : 1 }}
              disabled={budgetBusy}
              onClick={() => saveGlobalBudget(false)}
            >
              {t('automation.budget.save')}
            </button>
            {globalLimit !== undefined && (
              <button
                style={{ ...smallButtonStyle, opacity: budgetBusy ? 0.5 : 1 }}
                disabled={budgetBusy}
                onClick={() => saveGlobalBudget(true)}
              >
                {t('automation.budget.clear')}
              </button>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: SECONDARY, marginTop: 4, lineHeight: 1.45 }}>
            {t('automation.budget.hint')}
          </div>
          {budgetError && (
            <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 4 }}>
              {budgetError}
            </div>
          )}
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

        {/* The filter row lives outside the list's conditional so typing can
            empty the list without unmounting (and blurring) the field. It is
            plain uncontrolled-by-prefs state: no storage, no store. */}
        {!loading && jobs.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
            marginBottom: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, flex: '1 1 160px',
              minWidth: 140, maxWidth: 280,
              height: 24, boxSizing: 'border-box', padding: '0 9px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-hover)',
              transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
            }}>
              <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                onKeyDown={event => {
                  // Escape is the field's own reset, not the page's: with a
                  // value present it clears the text and keeps the caret here;
                  // with nothing to clear it does nothing.
                  if (event.key === 'Escape' && filterText !== '') {
                    event.preventDefault()
                    setFilterText('')
                  }
                }}
                placeholder={t('automation.filter.placeholder')}
                aria-label={t('automation.filter.placeholder')}
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
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  aria-label={t('automation.filter.clearSearch')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', padding: 0,
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>

            {/* All four chips are always present with their counts, even at
                zero, so the row does not reflow as jobs start, fail, or are
                switched off. A zero-count chip is disabled: filtering to it
                could only produce the empty state, and its count already says
                why. The counts follow the text query but not the chip
                selection, so a chip advertises what toggling it would reveal. */}
            <span
              role="group"
              aria-label={t('automation.filter.status.group')}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
            >
              {JOB_FILTER_STATUSES.map(status => {
                const active = filterStatuses.includes(status)
                const count = statusCounts[status]
                const unavailable = count === 0 && !active
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={active}
                    disabled={unavailable}
                    onClick={() => setFilterStatuses(prev => prev.includes(status)
                      ? prev.filter(value => value !== status)
                      : [...prev, status])}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      height: 24, boxSizing: 'border-box', padding: '0 9px',
                      borderRadius: 999, fontSize: 11, lineHeight: '16px',
                      cursor: unavailable ? 'default' : 'pointer',
                      border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-bg)' : 'transparent',
                      color: active ? 'var(--accent-text)' : SECONDARY,
                      fontWeight: active ? 600 : 400,
                      opacity: unavailable ? 0.45 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t(`automation.filter.status.${status}`)}
                    <span style={{ fontSize: 10, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </span>

            {/* A native select, not four more chips: ordering is exactly one
                choice out of four, the element already gives keyboard and
                screen-reader semantics for free, and a dropdown stays as quiet
                as the chips instead of adding another row of pressable
                controls. It is styled to the same 24px height and muted text
                as its neighbours; the accessible name is separate from the
                current value so "Next run" reads as an order, not a filter. */}
            <select
              value={sortMode}
              onChange={event => setSortMode(event.target.value as JobSortMode)}
              aria-label={t('automation.sort.label')}
              title={t('automation.sort.label')}
              style={{
                height: 24, boxSizing: 'border-box', padding: '0 8px',
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: SECONDARY, fontSize: 11,
                cursor: 'pointer', maxWidth: 170,
              }}
            >
              {JOB_SORT_MODES.map(mode => (
                <option key={mode} value={mode}>{t(`automation.sort.${mode}`)}</option>
              ))}
            </select>

            {filtersActive && (
              <button type="button" onClick={clearFilters} style={FILTER_LINK}>
                {t('automation.filter.clear')}
              </button>
            )}

            <span
              role="status"
              aria-live="polite"
              style={{
                marginLeft: 'auto', fontSize: 10.5, color: SECONDARY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t('automation.filter.count', {
                shown: filteredJobs.length,
                total: jobs.length,
              })}
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 12, color: SECONDARY, padding: '10px 0' }}>{t('common.loading')}</div>
        ) : jobs.length === 0 ? (
          <div style={{ fontSize: 12, color: SECONDARY, padding: '10px 0', lineHeight: 1.5 }}>
            {t('automation.empty')}
          </div>
        ) : filteredJobs.length === 0 ? (
          // One line, with the reset beside it: a filter that matches nothing
          // must not look like an empty account.
          <div style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            fontSize: 11.5, color: SECONDARY, padding: '10px 0', lineHeight: 1.5,
          }}>
            <span>
              {filterText.trim()
                ? t('automation.filter.emptyQuery', { query: filterText.trim() })
                : t('automation.filter.empty')}
            </span>
            <button type="button" onClick={clearFilters} style={FILTER_LINK}>
              {t('automation.filter.clear')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sortedJobs.map((job, index) => {
              const status = statusLine(job)
              const usage = usageLine(job)
              const spendLimit = spendLimitLine(job)
              const expert = jobExpert(job)
              // A plugin-made job keeps its origin across restarts, so the badge
              // is read from the job itself, not from a session-local guess. A
              // plugin that has since been uninstalled leaves the id behind,
              // which is still enough to keep the row honest and working.
              const origin = job.originPluginId ? pluginOrigin(job.originPluginId) : null
              const busy = busyId === job.id || job.running
              // A watch job runs on an event, so its schedule line names the
              // path instead of a time, and a lost path is the row's warning.
              const watch = job.trigger.kind === 'watch'
              const watchWarning = watchWarningText(job, t)
              // What the row says about the next occurrence: off, waiting on a
              // path, no occurrence, due/overdue, or a real future time. The
              // helper owns every one of those distinctions so this row does
              // not print a stale timestamp as if it were upcoming.
              const nextRun = nextRunText(job, t, resolvedLocale)
              // The pure view selects which records are visible (five, every
              // one, or every failure); it returns them in stored order, so the
              // disclosure's long-standing newest-first presentation is made
              // here, once. A job that has never run keeps the disclosure
              // unmounted rather than opening onto an empty table.
              const historyUi = runHistoryUi[job.id] ?? RUN_HISTORY_UI_DEFAULT
              const historyView = viewRunHistory(job.history, {
                failuresOnly: historyUi.failuresOnly,
                expanded: historyUi.expanded,
              })
              const runRows = historyView.rows.slice().reverse()
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
                      {origin && (
                        // Named on the row, not only in the editor: the point is
                        // to tell at a glance that this schedule was not created
                        // by the user. It stays a chip, so Edit and Delete beside
                        // it look no different from any other job's.
                        <span
                          title={origin.installed
                            ? t('automation.pluginOrigin.hint', { plugin: origin.name })
                            : t('automation.pluginOrigin.missing')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, padding: '0 6px', borderRadius: 8,
                            color: 'var(--accent-text)', background: 'rgba(99,102,241,0.12)',
                            border: '1px solid rgba(99,102,241,0.35)',
                          }}
                        >
                          <Puzzle size={10} style={{ flexShrink: 0 }} />
                          {t('automation.pluginOrigin.badge', { plugin: origin.name })}
                        </span>
                      )}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                        maxWidth: '100%', overflowWrap: 'anywhere',
                        fontSize: 11, color: watchWarning ? WARNING : SECONDARY,
                      }}>
                        {/* A clock beside "when the path changes" would promise
                            a time that does not exist. */}
                        {watch ? <RefreshCw size={11} /> : <Clock size={11} />}
                        {scheduleText(t, job.trigger)}
                        {/* One quiet clause on the schedule line instead of a
                            second line: the row already carries the action,
                            expert, last outcome, spend and history. Under the
                            global pause an enabled job's timestamp is frozen,
                            so it is omitted; a disabled job still says it is
                            off, because that is a fact about the job itself. */}
                        {(!pausedAll || !job.enabled) && (
                          <span style={{ color: nextRun.overdue ? WARNING : SECONDARY }}>
                            {` · ${nextRun.text}`}
                          </span>
                        )}
                      </span>
                      {pausedAll && job.enabled && (
                        // An enabled job under the global pause must not look
                        // like one that is about to fire. The switch stays on;
                        // this chip is what distinguishes the global state from
                        // every job being individually paused.
                        <span
                          title={t('automation.pauseAll.banner')}
                          style={{
                            fontSize: 11, padding: '0 6px', borderRadius: 8,
                            color: SECONDARY, background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {t('automation.pauseAll.row')}
                        </span>
                      )}
                      {job.quietOnSuccess === true && (
                        // A quiet clause beside the schedule, not another badge:
                        // it says why a success will not call the user.
                        <span style={{ fontSize: 11, color: SECONDARY }}>
                          {`· ${t('automation.quietOnSuccess.row')}`}
                        </span>
                      )}
                      {!watch && job.missedRunPolicy === 'skip' && (
                        // A short clause, like quiet mode: the row otherwise
                        // gives no sign that a time missed while closed will
                        // not be caught up.
                        <span style={{ fontSize: 11, color: SECONDARY }}>
                          {`· ${t('automation.missedPolicy.row')}`}
                        </span>
                      )}
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
                      {expert && (
                        // The expert behind a background job is the point of the
                        // binding, so it sits on the row rather than behind Edit.
                        // A short suffix separates this job's override from the
                        // workflow's own binding, which can differ after a re-bind.
                        <span
                          title={expert.override
                            ? t('automation.expert.overrideHint')
                            : t('automation.personaHint')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '1px 7px', borderRadius: 9, fontWeight: 600,
                            color: expert.kind === 'missing' ? WARNING : 'var(--accent-text)',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {expert.kind === 'missing'
                            ? t('automation.personaMissing')
                            : expert.kind === 'assistant'
                              ? t('automation.expert.assistant')
                              : `${expert.persona.emoji} ${expert.persona.name}`.trim()}
                          {expert.override && (
                            <span style={{ color: SECONDARY, fontWeight: 500 }}>
                              {`· ${t('automation.expert.overrideMark')}`}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: status.color, marginTop: 4, lineHeight: 1.45 }}>
                      <span>{status.text}</span>
                      {job.failureStreak >= 2 && (
                        // Only an unattended job that keeps failing owes its owner
                        // this sentence; a single failure is already on the line.
                        <span style={{ color: 'var(--danger-text)' }}>
                          {` · ${t('automation.failureStreak', { count: job.failureStreak })}`}
                        </span>
                      )}
                      {usage && (
                        // Muted so the spend reads as an aside to the outcome,
                        // not a second status. The tooltip carries the parts a
                        // compact row has no room for.
                        <span style={{ color: SECONDARY }} title={usage.title}>{` · ${usage.text}`}</span>
                      )}
                    </div>

                    {job.pendingRetry && (
                      // The row must say a retry is already waiting, not just
                      // that the last run failed; the time is the promise the
                      // scheduler will keep on its next tick.
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11, color: WARNING, marginTop: 3, lineHeight: 1.45,
                      }}>
                        <RotateCcw size={11} style={{ flexShrink: 0 }} />
                        <span>
                          {t('automation.retry.pending', {
                            attempt: job.pendingRetry.attempt,
                            count: limits?.retry?.maxRetries ?? 2,
                            time: timeText(job.pendingRetry.dueAt),
                          })}
                        </span>
                      </div>
                    )}

                    {spendLimit && (
                      // The limit's own line, separate from the last run's spend:
                      // it answers "how close am I to the rail", not "what did
                      // this run cost". Warning colour means the rail is at or
                      // over the limit, or could not be evaluated.
                      <div
                        style={{ fontSize: 11, color: spendLimit.color, marginTop: 3, lineHeight: 1.45 }}
                        title={spendLimit.title}
                      >
                        {spendLimit.text}
                      </div>
                    )}

                    {watchWarning && (
                      // The watcher was never attached, so the job will not
                      // fire. The sentence above already says what it watches;
                      // this says it is not watching it.
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 5,
                        fontSize: 11, color: WARNING, marginTop: 4, lineHeight: 1.5,
                      }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>{watchWarning}</span>
                      </div>
                    )}

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

                    {job.history.length > 0 && (
                      // Native <details> gives a collapsed-by-default, keyboard
                      // operable disclosure without local state; the row grows
                      // only when the user asks it to. Closing it forgets the
                      // per-job view, so reopening starts from five rows again.
                      <details
                        style={{ marginTop: 3 }}
                        onToggle={event => {
                          if (!event.currentTarget.open) resetRunHistoryUi(job.id)
                        }}
                      >
                        <summary style={{
                          width: 'fit-content', cursor: 'pointer',
                          fontSize: 11, color: SECONDARY, lineHeight: 1.45,
                        }}>
                          {/* Keep the native disclosure marker: it is the one
                              affordance that says "this expands" without CSS. */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <History size={11} />
                            {t('automation.history.summary', {
                              count: Math.min(job.history.length, RUN_HISTORY_CAP),
                            })}
                          </span>
                        </summary>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {/* A chip, not a second disclosure: it narrows the
                              list already on screen. The count stays visible
                              at zero so the empty state below is reachable and
                              the user can see there is nothing to find. */}
                          <button
                            type="button"
                            aria-pressed={historyUi.failuresOnly}
                            onClick={() => patchRunHistoryUi(job.id, {
                              failuresOnly: !historyUi.failuresOnly,
                            })}
                            title={t('automation.history.failuresHint')}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, padding: '0 6px', borderRadius: 8, cursor: 'pointer',
                              color: historyUi.failuresOnly ? 'var(--accent-text)' : SECONDARY,
                              background: historyUi.failuresOnly
                                ? 'rgba(99,102,241,0.12)'
                                : 'var(--bg-hover)',
                              border: `1px solid ${historyUi.failuresOnly
                                ? 'rgba(99,102,241,0.35)'
                                : 'var(--border)'}`,
                            }}
                          >
                            <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                            {t('automation.history.failures', { count: historyView.failureCount })}
                          </button>
                        </div>
                        {historyView.isEmpty && (
                          // An explicit line, never a gap under the filter:
                          // "nothing failed" is an answer, not a missing list.
                          <div style={{
                            fontSize: 11, color: SECONDARY, marginTop: 3, lineHeight: 1.45,
                          }}>
                            {t('automation.history.failuresEmpty')}
                          </div>
                        )}
                        <ol
                          aria-label={t('automation.history.listLabel')}
                          style={{
                            margin: '3px 0 0', padding: 0, listStyle: 'none',
                            display: 'flex', flexDirection: 'column', gap: 2,
                          }}
                        >
                          {runRows.map((record, runIndex) => {
                            const state = runStatus(record)
                            const duration = durationText(record.durationMs)
                            const runUsage = record.usage
                            const tokens = runUsage ? runUsage.inputTokens + runUsage.outputTokens : 0
                            const cost = runUsage?.costUsd !== undefined && runUsage.costUsd > 0
                              ? costText(runUsage.costUsd)
                              : null
                            // A skip's status already says why it did not run;
                            // only a failure carries an extra explanation.
                            const detail = record.status === 'error' && record.error ? errorText(record.error) : ''
                            const memory = memoryLine(record.memory)
                            // Only a real snapshot can be truncated; a failed
                            // read has nothing to clip and must not imply one.
                            const memoryTruncated = record.memory?.state === 'ok' && record.memory.truncated
                            const sessionId = record.sessionId
                            return (
                              <li
                                key={`${record.startedAt}-${runIndex}`}
                                style={{
                                  display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                                  fontSize: 11, color: SECONDARY, lineHeight: 1.45,
                                }}
                              >
                                <span>{timeText(record.startedAt)}</span>
                                <span style={{ color: state.color }} title={detail || undefined}>
                                  {state.text}{detail ? `: ${clipText(detail)}` : ''}
                                </span>
                                {record.retry !== undefined && (
                                  // Without this, a night with three attempts looks
                                  // like three separate scheduled runs.
                                  <span style={{ color: 'var(--accent-text)' }}>
                                    {t('automation.retry.badge', { attempt: record.retry })}
                                  </span>
                                )}
                                {memory && (
                                  // Shape only — tiers and size. A failed read is
                                  // the case the user most needs to see, so it
                                  // gets its own words and warning colour.
                                  <span
                                    style={memory.color ? { color: memory.color } : undefined}
                                    title={memory.title}
                                  >
                                    {memory.text}
                                  </span>
                                )}
                                {memory?.unreadable && (
                                  // Warning-toned because the run lost part of
                                  // memory, even though it did continue.
                                  <span style={{ color: WARNING }} title={memory.unreadable.title}>
                                    {memory.unreadable.text}
                                  </span>
                                )}
                                {memoryTruncated && (
                                  <span title={t('automation.memory.truncatedHint')}>
                                    {t('automation.memory.truncated')}
                                  </span>
                                )}
                                {duration && <span>{duration}</span>}
                                {tokens > 0 && <span>{t('automation.usage.tokens', { count: formatTokens(tokens) })}</span>}
                                {cost && <span>{cost}</span>}
                                {record.late && <span>{t('automation.ranLate')}</span>}
                                {sessionId && (
                                  <button
                                    type="button"
                                    onClick={() => openRun(sessionId)}
                                    aria-label={t('automation.history.openAria', { time: timeText(record.startedAt) })}
                                    style={{
                                      background: 'none', border: 'none', padding: 0,
                                      font: 'inherit', fontSize: 11,
                                      color: 'var(--accent-text)', cursor: 'pointer',
                                    }}
                                  >
                                    {t('automation.history.open')}
                                  </button>
                                )}
                              </li>
                            )
                          })}
                        </ol>
                        {historyView.canShowAll && (
                          // Only the newest five were listed; this reveals
                          // every remembered run below them, still newest
                          // first. The filter never needs it: it lists every
                          // failure already.
                          <button
                            type="button"
                            onClick={() => patchRunHistoryUi(job.id, { expanded: true })}
                            style={QUIET_LINK}
                          >
                            {t('automation.history.showAll', { count: historyView.totalCount })}
                          </button>
                        )}
                        {historyView.canShowFewer && (
                          <button
                            type="button"
                            onClick={() => patchRunHistoryUi(job.id, { expanded: false })}
                            style={QUIET_LINK}
                          >
                            {t('automation.history.showFewer')}
                          </button>
                        )}
                      </details>
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
                        {job.lastStatus === 'error' && !job.running && (
                          // Offered only in a failed state: the point is to turn
                          // the failure the row is already showing into a
                          // question. The label stays short so five actions fit;
                          // the aria-label names the job, because five rows with
                          // the same words are indistinguishable by ear.
                          <button
                            style={{ ...smallButtonStyle, color: 'var(--accent-text)' }}
                            onClick={() => askInvestigate(job)}
                            aria-label={t('automation.investigate.aria', { name: job.name })}
                            title={t('automation.investigate.title')}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--accent-text)' }}
                          >
                            <Sparkles size={11} />
                            {t('automation.investigate.ask')}
                          </button>
                        )}
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
                          style={{ ...smallButtonStyle, opacity: busyId === job.id ? 0.5 : 1 }}
                          disabled={busyId === job.id}
                          onClick={() => duplicateJob(job)}
                          title={t('automation.duplicateJobHint')}
                          onMouseEnter={e => { if (busyId !== job.id) e.currentTarget.style.color = 'var(--text-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = SECONDARY }}
                        >
                          <Copy size={11} />
                          {t('automation.duplicateJob')}
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
          <li>{t('automation.missedRunRuleChoice')}</li>
          <li>{t('automation.pauseAll.help')}</li>
          <li>{t('automation.budget.help')}</li>
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
