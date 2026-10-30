// One job row: its switch, name and chips, what it runs and for whom, its
// chain, its last outcome, and the conditions that need the user's attention —
// plus the action column and the run-history disclosure.
//
// It was the body of the `sortedJobs.map` in `SettingsAutomations.tsx`. The
// page still owns the list, the disclosure state and every mutation; this
// module owns one row's rendering, with the pre-split markup and wording.

import { AlertTriangle, Clock, GitBranch, RotateCcw } from 'lucide-react'
import Toggle from '../../ui/Toggle'
import ProvenanceLine from '../../provenance/ProvenanceLine'
import { workflowProvenance } from '../../../lib/provenance'
import { watchWarningText } from '../../automation/scheduleText'
import { nextRunText } from '../../automation/nextRunText'
import { deriveRepeatedAsking } from '../../automation/approvalPattern'
import { resolveJobDepartment, type JobDepartmentOption } from '../../automation/jobDepartment'
import { SECONDARY, WARNING } from '../../automation/automationStyles'
import type { WorkflowOption } from '../../automation/AutomationDialog'
import type {
  AutomationJobData,
  AutomationLimitsData,
  AutomationRunRecordData,
  NavPlugin,
  SkillInfoData,
} from '../../../../preload'
import type { Persona } from '../../../types/app.types'
import type { AppLocale } from '../../../utils/formatDate'
import {
  chainClausesFor,
  jobExpertFor,
  pluginOriginFor,
  skillNameOf,
  workflowNameOf,
} from './automationRowFacts'
import {
  clipText,
  spendLimitLine,
  statusLine,
  timeText,
  usageLine,
  type Translate,
} from './automationStatusText'
import { QUIET_LINK } from './automationSettingsStyles'
import { AutomationJobActions } from './AutomationJobActions'
import { AutomationJobChips } from './AutomationJobChips'
import {
  AutomationRunHistory,
  type RunHistoryUi,
} from './AutomationRunHistory'

