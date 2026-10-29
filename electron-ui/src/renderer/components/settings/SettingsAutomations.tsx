// Settings → Automations.
//
// The list and the "how it works" notes. The create/edit dialog lives in
// `../automation/AutomationDialog` because the workflow page mounts it too. All
// timing and execution live in the main process (`src/main/automation/`); this
// page only reflects state and sends CRUD requests, then waits for
// `automation:changed` instead of guessing what the scheduler did.
//
// The page shell keeps the state and the mutations; the pieces it renders live
// in `./settingsAutomations/`: the pause/budget/filter chrome, one job row, its
// action column, its run-history disclosure and the per-run file panel. The
// split is a move, not a rewrite — the markup, wording and handler semantics
// are the pre-split ones.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, Clock, Plus } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useChatStore, useDepartmentStore, usePrefsStore, useSessionStore, useUiStore } from '../../store'
import { usePluginStore } from '../../store/pluginStore'
import SettingsGroup from './SettingsGroup'
import AutomationDialog, { type WorkflowOption } from '../automation/AutomationDialog'
import { scheduleText } from '../automation/scheduleText'
import {
  countJobsByStatus,
  hasActiveFilters,
  matchesJob,
  rememberSkills,
  skillSearchFields,
  type JobFilterStatus,
  type JobSearchContext,
} from '../automation/jobFilter'
import { sortJobs, type JobSortMode } from '../automation/jobSort'
import { buildInvestigatePrompt } from '../automation/investigatePrompt'
import { buildJobDepartmentOptions } from '../automation/jobDepartment'
import { isFolderRefusedError, jobFolderFromAction } from '../automation/jobFolder'
import { SECONDARY, primaryButtonStyle } from '../automation/automationStyles'
import type {
  AutomationJobData,
  AutomationLimitsData,
  JobTrashErrorCode,
  SkillInfoData,
} from '../../../preload'
import { TRASH_RETENTION_DAYS, UNDO_TOAST_MS } from '../../lib/workflowTrash'
import type { Persona } from '../../types/app.types'
import {
  jobExpertFor,
  workflowNameOf,
} from './settingsAutomations/automationRowFacts'
import { errorText as errorTextFor } from './settingsAutomations/automationStatusText'
import {
  AutomationBudgetCard,
  AutomationErrorBanner,
  AutomationFilterRow,
  AutomationListState,
  AutomationPauseCard,
} from './settingsAutomations/PageChrome'
import { AutomationJobRow } from './settingsAutomations/AutomationJobRow'
import {
  RUN_HISTORY_UI_DEFAULT,
  type RunHistoryUi,
} from './settingsAutomations/AutomationRunHistory'

