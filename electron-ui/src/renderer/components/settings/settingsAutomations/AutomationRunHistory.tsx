// One job's run-history disclosure: the summary line, the failures-only chip,
// every run row and its clauses, the per-run file panel, and "Show all" /
// "Show fewer".
//
// It was the `<details>` block inside one job row of `SettingsAutomations.tsx`.
// The row still owns the disclosure's open/closed state and hands the resolved
// view down; everything below is the same markup in the same order.

import { type ReactNode } from 'react'
import { AlertTriangle, Check, Clock, History, X } from 'lucide-react'
import { RUN_HISTORY_CAP, viewRunHistory } from '../runHistoryView'
import { viewRunFiles } from '../runFilesView'
import { RUN_FILES_LINK, QUIET_LINK } from './automationSettingsStyles'
import { approvalClause, approvalTone, approvalTooltip } from '../../automation/runApproval'
import { SECONDARY, WARNING } from '../../automation/automationStyles'
import { formatTokens } from '../../../utils/formatUtils'
import type {
  AutomationJobData,
  AutomationLimitsData,
  AutomationRunApprovalData,
  AutomationRunRecordData,
} from '../../../../preload'
import {
  clipText,
  costText,
  durationText,
  errorText,
  handbookLine,
  memoryLine,
  runStatus,
  timeText,
  type Translate,
} from './automationStatusText'
import { AutomationRunFilesPanel } from './AutomationRunFiles'

/** Which runs a job's history disclosure is currently showing, and how. */
export type RunHistoryUi = { expanded: boolean; failuresOnly: boolean }

export const RUN_HISTORY_UI_DEFAULT: RunHistoryUi = { expanded: false, failuresOnly: false }

/**
 * The tone and glyph of one held-request clause in the run history.
 *
 * An approval is a success; a denial the user gave is their own decision and
 * stays neutral, so it is not dressed up as a fault. A deadline, a cap refusal
 * or a lost run is a warning, and a run interrupted mid-wait is a failure.
 * The glyph repeats that in a form colour alone cannot carry: a timeout shows a
 * clock, a denial an X, so the two are distinguishable without hue.
 */
function approvalClauseMark(
  outcome: AutomationRunApprovalData['outcome'],
): { color?: string; icon: ReactNode } {
  switch (approvalTone(outcome)) {
    case 'approved': return { color: 'var(--success-text)', icon: <Check size={9} aria-hidden /> }
    case 'denied': return { icon: <X size={9} aria-hidden /> }
    case 'expired': return { color: WARNING, icon: <Clock size={9} aria-hidden /> }
    case 'refused': return { color: WARNING, icon: <AlertTriangle size={9} aria-hidden /> }
    case 'interrupted': return { color: 'var(--danger-text)', icon: <AlertTriangle size={9} aria-hidden /> }
  }
}

