// The title line of one job row: its name, origin and department chips, the
// schedule sentence with the next occurrence, and the quiet clauses that
// explain why a job is not about to run (global pause, quiet success, missed
// policy, effort, alert policy).
//
// It was the first block inside each row of `SettingsAutomations.tsx`. The row
// still resolves the facts this line prints and hands them down, so the same
// department node, origin plugin and next-run sentence are computed exactly
// once per row as before.

import { AlertTriangle, Building2, Clock, Folder, Puzzle, RefreshCw } from 'lucide-react'
import { scheduleText } from '../../automation/scheduleText'
import { workingDirLabel } from '../../../lib/workingDir'
import type { NextRunDescription } from '../../automation/nextRunText'
import type { JobDepartmentResolution } from '../../automation/jobDepartment'
import { SECONDARY, WARNING } from '../../automation/automationStyles'
import type { AutomationJobData } from '../../../../preload'
import type { Translate } from './automationStatusText'

export function AutomationJobChips({
  t,
  job,
  pausedAll,
  origin,
  department,
  watch,
  watchWarning,
  nextRun,
  homeDir,
}: {
  t: Translate
  job: AutomationJobData
  pausedAll: boolean
  origin: { name: string; installed: boolean } | null
  department: JobDepartmentResolution
  watch: boolean
  watchWarning: string | null
  nextRun: NextRunDescription
  /** For the `~/…` spelling of a job's own folder. */
  homeDir?: string | null
}) {
  // Only a prompt job can name its own folder. Empty means the app-wide
  // working folder, which is deliberately shown as nothing: the global
  // preference may change after this job was created, so naming today's
  // folder on the row would describe a folder the next run may not use.
  const ownFolder = job.action.kind === 'prompt' ? (job.action.cwd ?? '').trim() : ''
  return (
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
      {department.state === 'found' && (
        // A compact chip, like the plugin origin: the department
        // is a filing, and the tooltip carries the full path plus
        // the reminder that it is not where the job runs.
        <span
          title={t('automation.department.rowTitle', { path: department.path })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '0 6px', borderRadius: 8,
            color: SECONDARY, background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
          }}
        >
          <Building2 size={10} style={{ flexShrink: 0 }} />
          {department.label}
        </span>
      )}
      {department.state === 'stale' && (
        // Not "no department": the job still carries an id, but
        // the node is gone. The warning colour and the sentence
        // are the only honest way to show a filing that cannot
        // resolve yet must not be cleared behind the user's back.
        <span
          title={t('automation.department.rowMissingTitle', { id: department.id })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '0 6px', borderRadius: 8,
            color: WARNING, background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
          }}
        >
          <AlertTriangle size={10} style={{ flexShrink: 0 }} />
          {t('automation.department.missingOption')}
        </span>
      )}
      {ownFolder && (
        // A short label with the full path one hover away. A job with no own
        // folder shows nothing here rather than the current app-wide folder.
        <span
          title={ownFolder}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '0 6px', borderRadius: 8,
            color: SECONDARY, background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
          }}
        >
          <Folder size={10} style={{ flexShrink: 0 }} />
          {workingDirLabel(ownFolder, homeDir)}
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
      {job.effort !== undefined && (
        // The same quiet-clause shape as quiet mode and the
        // missed-run choice: a per-job override the schedule
        // line can state without a second badge. Shown for an
        // explicit 'auto' too — that is a deliberate choice that
        // outranks the app default, not the default itself.
        <span
          title={t('automation.effort.hint')}
          style={{ fontSize: 11, color: SECONDARY }}
        >
          {`· ${t('automation.effort.row', { level: t(`effort.${job.effort}`) })}`}
        </span>
      )}
      {job.alertPolicy === 'after_streak' && (
        // Only the non-default policy earns a clause: a job that
        // announces every failure (the default) stays silent
        // here, exactly like the effort override above.
        <span
          title={t('automation.alertPolicy.hint')}
          style={{ fontSize: 11, color: SECONDARY }}
        >
          {`· ${t('automation.alertPolicy.row')}`}
        </span>
      )}
    </div>
  )
}
