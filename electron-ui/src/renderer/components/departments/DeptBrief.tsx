// The department Brief panel: a ledger excerpt for the selected node and its
// subtree. It owns only the window toggle and presentation; every count and
// every "which dates are admissible" decision lives in `deptBrief.data.ts`.
//
// The panel deliberately reads as a record, not an analysis: no quality, no
// progress, no utilization. The footnotes say what the numbers cannot prove.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ScrollText, X } from 'lucide-react'
import { useDepartmentStore, type Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import type {
  AutomationDeptBudgetReportData,
  AutomationDeptSpendData,
} from '../../../preload'
import { useI18n } from '../../i18n'
import {
  deptDisplayName,
  formatRelativeTime,
  positionDisplayTitle,
} from './deptUtils'
import {
  briefSubtree,
  buildDeptBrief,
  type BriefSession,
  type BriefWindow,
} from './deptBrief.data'
import {
  buildDeptJobs,
  deptJobStateText,
  deptJobStatusText,
  deptJobStatusTone,
  type DeptJobsResult,
  type DeptJobStatusTone,
} from './deptJobs.data'
import { describeDeptSpend } from './deptSpend.data'
import {
  budgetCovers,
  describeDeptBudget,
  parseBudgetInput,
} from './deptBudget.data'
import { costText } from '../workflows/scheduleSummary'
import { nextRunText } from '../automation/nextRunText'
import type { AppLocale } from '../../utils/formatDate'

interface DeptBriefProps {
  dept: Department
  /** The whole tree — the subtree and its seats are derived from it. */
  departments: Department[]
  /** Every listed conversation; ownership is resolved by folder. */
  sessions: SessionListItem[]
  homeDir?: string
  loadingSessionId?: string | null
  /** `directory` is the owning node's folder when the row came from a descendant. */
  onOpenSession: (session: SessionListItem, directory?: string) => void
  onClose: () => void
}

const ACCENT = '#6366f1'

/** The tone names are shared with the department page; the tokens are this panel's. */
const STATUS_TONE_COLOR: Record<DeptJobStatusTone, string> = {
  running: 'var(--accent-text)',
  success: 'var(--success-text)',
  danger: 'var(--danger-text)',
  warning: 'var(--warning-text)',
  muted: 'var(--text-faint)',
}

export default function DeptBrief({
  dept,
  departments,
  sessions,
  homeDir,
  loadingSessionId,
  onOpenSession,
  onClose,
}: DeptBriefProps) {
  const { t, resolvedLocale } = useI18n()
  // A filing can move a conversation into or out of this subtree, so the panel
  // must re-derive when the map changes.
  const filings = useDepartmentStore(s => s.filings)
  const [briefWindow, setBriefWindow] = useState<BriefWindow>('today')
  // Evaluated when the panel opens and when the window changes, so the bounds
  // stay put while the user reads. Nothing is written to preferences.
  const [now, setNow] = useState(() => Date.now())

  // Jobs are read once when the panel mounts. `null` is not an empty list:
  // the source states below keep the loading/error cases distinguishable from
  // a real zero, so the panel never counts a failure as "no jobs".
  const [jobsSource, setJobsSource] = useState<
    { status: 'loading' | 'error'; jobs: null } | { status: 'ready'; jobs: unknown }
  >({ status: 'loading', jobs: null })

  useEffect(() => {
    let alive = true
    window.electronAPI.automationList()
      .then(result => {
        if (!alive) return
        setJobsSource({ status: 'ready', jobs: result?.jobs })
      })
      .catch(() => {
        if (alive) setJobsSource({ status: 'error', jobs: null })
      })
    return () => { alive = false }
  }, [])

  const selectWindow = (next: BriefWindow) => {
    setBriefWindow(next)
    setNow(Date.now())
  }

  const brief = useMemo(
    () => buildDeptBrief({
      nodes: departments,
      sessions: sessions as BriefSession[],
      rootId: dept.id,
      window: briefWindow,
      now,
      homeDir,
      filings,
    }),
    [departments, sessions, dept.id, briefWindow, now, homeDir, filings],
  )

  const nodeName = (nodeId: string): string => {
    const node = brief.nodes.find(n => n.id === nodeId)
    return node ? deptDisplayName(node, resolvedLocale) : ''
  }

  const nodeDirectory = (nodeId: string): string | undefined =>
    brief.nodes.find(n => n.id === nodeId)?.directory

  const jobs = useMemo(
    () => buildDeptJobs({
      jobs: jobsSource.jobs,
      nodeIds: departments.map(node => node.id),
      scopeIds: brief.nodes.map(node => node.id),
      window: brief.window,
      load: jobsSource.status,
    }),
    [jobsSource, departments, brief],
  )

  // Spend for exactly the window the counts above use. Main owns the arithmetic
  // (the same helper behind the spend rails); this panel only chooses how to say
  // it. `null` and a rejected IPC both become the "could not be read" state — a
  // failure is never rendered as `$0`.
  const [spend, setSpend] = useState<{
    /** Which department + window this answer belongs to. */
    scope: string
    status: 'loading' | 'ready' | 'error'
    summary: AutomationDeptSpendData | null
  }>({ scope: '', status: 'loading', summary: null })
  const spendSeq = useRef(0)
  const spendStart = brief.window.start
  const spendScope = `${dept.id}:${spendStart}`

  // The department's daily cap, as main stores it. The whole list is read
  // because main returns every cap; the Brief only shows its own node's entry.
  // `null` on a ready read is a real "no cap here", not an error.
  const [budgetVersion, setBudgetVersion] = useState(0)
  const [budget, setBudget] = useState<{
    /** Which department this answer belongs to. */
    scope: string
    status: 'loading' | 'ready' | 'error'
    report: AutomationDeptBudgetReportData | null
  }>({ scope: '', status: 'loading', report: null })
  const budgetSeq = useRef(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const scope = `${dept.id}:${spendStart}`
    const ids = briefSubtree(departments, dept.id).map(node => node.id)
    // A department or window change starts over; the previous figure must not
    // stand in for the new scope while the read is in flight.
    setSpend({ scope, status: 'loading', summary: null })

    const load = () => {
      // A late reply from the previous scope must not write into this one.
      const seq = ++spendSeq.current
      window.electronAPI.automationDeptSpend(ids, spendStart)
        .then(summary => {
          if (!alive || spendSeq.current !== seq) return
          setSpend({ scope, status: 'ready', summary })
        })
        .catch(() => {
          if (!alive || spendSeq.current !== seq) return
          setSpend({ scope, status: 'error', summary: null })
        })
    }

    load()
    // A finished run changes the figure and may move the cap's window numbers,
    // so one debounce drives both reads. The subscription is dropped on unmount.
    const off = window.electronAPI.onAutomationChanged(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        load()
        setBudgetVersion(v => v + 1)
      }, 300)
    })

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      off()
    }
  }, [departments, dept.id, spendStart])

  // Mount, a tree change, and a successful set/clear (or a finished run, via the
  // debounce above) all refetch the cap list. Keystrokes never do.
  useEffect(() => {
    let alive = true
    const seq = ++budgetSeq.current
    const scope = dept.id
    // Keep this department's previous report in hand but mark the read loading,
    // so a stale cap of another department is never printed while this one is
    // in flight.
    setBudget(prev => ({
      scope,
      status: 'loading',
      report: prev.scope === scope ? prev.report : null,
    }))

    const api = window.electronAPI
    if (!api?.automationDeptBudgets) {
      setBudget({ scope, status: 'error', report: null })
      return () => { alive = false }
    }

    api.automationDeptBudgets()
      .then(reports => {
        if (!alive || budgetSeq.current !== seq) return
        const list = Array.isArray(reports) ? reports : []
        setBudget({
          scope,
          status: 'ready',
          report: list.find(entry => budgetCovers(entry, dept.id)) ?? null,
        })
      })
      .catch(() => {
        if (!alive || budgetSeq.current !== seq) return
        // A rejected read is an unknown, never "no cap".
        setBudget({ scope, status: 'error', report: null })
      })

    return () => { alive = false }
  }, [departments, dept.id, budgetVersion])

  const windowLabel = briefWindow === 'today' ? t('dept.brief.today') : t('dept.brief.week')

  return (
    <section
      aria-label={t('dept.brief.title')}
      style={{
        flexShrink: 0,
        margin: '10px 24px 0',
        padding: '12px 14px 11px',
        background: 'var(--glass-bg-low)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        maxHeight: 'min(48vh, 440px)',
        overflowY: 'auto',
        animation: 'slideUp 0.15s ease',
      }}
    >
      {/* Title row ------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(99,102,241,0.12)', color: 'var(--accent-text)',
        }}>
          <ScrollText size={14} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
              {t('dept.brief.title')}
            </span>
            <span style={{
              fontSize: 11, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}>
              {deptDisplayName(dept, resolvedLocale)}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 1 }}>
            {brief.descendants.length > 0 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span>{t('dept.brief.scopeLabel')}</span>
                {brief.descendants.map(node => (
                  <span
                    key={node.id}
                    style={{
                      padding: '0 5px', borderRadius: 999,
                      background: 'var(--bg-hover)', color: 'var(--text-muted)',
                      fontSize: 9.5, lineHeight: '16px',
                    }}
                  >
                    {deptDisplayName(node, resolvedLocale)}
                  </span>
                ))}
              </span>
            ) : t('dept.brief.scopeSelf')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
          {(['today', 'week'] as const).map(value => {
            const active = briefWindow === value
            return (
              <button
                key={value}
                onClick={() => selectWindow(value)}
                aria-pressed={active}
                style={{
                  padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: active ? 'rgba(99,102,241,0.25)' : 'transparent',
                  color: active ? 'var(--accent-text-strong)' : 'var(--text-muted)',
                  fontSize: 10, cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {value === 'today' ? t('dept.brief.today') : t('dept.brief.week')}
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          aria-label={t('dept.brief.close')}
          title={t('dept.brief.close')}
          style={{
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Counts ---------------------------------------------------------- */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <BriefStat value={brief.counts.windowConversations} label={t('dept.brief.inWindow')} />
        <BriefStat
          value={brief.counts.activeConversations}
          label={t('dept.brief.active')}
          hint={t('dept.brief.activeHint')}
        />
        <BriefStat
          value={brief.counts.firstSeenConversations}
          label={t('dept.brief.firstSeen')}
          hint={t('dept.brief.firstSeenHint')}
        />
        <BriefStat value={brief.counts.openSeats} label={t('dept.brief.seats')} />
      </div>

      {/* Scheduled spend -------------------------------------------------- */}
      <BriefSpend
        // Before the effect resets it, a summary from the previous department
        // or window is treated as still loading rather than shown against the
        // counts now on screen.
        status={spend.scope === spendScope ? spend.status : 'loading'}
        summary={spend.scope === spendScope ? spend.summary : null}
        dept={dept}
        departments={departments}
        // Null while the job list is unknown: only a known empty list disables
        // setting a cap, because "no schedules" is a claim the read must support.
        scheduleCount={jobs.state === 'ready' ? (jobs.counts?.total ?? null) : null}
        // A late answer for the department that was showing is not this one's.
        budgetStatus={budget.scope === dept.id ? budget.status : 'loading'}
        budgetReport={budget.scope === dept.id ? budget.report : null}
        onBudgetChanged={() => setBudgetVersion(v => v + 1)}
      />

      {/* Empty states ---------------------------------------------------- */}
      {brief.empty === 'noNode' && (
        <BriefEmptyText title={t('dept.brief.emptyNoNode')} />
      )}
      {brief.empty === 'noSessions' && (
        <BriefEmptyText
          title={t('dept.brief.emptyNoSessionsTitle')}
          body={t('dept.brief.emptyNoSessionsBody')}
        />
      )}
      {brief.empty === 'noActivity' && (
        <BriefEmptyText
          title={t('dept.brief.emptyNoActivityTitle')}
          body={t('dept.brief.emptyNoActivityBody', { count: brief.counts.allTimeSessions })}
        />
      )}

      {/* Recent conversations -------------------------------------------- */}
      {brief.recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
            {t('dept.brief.recent')}
          </div>
          {brief.recent.map(row => {
            const title = row.session.title?.trim()
              || row.session.lastPrompt?.trim()
              || t('session.untitled')
            const busy = loadingSessionId === row.session.sessionId
            return (
              <button
                key={row.session.sessionId}
                onClick={() => onOpenSession(row.session, nodeDirectory(row.nodeId))}
                title={t('dept.brief.openSession', { title })}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 6px', borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: busy ? 'progress' : 'pointer',
                  opacity: busy ? 0.6 : 1, textAlign: 'left', minWidth: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {title}
                </span>
                {row.basis === 'created' && (
                  <span style={{
                    flexShrink: 0, fontSize: 9, lineHeight: '15px', padding: '0 5px',
                    borderRadius: 999, background: 'rgba(99,102,241,0.12)',
                    color: 'var(--accent-text)',
                  }}>
                    {t('dept.brief.createdTag')}
                  </span>
                )}
                <span style={{
                  flexShrink: 0, fontSize: 10, color: 'var(--text-faint)',
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {row.engine === 'codex' ? t('dept.engineCodex') : t('dept.engineClaude')}
                  {' · '}
                  {formatRelativeTime(row.at, t, resolvedLocale)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Scheduled jobs -------------------------------------------------- */}
      <BriefJobs summary={jobs} t={t} locale={resolvedLocale} now={now} />

      {/* Seats ----------------------------------------------------------- */}
      {brief.seats.length > 0 && (
        <div style={{ marginTop: 9 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            {t('dept.brief.seats')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {brief.seats.map(seat => (
              <span
                key={`${seat.nodeId}:${seat.position.id}`}
                title={seat.position.brief || seat.position.title}
                style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 4,
                  padding: '2px 8px', borderRadius: 999,
                  border: '1px dashed var(--border)', background: 'transparent',
                  fontSize: 10.5, color: 'var(--text-secondary)', maxWidth: '100%',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {positionDisplayTitle(seat.position, resolvedLocale)}
                </span>
                {seat.nodeId !== dept.id && (
                  <span style={{ fontSize: 9.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    {nodeName(seat.nodeId)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Written limits -------------------------------------------------- */}
      <div style={{
        marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {t('dept.brief.limits')}
        </div>
        <BriefNote>{t('dept.brief.noteFiling')}</BriefNote>
        <BriefNote>{t('dept.brief.noteEngines')}</BriefNote>
        {brief.disclosures.firstTimestampMissing > 0 && (
          <BriefNote>{t('dept.brief.noteMissingFirst', { count: brief.disclosures.firstTimestampMissing })}</BriefNote>
        )}
        <BriefNote>{t('dept.brief.noteMessages')}</BriefNote>
        <BriefNote>{t('dept.brief.noteLocal')}</BriefNote>
        <BriefNote>{t('dept.brief.jobsNoDepartment')}</BriefNote>
        <BriefNote>{t('dept.brief.jobsHistoryBounded')}</BriefNote>
        {(jobs.counts?.jobsAtHistoryCap ?? 0) > 0 && (
          <BriefNote>{t('dept.brief.jobsHistoryAtCap', { count: jobs.counts?.jobsAtHistoryCap ?? 0 })}</BriefNote>
        )}
        <BriefNote>{t('dept.brief.jobsNotProof')}</BriefNote>
      </div>

      {/* The window is stated once, in words, next to the limits. */}
      <div style={{ marginTop: 6, fontSize: 9.5, color: 'var(--text-faint)' }}>
        {windowLabel} · {new Date(brief.window.start).toLocaleString(resolvedLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {' – '}
        {new Date(brief.window.end).toLocaleString(resolvedLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </section>
  )
}

// ── Scheduled spend ──────────────────────────────────────────────────────────

function BriefSpend({
  status,
  summary,
  dept,
  departments,
  scheduleCount,
  budgetStatus,
  budgetReport,
  onBudgetChanged,
}: {
  status: 'loading' | 'ready' | 'error'
  summary: AutomationDeptSpendData | null
  dept: Department
  departments: Department[]
  /** Owned scheduled jobs, or null when that read cannot support a claim yet. */
  scheduleCount: number | null
  budgetStatus: 'loading' | 'ready' | 'error'
  budgetReport: AutomationDeptBudgetReportData | null
  onBudgetChanged: () => void
}) {
  const { t } = useI18n()
  // Nothing loud while the read is in flight: no placeholder figure, no `$0`.
  if (status === 'loading') return null

  // An `error` status and a `ready` + `null` answer are the same claim: the
  // request did not produce a summary, so the cost is unknown.
  const facts = describeDeptSpend(status === 'ready' ? summary : null)
  const partialNote = facts.partial && facts.kind !== 'unreadable' && facts.kind !== 'no-jobs'
    ? t('dept.spend.partialNote')
    : null

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3,
      }}>
        {t('dept.spend.label')}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        {facts.kind === 'reported' && facts.usd !== undefined && (
          <>
            <span
              title={t('dept.spend.floorNote')}
              style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
                cursor: 'help',
              }}
            >
              {facts.lowerBound ? '≥ ' : ''}{costText(facts.usd)}
            </span>
            {facts.runsText && facts.runsText.attempted > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {t('dept.spend.runs', { count: facts.runsText.attempted })}
              </span>
            )}
          </>
        )}

        {facts.kind === 'unmeasured' && (
          <>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {t('dept.spend.unmeasured')}
            </span>
            {facts.runsText && facts.runsText.attempted > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {t('dept.spend.runs', { count: facts.runsText.attempted })}
              </span>
            )}
          </>
        )}

        {facts.kind === 'no-runs' && (
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('dept.spend.noRuns')}
          </span>
        )}

        {facts.kind === 'no-jobs' && (
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('dept.spend.noJobs')}
          </span>
        )}

        {facts.kind === 'unreadable' && (
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('dept.spend.unreadable')}
          </span>
        )}
      </div>

      {facts.kind === 'reported' && facts.lowerBound
        && facts.runsText && facts.runsText.unreported > 0 && (
          <BriefNote>{t('dept.spend.lowerBoundNote')}</BriefNote>
        )}
      {partialNote && <BriefNote>{partialNote}</BriefNote>}

      <BriefBudget
        dept={dept}
        departments={departments}
        scheduleCount={scheduleCount}
        status={budgetStatus}
        report={budgetReport}
        onChanged={onBudgetChanged}
      />
    </div>
  )
}

// ── Daily cap on unattended spend ────────────────────────────────────────────

/**
 * The cap control lives under the spend figure because it is the same money
 * question, asked as a limit rather than a report. Main enforces it; this
 * surface only sets, edits and clears the stored cap, and says what the last
 * window did with it.
 */
function BriefBudget({
  dept,
  departments,
  scheduleCount,
  status,
  report,
  onChanged,
}: {
  dept: Department
  departments: Department[]
  scheduleCount: number | null
  status: 'loading' | 'ready' | 'error'
  report: AutomationDeptBudgetReportData | null
  onChanged: () => void
}) {
  const { t } = useI18n()
  const facts = describeDeptBudget(report, status)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<'saved' | 'cleared' | null>(null)

  // A known empty job list is the only evidence that a cap would cover nothing.
  // Loading or a failed jobs read leaves the control usable rather than guessing.
  const noSchedules = scheduleCount === 0

  // Hooks must run before any early return.
  if (facts.state === 'loading') return null

  const openEditor = () => {
    setDraft(report && facts.capUsd !== undefined ? String(facts.capUsd) : '')
    setError(null)
    setNotice(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft('')
    setError(null)
  }

  const parseError = (reason: 'empty' | 'nan' | 'negative' | 'zero' | 'tooLarge'): string =>
    reason === 'tooLarge' ? t('dept.budget.tooLarge') : t('dept.budget.invalidLimit')

  // Main's refusal is a string, not a code contract; map the common reasons and
  // fall back to the generic failure rather than printing raw IPC text.
  const refusalText = (reason?: string): string => {
    const text = (reason || '').toLowerCase()
    if (text.includes('member') || text.includes('node') || text.includes('cover')) {
      return t('dept.budget.noMembers')
    }
    if (text.includes('usd') || text.includes('amount') || text.includes('limit')
      || text.includes('number') || text.includes('positive')) {
      return t('dept.budget.invalidLimit')
    }
    return t('dept.budget.saveFailed')
  }

  // Never optimistic: the line changes only after main says the cap changed.
  const submit = (usd: number | null): void => {
    if (pending) return
    const api = window.electronAPI
    if (!api?.automationDeptBudgetSet) {
      setError(t('dept.budget.saveFailed'))
      return
    }

    const memberIds = briefSubtree(departments, dept.id).map(node => node.id)
    setPending(true)
    setError(null)
    setNotice(null)

    let call: Promise<{ ok: boolean; error?: string }>
    try {
      call = api.automationDeptBudgetSet({ departmentId: dept.id, usd, memberIds })
    } catch {
      setPending(false)
      setError(t('dept.budget.saveFailed'))
      return
    }

    Promise.resolve(call)
      .then(result => {
        if (result?.ok) {
          setEditing(false)
          setDraft('')
          setNotice(usd === null ? 'cleared' : 'saved')
          // The server's answer is the new cap; re-read it rather than trusting
          // the typed number, which main may have rounded or refused.
          onChanged()
        } else {
          // Keep the input open with what the user typed.
          setError(refusalText(result?.error))
        }
      })
      .catch(() => setError(t('dept.budget.saveFailed')))
      .finally(() => setPending(false))
  }

  const saveDraft = () => {
    const parsed = parseBudgetInput(draft)
    if (!parsed.ok) {
      setError(parseError(parsed.reason))
      return
    }
    submit(parsed.usd)
  }

  const editor = editing && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px',
          background: 'var(--bg-primary)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginRight: 2 }}>$</span>
          <input
            autoFocus
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveDraft() }
              else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
            }}
            inputMode="decimal"
            placeholder={t('dept.budget.placeholder')}
            disabled={pending}
            aria-label={t('dept.budget.setAction')}
            style={{
              width: 112, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--text-primary)', fontSize: 11,
              fontVariantNumeric: 'tabular-nums', padding: 0,
            }}
          />
        </span>
        <TextButton
          disabled={pending || noSchedules}
          title={noSchedules ? t('dept.budget.noSchedules') : undefined}
          onClick={saveDraft}
        >
          {pending ? t('dept.budget.saving') : t('dept.budget.saveAction')}
        </TextButton>
        <TextButton disabled={pending} onClick={() => submit(null)}>
          {t('dept.budget.clearAction')}
        </TextButton>
        <TextButton disabled={pending} onClick={cancelEdit}>
          {t('dept.budget.cancelAction')}
        </TextButton>
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 2 }}>
        {t('dept.budget.windowNote')}
      </div>
    </>
  )

  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {t('dept.budget.label')}
        </span>

        {facts.state === 'error' && (
          <>
            <span style={{ fontSize: 10.5, color: 'var(--warning-text)', lineHeight: 1.5 }}>
              {t('dept.budget.readError')}
            </span>
            <TextButton onClick={onChanged}>{t('dept.budget.retry')}</TextButton>
          </>
        )}

        {facts.state === 'none' && !editing && (
          <TextButton
            disabled={noSchedules}
            title={noSchedules ? t('dept.budget.noSchedules') : undefined}
            onClick={openEditor}
          >
            {t('dept.budget.setAction')}
          </TextButton>
        )}

        {facts.state === 'set' && facts.capUsd !== undefined && (
          <>
            {facts.spentUsd !== undefined ? (
              <span
                title={facts.floor ? t('dept.budget.floorNote') : undefined}
                style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
                  cursor: facts.floor ? 'help' : 'default',
                }}
              >
                {facts.floor ? '≥ ' : ''}
                {t('dept.budget.spentOfCap', {
                  spent: costText(facts.spentUsd),
                  cap: costText(facts.capUsd),
                })}
              </span>
            ) : (
              <span
                title={facts.floor ? t('dept.budget.floorNote') : undefined}
                style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}
              >
                {t('dept.budget.spentUnmeasured')}
              </span>
            )}
            {!editing && (
              <>
                <TextButton
                  disabled={noSchedules}
                  title={noSchedules ? t('dept.budget.noSchedules') : undefined}
                  onClick={openEditor}
                >
                  {t('dept.budget.editAction')}
                </TextButton>
                <TextButton disabled={pending} onClick={() => submit(null)}>
                  {t('dept.budget.clearAction')}
                </TextButton>
              </>
            )}
          </>
        )}

        {notice === 'saved' && (
          <span role="status" style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>
            {t('dept.budget.saved')}
          </span>
        )}
        {notice === 'cleared' && (
          <span role="status" style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>
            {t('dept.budget.cleared')}
          </span>
        )}
      </div>

      {facts.state === 'set' && (
        facts.coversNodes === 0 ? (
          <div style={{ fontSize: 9.5, color: 'var(--warning-text)', lineHeight: 1.5 }}>
            {t('dept.budget.coversNone')}
          </div>
        ) : (
          <div style={{ fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {t('dept.budget.coversSchedules', { count: facts.coversNodes })}
          </div>
        )
      )}

      {facts.state === 'set' && facts.heldRuns > 0 && (
        <div
          role="status"
          title={t('dept.budget.manualExempt')}
          style={{
            fontSize: 10, color: 'var(--warning-text)', lineHeight: 1.5,
            cursor: 'help',
          }}
        >
          {t('dept.budget.heldNote', { count: facts.heldRuns })}
        </div>
      )}

      {editor}

      {error && (
        <div role="alert" style={{ fontSize: 9.5, color: 'var(--danger-text)', lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  )
}

/** A text-sized action, kept at the panel's label scale rather than a button chip. */
function TextButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: 0, border: 'none', background: 'none',
        fontSize: 10, lineHeight: 1.4,
        color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textDecoration: disabled ? 'none' : 'underline',
        textUnderlineOffset: 2,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Scheduled jobs ───────────────────────────────────────────────────────────

function BriefJobs({
  summary,
  t,
  locale,
  now,
}: {
  summary: DeptJobsResult
  t: (key: string, params?: Record<string, string | number>) => string
  locale: AppLocale
  now: number
}) {
  const counts = summary.counts
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
        {t('dept.jobs.title')}
      </div>

      {summary.state === 'loading' && (
        <BriefJobsHint>{t('dept.jobs.loading')}</BriefJobsHint>
      )}
      {(summary.state === 'error' || summary.state === 'unreadable') && (
        <BriefJobsHint>{t('dept.jobs.unreadable')}</BriefJobsHint>
      )}

      {summary.state === 'ready' && counts && (
        <>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('dept.brief.jobsScope', {
              total: counts.total,
              enabled: counts.enabled,
              disabled: counts.disabled,
            })}
          </div>

          {counts.total === 0 ? (
            <BriefJobsHint>{t('dept.jobs.none')}</BriefJobsHint>
          ) : (
            <>
              {counts.runsInWindow === 0 && counts.skippedInWindow === 0 ? (
                <BriefJobsHint>{t('dept.brief.jobsRunsNone')}</BriefJobsHint>
              ) : (
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {counts.runsInWindow > 0 && t('dept.brief.jobsRuns', {
                    runs: counts.runsInWindow,
                    succeeded: counts.succeededInWindow,
                    failed: counts.failedInWindow,
                  })}
                  {counts.runsInWindow > 0 && counts.skippedInWindow > 0 && ' · '}
                  {counts.skippedInWindow > 0 && t('dept.brief.jobsSkips', {
                    count: counts.skippedInWindow,
                  })}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3 }}>
                {summary.rows.map(job => (
                  <BriefJobRow key={job.id} job={job} t={t} locale={locale} now={now} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function BriefJobRow({
  job,
  t,
  locale,
  now,
}: {
  job: DeptJobsResult['rows'][number]
  t: (key: string, params?: Record<string, string | number>) => string
  locale: AppLocale
  now: number
}) {
  const runParts: string[] = []
  if (job.runsInWindow > 0) {
    runParts.push(t('dept.brief.jobsRowRuns', { count: job.runsInWindow }))
  }
  if (job.skippedInWindow > 0) {
    runParts.push(t('dept.brief.jobsRowSkips', { count: job.skippedInWindow }))
  }
  const statusColor = STATUS_TONE_COLOR[deptJobStatusTone(job)]
  // A globally paused job keeps an enabled switch but will not fire; its stored
  // next occurrence is not a promise, so the sentence is replaced rather than
  // printed as if scheduling were live.
  const nextText = job.enabled && job.pausedAll
    ? t('dept.jobs.pausedAll')
    : nextRunText(job, t, locale, now).text

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
      padding: '2px 0', minWidth: 0,
    }}>
      <span
        title={job.name}
        style={{
          flex: '1 1 110px', minWidth: 0, fontSize: 11, color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {job.name}
      </span>
      <span style={{
        flexShrink: 0, fontSize: 9, lineHeight: '15px', padding: '0 5px',
        borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-muted)',
      }}>
        {deptJobStateText(job, t)}
      </span>
      <span
        // Same wording and reason as the department page: the cap held a run
        // that never started, and a manual run is not subject to it.
        title={job.lastHeld ? t('dept.jobs.statusHeldTip') : undefined}
        style={{
          flexShrink: 0, fontSize: 10, color: statusColor,
          cursor: job.lastHeld ? 'help' : undefined,
        }}
      >
        {deptJobStatusText(job, t)}
      </span>
      <span
        title={nextText}
        style={{
          flexShrink: 0, fontSize: 9.5, color: 'var(--text-faint)',
          maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {nextText}
      </span>
      {runParts.length > 0 && (
        <span style={{ flexShrink: 0, fontSize: 9.5, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {runParts.join(' · ')}
        </span>
      )}
    </div>
  )
}

function BriefJobsHint({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

// ── Small presentational pieces ─────────────────────────────────────────────

function BriefStat({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div style={{
      flex: '1 1 90px', minWidth: 82,
      padding: '6px 8px', borderRadius: 8,
      background: 'rgba(99,102,241,0.05)',
      border: `1px solid ${ACCENT}22`,
      display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center',
    }}>
      <span style={{
        fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
      }}>
        {value}
      </span>
      <span
        title={hint}
        style={{
          fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.35,
          cursor: hint ? 'help' : 'default',
        }}
      >
        {label}
      </span>
    </div>
  )
}

function BriefEmptyText({ title, body }: { title: string; body?: string }) {
  return (
    <div style={{
      marginTop: 10, padding: '10px 12px', borderRadius: 8,
      border: '1px dashed var(--border)',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</span>
      {body && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{body}</span>}
    </div>
  )
}

function BriefNote({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
      paddingLeft: 9, position: 'relative',
    }}>
      <span style={{ position: 'absolute', left: 1, top: 0, color: 'var(--text-faint)' }}>·</span>
      {children}
    </div>
  )
}