export function AutomationJobRow({
  t,
  locale,
  job,
  jobs,
  index,
  highlighted,
  registerRow,
  pausedAll,
  workflows,
  personas,
  plugins,
  skills,
  departmentOptions,
  limits,
  busyId,
  confirming,
  historyUi,
  runFilesOpen,
  homeDir,
  onToggle,
  onRunNow,
  onDuplicate,
  onDelete,
  onAskInvestigate,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onOpenRun,
  onPatchHistoryUi,
  onResetHistoryUi,
  onToggleRunFiles,
  onSaveRunAsTask,
  savingRunKey,
}: {
  t: Translate
  locale: AppLocale
  job: AutomationJobData
  jobs: AutomationJobData[]
  index: number
  highlighted: boolean
  registerRow: (el: HTMLDivElement | null) => void
  pausedAll: boolean
  workflows: WorkflowOption[] | undefined
  personas: Persona[] | undefined
  plugins: NavPlugin[]
  skills: SkillInfoData[] | null
  departmentOptions: JobDepartmentOption[]
  limits: AutomationLimitsData | null
  busyId: string | null
  confirming: boolean
  historyUi: RunHistoryUi
  runFilesOpen: Record<string, boolean>
  /** So a job folder under home reads `~/…` on its chip. */
  homeDir?: string | null
  onToggle: (enabled: boolean) => void
  onRunNow: () => void
  onDuplicate: () => void
  onDelete: () => void
  onAskInvestigate: () => void
  onEdit: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onOpenRun: (sessionId: string) => void
  onPatchHistoryUi: (patch: Partial<RunHistoryUi>) => void
  onResetHistoryUi: () => void
  onToggleRunFiles: (key: string) => void
  onSaveRunAsTask: (record: AutomationRunRecordData) => void
  /** `${job.id}:${startedAt}` while that run's save is in flight. */
  savingRunKey: string | null
}) {
  const status = statusLine(t, job, locale)
  // A job whose requests keep being refused is pointed at its own
  // configuration, never told it is broken (see `approvalPattern`).
  const repeatedAsking = deriveRepeatedAsking(job)
  const usage = usageLine(t, job)
  const spendLimit = spendLimitLine(t, job)
  const expert = jobExpertFor(job, workflows, personas)
  // A plugin-made job keeps its origin across restarts, so the badge
  // is read from the job itself, not from a session-local guess. A
  // plugin that has since been uninstalled leaves the id behind,
  // which is still enough to keep the row honest and working.
  const origin = job.originPluginId ? pluginOriginFor(plugins, job.originPluginId, locale) : null
  // `none` (no id) is the documented legacy state and shows no chip.
  // `stale` (an id whose node is gone) is a distinct visible state —
  // it must not look like "no department", and must never be moved.
  const department = resolveJobDepartment(job.departmentId, departmentOptions)
  // Normalized through the same helper a workflow uses, so the job
  // and the workflow drafted from one conversation word their origin
  // identically. An empty object means a hand-made/pre-field job.
  const provenance = workflowProvenance(
    job.sourceConversation,
    job.sourceTitle,
    job.sourceDraftedAt ?? '',
  )
  const busy = busyId === job.id || job.running
  // A watch job runs on an event, so its schedule line names the
  // path instead of a time, and a lost path is the row's warning.
  const watch = job.trigger.kind === 'watch'
  const watchWarning = watchWarningText(job, t)
  // What the row says about the next occurrence: off, waiting on a
  // path, no occurrence, due/overdue, or a real future time. The
  // helper owns every one of those distinctions so this row does
  // not print a stale timestamp as if it were upcoming.
  const nextRun = nextRunText(job, t, locale)
  const chainRow = chainClausesFor(t, job, jobs)

  return (
    <div
      ref={registerRow}
      data-automation-job={job.id}
      data-automation-job-focused={highlighted ? 'true' : undefined}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '10px 0',
        borderTop: index === 0 ? 'none' : '1px solid var(--border)',
        opacity: job.enabled ? 1 : 0.62,
        // A brief tint marks the row the search opened; the
        // transition fades it without a second state change.
        background: highlighted ? 'var(--accent-bg)' : 'transparent',
        boxShadow: highlighted
          ? 'inset 0 0 0 1px var(--accent-border)'
          : 'inset 0 0 0 1px transparent',
        borderRadius: 6,
        transition: 'background-color 0.6s ease, box-shadow 0.6s ease',
      }}
    >
      <div style={{ paddingTop: 1 }}>
        <Toggle
          value={job.enabled}
          onChange={v => onToggle(v)}
          disabled={busyId === job.id}
          aria-label={t('automation.enabled')}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <AutomationJobChips
          t={t}
          job={job}
          pausedAll={pausedAll}
          origin={origin}
          department={department}
          watch={watch}
          watchWarning={watchWarning}
          nextRun={nextRun}
          homeDir={homeDir}
        />

        {/* Where this job was drafted from. A job made in Settings,
            and every job saved before the field existed, carries no
            conversation id — the shared line then renders nothing
            at all rather than "unknown source". */}
        <div style={{ marginTop: 2 }}>
          <ProvenanceLine
            sessionId={provenance.sourceConversation}
            title={provenance.sourceTitle}
            date={provenance.sourceDraftedAt}
          />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          fontSize: 11, color: SECONDARY, marginTop: 3, lineHeight: 1.45,
        }}>
          <span>
            {job.action.kind === 'workflow'
              ? t('automation.workflowAction', {
                  name: workflowNameOf(workflows, job.action.workflowId) ?? t('automation.workflowMissingShort'),
                })
              : job.action.kind === 'skill'
                // Falling back to the folder name is deliberate: it
                // is the identity the job stores, so it is true even
                // when the scan has not returned or the skill is gone.
                ? t('automation.skillAction', {
                    name: skillNameOf(skills, job.action.skillSource, job.action.skillDir) ??
                      (job.action.skillDir || 'SKILL.md'),
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

        {chainRow.length > 0 && (
          // Configuration, not history: it sits with the action,
          // above the last outcome, because it is part of what this
          // job is. A gone target turns the clause into a warning
          // rather than a name.
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
            fontSize: 11, color: SECONDARY, marginTop: 3, lineHeight: 1.45,
          }}>
            <GitBranch size={11} style={{ flexShrink: 0 }} />
            {chainRow.map((clause, clauseIndex) => (
              <span
                key={clauseIndex}
                title={clause.title}
                style={clause.missing ? { color: WARNING } : undefined}
              >
                {clauseIndex > 0 ? ` · ${clause.text}` : clause.text}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: status.color, marginTop: 4, lineHeight: 1.45 }}>
          {/* Only the held label carries a tooltip; `help` is the
              cue that the sentence explains rather than acts. */}
          <span title={status.title} style={status.title ? { cursor: 'help' } : undefined}>
            {status.text}
          </span>
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

        {repeatedAsking && (
          // Quiet on purpose: a refusal is a decision, not a fault,
          // so this is neither warning-coloured nor next to the
          // failure streak. It names the last ask and offers the one
          // honest next step — open the job — instead of teaching
          // the user to approve the same request every night.
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap',
            rowGap: 2,
            fontSize: 11.5, color: SECONDARY, marginTop: 4, lineHeight: 1.5,
          }}>
            <Clock size={11} style={{ flexShrink: 0, marginTop: 3 }} />
            {/* The quoted ask may be long: it wraps here instead of
                widening the row, and the full text stays in the
                tooltip the note already carries. */}
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }} title={t('automation.repeatedAsking.hint')}>
              {t('automation.repeatedAsking.note', {
                count: repeatedAsking.refusals,
                subject: clipText(repeatedAsking.latestSubject),
              })}
            </span>
            <button
              type="button"
              style={{
                ...QUIET_LINK,
                // A two-pixel-high link gave the focus ring almost
                // nothing to sit on; the padding is hit area only.
                margin: '0 0 0 2px', padding: '1px 4px', borderRadius: 4,
              }}
              aria-label={t('automation.repeatedAsking.reviewAria', { name: job.name })}
              onClick={onEdit}
            >
              {t('automation.repeatedAsking.review')}
            </button>
          </div>
        )}

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
                time: timeText(job.pendingRetry.dueAt, locale),
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
            <span>
              {job.action.kind === 'skill'
                ? t('automation.skillMissing')
                : t('automation.workflowMissing')}
            </span>
          </div>
        )}

        {job.history.length > 0 && (
          <AutomationRunHistory
            t={t}
            locale={locale}
            job={job}
            historyUi={historyUi}
            limits={limits}
            runFilesOpen={runFilesOpen}
            onPatchHistoryUi={onPatchHistoryUi}
            onResetHistoryUi={onResetHistoryUi}
            onToggleRunFiles={onToggleRunFiles}
            onOpenRun={onOpenRun}
            onSaveAsTask={onSaveRunAsTask}
            savingRunKey={savingRunKey}
          />
        )}
      </div>

      <AutomationJobActions
        t={t}
        job={job}
        busy={busy}
        busyId={busyId}
        confirming={confirming}
        onInvestigate={onAskInvestigate}
        onRunNow={onRunNow}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onConfirmDelete={onConfirmDelete}
        onCancelDelete={onCancelDelete}
      />
    </div>
  )
}