export function AutomationRunHistory({
  t,
  locale,
  job,
  historyUi,
  limits,
  runFilesOpen,
  onPatchHistoryUi,
  onResetHistoryUi,
  onToggleRunFiles,
  onOpenRun,
  onSaveAsTask,
  savingRunKey,
}: {
  t: Translate
  locale: string
  job: AutomationJobData
  historyUi: RunHistoryUi
  limits: AutomationLimitsData | null
  runFilesOpen: Record<string, boolean>
  onPatchHistoryUi: (patch: Partial<RunHistoryUi>) => void
  onResetHistoryUi: () => void
  onToggleRunFiles: (key: string) => void
  onOpenRun: (sessionId: string) => void
  onSaveAsTask: (record: AutomationRunRecordData) => void
  /** `${job.id}:${startedAt}` while that run's save is in flight. */
  savingRunKey: string | null
}) {
  // The pure view selects which records are visible (five, every one, or every
  // failure); it returns them in stored order, so the disclosure's long-standing
  // newest-first presentation is made here, once. A job that has never run keeps
  // the disclosure unmounted rather than opening onto an empty table.
  const historyView = viewRunHistory(job.history, {
    failuresOnly: historyUi.failuresOnly,
    expanded: historyUi.expanded,
  })
  const runRows = historyView.rows.slice().reverse()
  const durationOf = (ms: number | null): string | null => durationText(t, ms)
  // A stable ordinal per stored record, independent of the visible slice.
  //
  // `runIndex` below counts only the rows on screen, so keying an open file
  // panel (or a <li>) by it meant that turning on the failures-only chip — or
  // "Show all" — renumbered every row: the panel collapsed, or worse, stayed
  // open against a *different* run. The stored position cannot move while the
  // job's history is unchanged. Rows are references into `job.history` (see
  // `viewRunHistory`), so identity is the right key here.
  const storedOrdinal = new Map<AutomationRunRecordData, number>()
  job.history.forEach((record, index) => { storedOrdinal.set(record, index) })

  return (
    // Native <details> gives a collapsed-by-default, keyboard operable
    // disclosure without local state; the row grows only when the user asks it
    // to. Closing it forgets the per-job view, so reopening starts from five
    // rows again.
    <details
      style={{ marginTop: 3 }}
      onToggle={event => {
        if (!event.currentTarget.open) onResetHistoryUi()
      }}
    >
      <summary style={{
        width: 'fit-content', cursor: 'pointer',
        fontSize: 11, color: SECONDARY, lineHeight: 1.45,
      }}>
        {/* Keep the native disclosure marker: it is the one affordance that
            says "this expands" without CSS. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <History size={11} />
          {t('automation.history.summary', {
            count: Math.min(job.history.length, RUN_HISTORY_CAP),
          })}
        </span>
      </summary>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {/* A chip, not a second disclosure: it narrows the list already on
            screen. The count stays visible at zero so the empty state below is
            reachable and the user can see there is nothing to find. */}
        <button
          type="button"
          aria-pressed={historyUi.failuresOnly}
          onClick={() => onPatchHistoryUi({
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
        {runRows.map((record: AutomationRunRecordData, runIndex: number) => {
          const state = runStatus(t, record)
          const duration = durationText(t, record.durationMs)
          const runUsage = record.usage
          const tokens = runUsage ? runUsage.inputTokens + runUsage.outputTokens : 0
          const cost = runUsage?.costUsd !== undefined && runUsage.costUsd > 0
            ? costText(runUsage.costUsd)
            : null
          // A skip's status already says why it did not run;
          // only a failure carries an extra explanation.
          const detail = record.status === 'error' && record.error ? errorText(t, record.error) : ''
          const memory = memoryLine(t, record.memory)
          // Only a real snapshot can be truncated; a failed
          // read has nothing to clip and must not imply one.
          const memoryTruncated = record.memory?.state === 'ok' && record.memory.truncated
          const handbook = handbookLine(t, record.handbook)
          const fileView = viewRunFiles(record.changedFiles)
          // Identity, not position: the panel stays with its run when the
          // filter changes the row numbering.
          const recordOrdinal = storedOrdinal.get(record) ?? runIndex
          const filesKey = `${job.id}:${record.startedAt}:${recordOrdinal}`
          const filesOpen = runFilesOpen[filesKey] === true
          const fileLabel = fileView.coverage === 'captured'
            ? fileView.totalFiles === 1
              ? t('automation.files.countOne')
              : t('automation.files.countMany', { count: fileView.totalFiles })
            : t('automation.files.none')
          const sessionId = record.sessionId
          // A run with a transcript has output worth keeping — a failure can
          // leave the answer that came before the error. A skip has no
          // transcript, so the action is absent rather than disabled-unexplained.
          const saveKey = `${job.id}:${record.startedAt}`
          const saveable = !!sessionId
          return (
            <li
              key={`${record.startedAt}-${recordOrdinal}`}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                fontSize: 11, color: SECONDARY, lineHeight: 1.45,
              }}
            >
              <span>{timeText(record.startedAt, locale)}</span>
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
              {record.announcement === 'held' && (
                // A first failure whose alert the policy held.
                // It is written in words, not a bare colour: a
                // reader must not mistake it for a quiet success
                // or for a run that announced nothing.
                <span
                  style={{ color: WARNING }}
                  title={t('automation.alertPolicy.heldHint')}
                >
                  {t('automation.alertPolicy.held')}
                </span>
              )}
              {(record.approvals ?? []).map((approval, approvalIndex) => {
                // Who answered, how, after how long. One span
                // per request: a run may have held several over
                // its life. The verbatim ask is in the tooltip
                // rather than in the row, which already carries
                // time, status, duration and spend; the glyph
                // makes a timeout readable apart from a denial
                // without relying on colour.
                const mark = approvalClauseMark(approval.outcome)
                return (
                  <span
                    key={`${approval.askedAt}-${approvalIndex}`}
                    title={approvalTooltip(approval, t)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      color: mark.color, lineHeight: 1.5,
                    }}
                  >
                    {/* The glyph keeps its size while the
                        sentence wraps on a narrow row. */}
                    <span style={{ display: 'inline-flex', flexShrink: 0 }}>{mark.icon}</span>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {approvalClause(approval, t, durationOf)}
                    </span>
                  </span>
                )
              })}
              {record.chain?.nextJobId && (
                // What followed this run. The name is the one
                // held at start time; the job may since have
                // been renamed, which is why the id is the key.
                <span
                  style={{ color: 'var(--accent-text)' }}
                  title={t('automation.chain.historyStartedHint')}
                >
                  {t('automation.chain.historyStarted', {
                    name: record.chain.nextJobName ?? record.chain.nextJobId,
                  })}
                </span>
              )}
              {record.chain?.note && (
                // The chain named a successor and it did not
                // start. Warning-toned: the user configured a
                // follow-up that did not happen, and this is the
                // only place it is recorded.
                <span style={{ color: WARNING }} title={t('automation.chain.noteHint')}>
                  {t(`automation.chain.note.${record.chain.note}`, {
                    depth: limits?.chainMaxDepth ?? 4,
                  })}
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
              {handbook && (
                // The desk's standing rules, in the same quiet
                // shape as the memory clause above. Absences
                // are printed with their reason rather than
                // skipped — a run that lost its rules must be
                // explainable after the fact.
                <span
                  style={handbook.color ? { color: handbook.color } : undefined}
                  title={handbook.title}
                >
                  {handbook.text}
                </span>
              )}
              {handbook?.truncated && (
                <span title={handbook.truncated.title}>
                  {handbook.truncated.text}
                </span>
              )}
              {handbook?.stale && (
                <span title={handbook.stale.title}>
                  {handbook.stale.text}
                </span>
              )}
              {fileView.coverage !== 'unrecorded' && (
                // Present-but-empty is a real answer ("no
                // file-editing calls seen"), so it stays
                // visible; an unrecorded run keeps the row
                // silent rather than implying an empty set.
                <button
                  type="button"
                  onClick={() => onToggleRunFiles(filesKey)}
                  aria-expanded={filesOpen}
                  aria-label={fileView.coverage === 'captured'
                    ? t('automation.files.aria', { time: timeText(record.startedAt, locale) })
                    : t('automation.files.none')}
                  title={t('automation.files.coverageNote')}
                  style={RUN_FILES_LINK}
                >
                  {fileLabel}
                </button>
              )}
              {duration && <span>{duration}</span>}
              {tokens > 0 && <span>{t('automation.usage.tokens', { count: formatTokens(tokens) })}</span>}
              {cost && <span>{cost}</span>}
              {record.late && <span>{t('automation.ranLate')}</span>}
              {sessionId && (
                <button
                  type="button"
                  onClick={() => onOpenRun(sessionId)}
                  aria-label={t('automation.history.openAria', { time: timeText(record.startedAt, locale) })}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    font: 'inherit', fontSize: 11,
                    color: 'var(--accent-text)', cursor: 'pointer',
                  }}
                >
                  {t('automation.history.open')}
                </button>
              )}
              {saveable && (
                <button
                  type="button"
                  disabled={savingRunKey === saveKey}
                  onClick={() => onSaveAsTask(record)}
                  title={t('automation.saveAsTask.hint')}
                  aria-label={t('automation.saveAsTask.action')}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    font: 'inherit', fontSize: 11,
                    color: 'var(--accent-text)',
                    cursor: savingRunKey === saveKey ? 'default' : 'pointer',
                    opacity: savingRunKey === saveKey ? 0.55 : 1,
                  }}
                >
                  {savingRunKey === saveKey
                    ? t('automation.saveAsTask.saving')
                    : t('automation.saveAsTask.action')}
                </button>
              )}
              {filesOpen && fileView.coverage !== 'unrecorded' && (
                <AutomationRunFilesPanel t={t} fileView={fileView} />
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
          onClick={() => onPatchHistoryUi({ expanded: true })}
          style={QUIET_LINK}
        >
          {t('automation.history.showAll', { count: historyView.totalCount })}
        </button>
      )}
      {historyView.canShowFewer && (
        <button
          type="button"
          onClick={() => onPatchHistoryUi({ expanded: false })}
          style={QUIET_LINK}
        >
          {t('automation.history.showFewer')}
        </button>
      )}
    </details>
  )
}
