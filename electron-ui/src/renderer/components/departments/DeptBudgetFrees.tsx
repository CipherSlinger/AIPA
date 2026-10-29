// One muted line under a budget figure: when the cap is expected to free.
//
// The same words in the department Brief's cap card and in the background
// popover's held group, because two renderings of one forecast drifting apart is
// how a user stops trusting either. Presentation only: `describeDeptBudgetFrees`
// owns what may be claimed, and anything that is not a time or a named reason
// prints nothing — an under-cap report says nothing at all, and an absent
// forecast never becomes a number here.
//
// The sentence is about the cap, never about work: a held occurrence is gone,
// and this says when the limit stops holding, not that something will run then.
// The time is formatted by the app's one date formatter, so this line cannot
// introduce a fourth way to write a moment.

import { useI18n } from '../../i18n'
import { formatDateTimeShort } from '../../utils/formatDate'
import type { AutomationDeptBudgetReportData } from '../../../preload'
import { budgetUnreportedRuns, describeDeptBudgetFrees } from './deptBudget.data'

export default function DeptBudgetFrees({
  report,
}: {
  report: AutomationDeptBudgetReportData | null | undefined
}) {
  const { t, resolvedLocale } = useI18n()
  const frees = describeDeptBudgetFrees(report)
  if (frees.kind !== 'at' && frees.kind !== 'unknown') return null

  // A legacy or hand-built report can be over the cap while naming no reason
  // and no unusable run: then the count is zero and a sentence about "0 runs"
  // would contradict itself, so the generic wording says only what is known.
  const unreported = frees.kind === 'unknown' && frees.why === 'unmeasured'
    ? budgetUnreportedRuns(report)
    : 0
  const text = frees.kind === 'at'
    ? t('dept.budget.frees.at', { time: formatDateTimeShort(resolvedLocale, frees.at) })
    : frees.why === 'partial'
      ? t('dept.budget.frees.unknownPartial')
      : unreported > 0
        ? t('dept.budget.frees.unknownUnmeasured', { count: unreported })
        : t('dept.budget.frees.unknownGeneric')

  return (
    <div style={{ fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
      {text}
    </div>
  )
}
