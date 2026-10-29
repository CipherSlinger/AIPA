// The pure text builders behind the automations page: a job's status line, its
// spend line, one run's outcome, memory and handbook clauses, and the global
// budget readout.
//
// They lived inside the page component as `useCallback`s. They are plain
// functions here because nothing about them is stateful: every value they read
// arrives as an argument, so the page and the row it mounts call the same code
// and cannot word the same fact differently. The translations and the locale
// are passed in, which is why these functions never touch a hook.

import { formatTokens } from '../../../utils/formatUtils'
import { isHeldJob } from '../../automation/jobHold'
import { RUN_APPROVAL_TIMEOUT_MINUTES } from '../../automation/runApproval'
import { SECONDARY, WARNING } from '../../automation/automationStyles'
import type {
  AutomationGlobalSpendData,
  AutomationHandbookDigestData,
  AutomationJobData,
  AutomationMemoryDigestData,
  AutomationRunRecordData,
} from '../../../../preload'

/** The shape of the `t` the i18n provider hands out. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Money as the engine reported it. Costs stay compact: a settings row has room
 * for `$0.03`, and very small amounts keep a third digit instead of rounding
 * away to `$0.00`.
 */
export function costText(usd: number): string {
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
export function clipText(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

/** A start stamp in the user's locale, as every row on this page shows it. */
export function timeText(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale)
}

/** A scheduler or trash error code as a sentence, falling back to the code. */
export function errorText(t: Translate, code: string | null): string {
  if (!code) return ''
  const key = `automation.errors.${code}`
  const translated = t(key)
  return translated === key ? code : translated
}

/** One past run's outcome, in the same words the status line uses. */
export function runStatus(
  t: Translate,
  record: AutomationRunRecordData,
): { text: string; color: string } {
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
}

/** Compact duration: whole minutes once a run passes one, seconds below. */
export function durationText(t: Translate, ms: number | null): string | null {
  if (ms === null) return null
  if (ms < 60_000) {
    const seconds = ms / 1000
    return t('automation.history.seconds', {
      seconds: seconds < 10 ? seconds.toFixed(1).replace(/\.0$/, '') : String(Math.round(seconds)),
    })
  }
  return t('automation.history.minutes', { minutes: Math.round(ms / 60_000) })
}

/**
 * The memory snapshot a run saw, as one compact fact: which tiers, how many
 * characters, whether a budget clipped it. A failed read gets its own words
 * because "no memory" and "memory unavailable" are different answers to the
 * same post-mortem question. Returns null for legacy records and skips, which
 * have no digest — the row must say nothing rather than invent one.
 */
export function memoryLine(
  t: Translate,
  memory: AutomationMemoryDigestData | undefined,
): {
  text: string
  title: string
  color?: string
  /** A successful snapshot that still skipped some files, shown separately. */
  unreadable?: { text: string; title: string }
} | null {
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
}

/**
 * The department handbook an unattended run carried — or the reason it
 * carried none.
 *
 * The chat path shows this on the turn itself; a scheduled run has nobody
 * watching, so the run row is the only place the fact can surface. Silence
 * is reserved for a record written before the digest existed: every run this
 * build records says *something*, because "no handbook" and "we never looked"
 * are different answers to the same question.
 */
export function handbookLine(
  t: Translate,
  handbook: AutomationHandbookDigestData | undefined,
): {
  text: string
  title: string
  color?: string
  /** The block was cut at the ceiling; shown as its own clause. */
  truncated?: { text: string; title: string }
  /** The snapshot was old; the handbook was still used. */
  stale?: { text: string; title: string }
} | null {
  if (!handbook) return null

  if (handbook.state === 'no-department') {
    return {
      text: t('automation.handbook.noDepartment'),
      title: t('automation.handbook.noDepartmentHint'),
    }
  }
  if (handbook.state === 'no-snapshot') {
    return {
      text: t('automation.handbook.noSnapshot'),
      title: t('automation.handbook.noSnapshotHint'),
    }
  }
  if (handbook.state === 'unknown-department') {
    // Warning-toned: the job is filed under a desk whose rules did not
    // travel, and the user would otherwise never learn the run ran without
    // them.
    return {
      text: t('automation.handbook.unknownDepartment'),
      title: t('automation.handbook.unknownDepartmentHint'),
      color: WARNING,
    }
  }
  if (handbook.state === 'empty') {
    return {
      text: t('automation.handbook.empty', { name: handbook.departmentName ?? handbook.departmentId ?? '' }),
      title: t('automation.handbook.emptyHint'),
    }
  }

  const chars = t('automation.handbook.chars', { count: formatTokens(handbook.chars) })
  return {
    text: t('automation.handbook.used', { name: handbook.departmentName ?? '', chars }),
    title: t('automation.handbook.usedTitle'),
    truncated: handbook.truncated
      ? {
          text: t('automation.handbook.truncated', { count: formatTokens(handbook.sourceChars) }),
          title: t('automation.handbook.truncatedHint', { count: formatTokens(handbook.sourceChars) }),
        }
      : undefined,
    stale: handbook.stale && handbook.ageDays !== undefined
      ? {
          text: handbook.ageDays === 1
            ? t('automation.handbook.staleOne')
            : t('automation.handbook.staleMany', { days: handbook.ageDays }),
          title: t('automation.handbook.staleHint'),
        }
      : undefined,
  }
}

/**
 * Spend appended to the status line.
 *
 * Codex reports tokens but no money, so the cost segment is omitted rather
 * than rendered as `$0`. Only an actual run (success or failure) has spend:
 * a skipped or interrupted job leaves the previous figure out of this line.
 */
export function usageLine(
  t: Translate,
  job: AutomationJobData,
): { text: string; title: string } | null {
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
export function spendLimitLine(
  t: Translate,
  job: AutomationJobData,
): { text: string; color: string; title: string } | null {
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

/**
 * The row's status sentence: a live run, the last outcome, and — under the
 * global pause or a spend stop — the reason nothing just ran.
 */
export function statusLine(
  t: Translate,
  job: AutomationJobData,
  locale: string,
): { text: string; color: string; title?: string } {
  // A live run holding a request is still running, but "Running" would hide
  // the one fact the user can act on. The timestamp is when the run asked;
  // the tooltip carries the verbatim ask and the deadline.
  if (job.running && job.waitingApproval) {
    const wait = job.waitingApproval
    return {
      text: t('automation.status.waitingApproval', { time: timeText(wait.since, locale) }),
      color: WARNING,
      title: [
        t('automation.status.waitingApprovalHint', { minutes: RUN_APPROVAL_TIMEOUT_MINUTES }),
        t('automation.runApproval.subjectHint'),
        wait.subject,
      ].join('\n'),
    }
  }
  if (job.running || job.lastStatus === 'running') {
    return { text: t('automation.status.running'), color: 'var(--accent-text)' }
  }
  if (!job.lastStatus || job.lastRunAt === null) {
    return { text: t('automation.neverRun'), color: SECONDARY }
  }
  const when = t('automation.lastRun', { time: timeText(job.lastRunAt, locale) })
  const late = job.lastRunLate ? ` · ${t('automation.ranLate')}` : ''
  if (job.lastStatus === 'success') return { text: `${t('automation.status.success')} · ${when}${late}`, color: 'var(--success-text)' }
  // A department's daily cap refusing the newest occurrence is a hold, not a
  // failure: nothing ran and nothing broke, so it keeps the warning tone and
  // says who stopped it. The shared predicate reads the newest history record,
  // so a genuinely newer success or error is never masked; here it can only
  // outrank the generic skipped label, which would otherwise blame the hourly
  // cap. The tooltip carries the way out — Run now is manual, and the cap is
  // set on the department's Brief.
  if (isHeldJob(job)) {
    return {
      text: `${t('dept.jobs.statusHeld')} · ${when}`,
      color: WARNING,
      title: t('dept.jobs.statusHeldTip'),
    }
  }
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
  const detail = errorText(t, job.lastError)
  return {
    text: `${t('automation.status.error')}${detail ? `: ${detail}` : ''} · ${when}${late}`,
    color: 'var(--danger-text)',
  }
}

/**
 * The shared window's readout.
 *
 * Same honesty rules as the per-job row: an unmeasured window says so instead
 * of printing $0, and a lower bound is prefixed with `≥` because some run in
 * the window reported no money or an evicted record may sit inside it.
 */
export function budgetReadout(
  t: Translate,
  globalLimit: number | undefined,
  globalSpend: AutomationGlobalSpendData | undefined,
): { text: string; notes: string[]; color: string } | null {
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
}