export default function SettingsAutomations() {
  const { t, resolvedLocale } = useI18n()
  const workflows = usePrefsStore(s => s.prefs.workflows) as WorkflowOption[] | undefined
  const personas = usePrefsStore(s => s.prefs.personas) as Persona[] | undefined
  // A skill-backed job's row names the skill, and the name lives in the skills
  // scan, not in the job. Same directory main resolves the project root from.
  const workingDir = usePrefsStore(s => s.prefs.workingDir)
  // A job's own folder reads `~/…` under home, like the chat folder chip.
  const homeDir = useSessionStore(s => s.homeDir)
  const plugins = usePluginStore(s => s.plugins)
  const departments = useDepartmentStore(s => s.departments)
  const addToast = useUiStore(s => s.addToast)

  const [jobs, setJobs] = useState<AutomationJobData[]>([])
  // `null` = not read yet. The row falls back to the stored folder name until
  // then, which is always true; an unreadable list never blanks the row.
  const [skills, setSkills] = useState<SkillInfoData[] | null>(null)
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
  // Per-run file disclosure, keyed by job + start stamp + index so expanding one
  // run cannot open another. It is page-local: a refetch keeps the open state for
  // a record that is still present, and a missing key simply starts collapsed.
  const [runFilesOpen, setRunFilesOpen] = useState<Record<string, boolean>>({})
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

  // Read once per working directory. The list only supplies display names, so
  // a failure leaves the rows showing the stored folder name rather than an
  // error: the job is still schedulable, and that is the fact the row carries.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await window.electronAPI.skillsList(workingDir || undefined)
        if (cancelled) return
        const entries = Array.isArray(list) ? list : []
        // One write per read, never per keystroke: the filter below is pure.
        // A skill deleted after this read keeps its name, so a job that names
        // it stays searchable by the name the user remembers.
        rememberSkills(entries)
        setSkills(entries)
      } catch {
        if (!cancelled) setSkills(null)
      }
    })()
    return () => { cancelled = true }
  }, [workingDir])

  // The org tree is renderer state. One ordered list per tree change keeps each
  // row's id → node lookup cheap, and every row resolves against the same tree.
  const departmentOptions = useMemo(
    () => buildJobDepartmentOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )

  /**
   * The job facts the pure predicate cannot derive on its own.
   *
   * The schedule sentence is localized and the workflow/persona names live in
   * other stores, so they are resolved here and handed over as plain strings.
   * The predicate stays React-free and the filter row cannot drift from the
   * row's own wording: both call the same `scheduleText` / `jobExpertFor`.
   */
  const searchContextFor = useCallback((job: AutomationJobData): JobSearchContext => {
    const expert = jobExpertFor(job, workflows, personas)
    return {
      workflowName: job.action.kind === 'workflow'
        ? workflowNameOf(workflows, job.action.workflowId) ?? null
        : null,
      scheduleSentence: scheduleText(t, job.trigger),
      personaName: expert?.kind === 'persona' ? expert.persona.name : null,
      // The name and description live in the skill list, not in the job. A
      // skill deleted since it was scheduled still answers from the name
      // journal, so the job remains findable by the name the user typed.
      ...skillSearchFields(job.action, skills),
    }
  }, [workflows, personas, t, skills])

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

  // The global search hands this page a job id to reveal. The read has to land
  // first: before it, an empty `jobs` means "unknown", not "gone". A filter left
  // over from an earlier visit would hide the row the user came for, so it is
  // cleared rather than allowed to swallow the request.
  const pendingJobId = useUiStore(s => s.pendingAutomationJobId)
  const [highlightJobId, setHighlightJobId] = useState<string | null>(null)
  const jobRowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!pendingJobId || loading) return
    if (!jobs.some(job => job.id === pendingJobId)) {
      useUiStore.getState().consumePendingAutomationJobId()
      return
    }
    if (!sortedJobs.some(job => job.id === pendingJobId)) {
      setFilterText('')
      setFilterStatuses([])
      return
    }
    jobRowRefs.current[pendingJobId]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightJobId(pendingJobId)
    useUiStore.getState().consumePendingAutomationJobId()
  }, [pendingJobId, loading, jobs, sortedJobs])

  // The highlight fades on its own clock. It lives in its own effect so a
  // scheduler refresh re-running the reveal effect cannot cancel the timer and
  // leave a row tinted forever.
  useEffect(() => {
    if (!highlightJobId) return
    const timer = setTimeout(() => setHighlightJobId(null), 2400)
    return () => clearTimeout(timer)
  }, [highlightJobId])

  /**
   * Why a delete or a restore was refused, in the user's words.
   *
   * The codes come from the holding area, not from the scheduler, so they are
   * spelled out here rather than looked up in `automation.errors.*`. `job_limit`
   * deliberately does not print the number: the way out is deleting a job, not
   * counting them.
   */
  const jobTrashFailure = useCallback((
    code: JobTrashErrorCode | undefined,
    error: string | undefined,
  ): string => {
    switch (code) {
      case 'not_found': return t('automation.trash.failure.notFound')
      case 'id_taken': return t('automation.trash.failure.idTaken')
      case 'job_limit': return t('automation.trash.failure.jobLimit')
      case 'write_failed': return t('automation.trash.failure.writeFailed')
      case 'move_failed': return t('automation.trash.failure.moveFailed')
      default: return t('automation.trash.failure.generic', {
        message: error || t('automation.trash.failure.unknown'),
      })
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
      if (!result.ok) setError(t('automation.pauseAll.failed', { error: errorTextFor(t, result.error) }))
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
        setBudgetError(errorTextFor(t, result.error))
      }
    } catch (err) {
      setBudgetError(t('automation.budget.failed', { error: String(err) }))
    } finally {
      setBudgetBusy(false)
    }
  }

  const toggleJob = async (job: AutomationJobData, enabled: boolean) => {
    setError(null)
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationSetEnabled(job.id, enabled)
      if (!result.ok) setError(t('automation.errors.toggleFailed', { error: errorTextFor(t, result.error) }))
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
      if (!result.ok) {
        // Today only a save validates the folder, but if a start ever refuses
        // it, name the folder the refusal is about instead of a bare code.
        setError(isFolderRefusedError(result.error)
          ? t('automation.folder.notAllowed', { path: jobFolderFromAction(job.action) })
          : t('automation.errors.runFailed', { error: errorTextFor(t, result.error) }))
      }
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
        setError(t('automation.duplicate.failed', { error: errorTextFor(t, result.error) }))
        return
      }
      // The copy carries the action's identity, so a duplicated skill job must
      // not be told its "workflow" is gone — a sentence about the wrong thing
      // is worse than the generic one.
      addToast('success', t(
        result.job.actionMissing
          ? result.job.action.kind === 'skill'
            ? 'automation.duplicate.doneSkillMissing'
            : 'automation.duplicate.doneActionMissing'
          : 'automation.duplicate.done',
        { name: result.job.name },
      ))
    } catch (err) {
      setError(t('automation.duplicate.failed', { error: String(err) }))
    } finally {
      setBusyId(null)
    }
  }

  /** The toast's Undo: put the job back from the holding area. */
  const undoDeleteJob = async (job: AutomationJobData, trashId: string) => {
    try {
      const result = await window.electronAPI.automationTrashRestore(trashId)
      if (!result.ok) {
        addToast('error', t('automation.trash.restoreRefused', {
          error: jobTrashFailure(result.code, result.error),
        }))
        return
      }
      // The list refreshes through `automation:changed`, and the schedule was
      // re-armed from this instant — say so, or the next run would be expected
      // at the time it had before the delete.
      addToast('success', t('automation.trash.restored', { name: job.name }))
    } catch (err) {
      addToast('error', t('automation.trash.restoreRefused', { error: String(err) }))
    }
  }

  /**
   * Delete a job: it moves into the shared holding area, and the toast offers
   * the one click that puts it back. A refusal is reported by the toast too —
   * it names what went wrong, and nothing on the page has changed.
   */
  const removeJob = async (job: AutomationJobData) => {
    setConfirmingId(null)
    setError(null)
    setBusyId(job.id)
    try {
      const result = await window.electronAPI.automationDelete(job.id)
      if (!result.ok) {
        addToast('error', t('automation.trash.deleteRefused', {
          error: jobTrashFailure(result.code, result.error),
        }))
        return
      }
      // The row is gone, the job is not: undo acts on the trash row's own id.
      addToast('info', t('automation.trash.deleted', {
        name: job.name,
        days: TRASH_RETENTION_DAYS,
      }), UNDO_TOAST_MS, {
        label: t('automation.trash.undo'),
        ariaLabel: t('automation.trash.undoAria', { name: job.name }),
        onClick: () => { void undoDeleteJob(job, result.entry.id) },
      })
    } catch (err) {
      addToast('error', t('automation.trash.deleteRefused', { error: String(err) }))
    } finally {
      setBusyId(null)
    }
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

        <AutomationPauseCard
          t={t}
          pausedAll={pausedAll}
          enabledCount={enabledCount}
          pauseBusy={pauseBusy}
          onToggle={togglePausedAll}
        />

        <AutomationBudgetCard
          t={t}
          budgetText={budgetText}
          budgetBusy={budgetBusy}
          budgetError={budgetError}
          globalLimit={globalLimit}
          globalSpend={globalSpend}
          onChange={value => { setBudgetDraft(value); setBudgetError(null) }}
          onSave={() => { void saveGlobalBudget(false) }}
          onClear={() => { void saveGlobalBudget(true) }}
        />

        <AutomationErrorBanner error={error} />

        {/* The filter row lives outside the list's conditional so typing can
            empty the list without unmounting (and blurring) the field. It is
            plain uncontrolled-by-prefs state: no storage, no store. */}
        {!loading && jobs.length > 0 && (
          <AutomationFilterRow
            t={t}
            filterText={filterText}
            onFilterText={setFilterText}
            filterStatuses={filterStatuses}
            onToggleStatus={status => setFilterStatuses(prev => prev.includes(status)
              ? prev.filter(value => value !== status)
              : [...prev, status])}
            statusCounts={statusCounts}
            sortMode={sortMode}
            onSortMode={setSortMode}
            filtersActive={filtersActive}
            onClear={clearFilters}
            shown={filteredJobs.length}
            total={jobs.length}
          />
        )}

        <AutomationListState
          t={t}
          loading={loading}
          total={jobs.length}
          filteredCount={filteredJobs.length}
          filterText={filterText}
          onClear={clearFilters}
        />

        {sortedJobs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sortedJobs.map((job, index) => (
              <AutomationJobRow
                key={job.id}
                t={t}
                locale={resolvedLocale}
                job={job}
                jobs={jobs}
                index={index}
                highlighted={highlightJobId === job.id}
                registerRow={el => { jobRowRefs.current[job.id] = el }}
                pausedAll={pausedAll}
                workflows={workflows}
                personas={personas}
                plugins={plugins}
                skills={skills}
                departmentOptions={departmentOptions}
                limits={limits}
                busyId={busyId}
                confirming={confirmingId === job.id}
                historyUi={runHistoryUi[job.id] ?? RUN_HISTORY_UI_DEFAULT}
                runFilesOpen={runFilesOpen}
                homeDir={homeDir}
                onToggle={enabled => { void toggleJob(job, enabled) }}
                onRunNow={() => { void runNow(job) }}
                onDuplicate={() => { void duplicateJob(job) }}
                onDelete={() => { void removeJob(job) }}
                onAskInvestigate={() => askInvestigate(job)}
                onEdit={() => setDialog(job)}
                onConfirmDelete={() => setConfirmingId(job.id)}
                onCancelDelete={() => setConfirmingId(null)}
                onOpenRun={openRun}
                onPatchHistoryUi={patch => patchRunHistoryUi(job.id, patch)}
                onResetHistoryUi={() => resetRunHistoryUi(job.id)}
                onToggleRunFiles={key => setRunFilesOpen(prev => ({
                  ...prev,
                  [key]: !prev[key],
                }))}
              />
            ))}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('automation.howItWorks')} icon={<Clock size={13} />} groupKey="automations-help">
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: SECONDARY, lineHeight: 1.6 }}>
          <li>{t('automation.appMustRun')}</li>
          <li>{t('automation.missedRunRuleChoice')}</li>
          <li>{t('automation.chain.help', { depth: limits?.chainMaxDepth ?? 4 })}</li>
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
