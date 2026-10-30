// Scheduled spend, split out of `DeptBrief` so the panel keeps to its size
// ceiling. Presentation only: what the figure can and cannot prove comes from
// `deptSpend.data.ts`, and the cap control under it has its own file.

import type { Department } from '../../store'
import type {
  AutomationDeptBudgetReportData,
  AutomationDeptSpendData,
} from '../../../preload'
import { useI18n } from '../../i18n'
import { describeDeptSpend } from './deptSpend.data'
import BriefNote from './DeptBriefNote'
import DeptBriefBudget from './DeptBriefBudget'
import { costText } from '../workflows/scheduleSummary'

export default function BriefSpend({
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

      <DeptBriefBudget
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
