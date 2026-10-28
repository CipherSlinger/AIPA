// Pure derivations for the workflow schedules strip.
//
// These live outside the component so the wording rules — relative age, the
// raw-code fallback for errors the locale does not name, and when spend is
// shown at all — can be exercised without a DOM or a translation provider.
// Every function that reads the clock takes `now`, so a harness can pin it.

import type { AutomationJobData } from '../../../preload'
import { formatTokens } from '../../utils/formatUtils'
import type { Translate } from '../automation/scheduleText'

/**
 * Relative age ("2h ago"). Reuses the chat's time keys — they are the app's
 * only localized relative vocabulary — and clamps future timestamps to
 * "just now" rather than rendering a negative age.
 */
export function relativeTimeText(ts: number, t: Translate, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)
  if (diff < 10_000) return t('message.justNow')
  if (diff < 60_000) return t('message.secsAgo', { count: Math.floor(diff / 1000) })
  if (diff < 3_600_000) return t('message.minsAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('message.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return t('message.daysAgo', { count: Math.floor(diff / 86_400_000) })
}

/**
 * Money as the engine reported it, mirroring the settings list so the two
 * surfaces never disagree on precision. Very small amounts keep a third digit
 * instead of rounding away to `$0.00`.
 */
export function costText(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * The error the scheduler stored is a code, not a sentence. Translate it when
 * the locale knows the code and fall back to the code itself otherwise — a
 * bare `hourly_limit` is still more useful than "Failed" with no reason.
 */
export function errorCodeText(code: string | null, t: Translate): string {
  if (!code) return ''
  const key = `automation.errors.${code}`
  const translated = t(key)
  return translated === key ? code : translated
}

export interface OutcomeText {
  text: string
  color: string
}

/**
 * Last outcome of a job, coloured for the strip. `running` wins over a stale
 * `lastStatus`: the scheduler reports the in-flight run separately, and the
 * previous outcome is no longer what the user is looking at.
 */
export function outcomeText(
  job: AutomationJobData,
  t: Translate,
  now: number = Date.now(),
): OutcomeText {
  if (job.running || job.lastStatus === 'running') {
    return { text: t('automation.status.running'), color: 'var(--accent-text)' }
  }
  if (!job.lastStatus || job.lastRunAt === null) {
    return { text: t('automation.neverRun'), color: 'var(--text-muted)' }
  }
  const when = relativeTimeText(job.lastRunAt, t, now)
  if (job.lastStatus === 'success') {
    return { text: `${t('automation.status.success')} · ${when}`, color: 'var(--success-text)' }
  }
  if (job.lastStatus === 'skipped') {
    return { text: `${t('automation.status.skipped')} · ${when}`, color: 'var(--warning-text)' }
  }
  const detail = errorCodeText(job.lastError, t)
  return {
    text: `${t('automation.status.error')}${detail ? `: ${detail}` : ''} · ${when}`,
    color: 'var(--danger-text)',
  }
}

export interface SpendText {
  text: string
  title: string
}

/**
 * What the last completed run spent, or null when the engine reported nothing.
 *
 * Cache reads stay out of the headline count (they would dwarf the actual
 * conversation tokens) but remain in the tooltip. The cost segment appears only
 * when the engine reported one, so an engine that reports tokens but no money
 * never gets a fabricated `$0.00`.
 */
export function spendText(job: AutomationJobData, t: Translate): SpendText | null {
  // Cancelled or rate-limited attempts leave the prior run's figures in place;
  // showing them beside "Skipped" would attribute old spend to this attempt.
  if (job.lastStatus !== 'success' && job.lastStatus !== 'error') return null
  const usage = job.lastUsage
  if (!usage) return null

  const tokens = usage.inputTokens + usage.outputTokens
  const cost = usage.costUsd !== undefined && usage.costUsd > 0 ? usage.costUsd : null
  if (tokens <= 0 && cost === null) return null

  const parts: string[] = []
  if (tokens > 0) parts.push(t('automation.usage.tokens', { count: formatTokens(tokens) }))
  if (cost !== null) parts.push(costText(cost))

  const detail: string[] = []
  if (usage.inputTokens > 0) detail.push(t('automation.usage.tooltip.input', { count: formatTokens(usage.inputTokens) }))
  if (usage.outputTokens > 0) detail.push(t('automation.usage.tooltip.output', { count: formatTokens(usage.outputTokens) }))
  if (usage.cachedInputTokens !== undefined && usage.cachedInputTokens > 0) {
    detail.push(t('automation.usage.tooltip.cached', { count: formatTokens(usage.cachedInputTokens) }))
  }

  return { text: parts.join(' · '), title: detail.join('\n') }
}
