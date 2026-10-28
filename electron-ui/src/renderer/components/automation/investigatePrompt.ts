// "Ask AIPA to look into it" — the question a failed scheduled run is turned
// into.
//
// Telling the user a run failed is not helping them: the next step is always
// the same manual chore (copy the job name, the error, the time, open the
// transcript, start a chat, paste it all). This builder does that homework once
// and hands the composer a question the user only has to read and send.
//
// The output is *data handed to the model*, not a UI string, so it is written
// in English here rather than read from the locale files: the engine's
// instructions and the app's interface language are separate concerns, and a
// Chinese prompt would still be answered in whatever language the user writes
// in. The two things that must stay in sync with the rest of the app — the
// trigger wording and the failure wording — are produced by the shared
// `scheduleText` and `errorCodeText` helpers through the English translator
// below, which is why the vocabulary table mirrors the `automation.schedule.*`,
// `automation.status.*` and `automation.errors.*` keys rather than inventing a
// second set of words.
//
// Everything here is pure and takes its clock, so a harness can pin both the
// data and the time.

import type {
  AutomationJobData,
  AutomationRunRecordData,
} from '../../../preload'
import type { Translate } from './scheduleText'
import { scheduleText } from './scheduleText'
import { errorCodeText } from '../workflows/scheduleSummary'

/**
 * The most a composer draft can reasonably become. Long enough for the facts,
 * a run list and the ask; short enough that the user can still read (and edit)
 * the question before sending it.
 */
export const MAX_INVESTIGATE_PROMPT_CHARS = 4000

/** How many past runs are listed. Enough to show a streak of failures. */
export const RECENT_RUNS_IN_PROMPT = 5

/** Bounds on the free-text values, so one pathological name cannot eat the cap. */
const MAX_NAME_CHARS = 120
const MAX_ERROR_CHARS = 300

/**
 * The English wording of every locale key the shared helpers may ask for.
 *
 * Missing keys intentionally fall through to the key itself — exactly what
 * `errorCodeText` treats as "the locale does not name this code", so an engine
 * message or an unknown code is printed as the raw code instead of a blank.
 */
const ENGLISH: Record<string, string> = {
  'automation.schedule.everyMinutes': 'every {{count}} min',
  'automation.schedule.everyHours': 'every {{count}} h',
  'automation.schedule.everyDays': 'every {{count}} day(s)',
  'automation.schedule.daily': 'every day at {{time}}',
  'automation.schedule.weekly': 'every {{day}} at {{time}}',
  'automation.schedule.cron': 'cron: {{expr}}',
  'automation.schedule.watch': 'when {{path}} changes',
  'automation.weekdays.0': 'Sunday',
  'automation.weekdays.1': 'Monday',
  'automation.weekdays.2': 'Tuesday',
  'automation.weekdays.3': 'Wednesday',
  'automation.weekdays.4': 'Thursday',
  'automation.weekdays.5': 'Friday',
  'automation.weekdays.6': 'Saturday',
  'automation.status.success': 'Succeeded',
  'automation.status.error': 'Failed',
  'automation.status.skipped': 'Skipped (hourly limit)',
  'automation.status.budgetSkipped': 'Skipped (spend limit)',
  'automation.status.globalBudgetSkipped': 'Skipped (daily budget reached)',
  'automation.status.missedSkipped': 'Skipped (missed while closed)',
  // Failure codes that can reach a run record. Validation codes (name_too_long,
  // cron_invalid, …) never appear on a run, so they are not listed here.
  'automation.errors.run_failed': 'The run failed.',
  'automation.errors.interrupted': 'The run was interrupted when AIPA closed.',
  'automation.errors.nothing_to_run': 'The workflow produced nothing to run.',
  'automation.errors.workflow_missing': 'That workflow no longer exists.',
  'automation.errors.no_authenticated_engine':
    'No AI engine is signed in. Add an API key in Settings or sign in to an engine.',
}

const englishT: Translate = (key, params) => {
  const template = ENGLISH[key]
  if (template === undefined) return key
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = params?.[name]
    return value === undefined ? '' : String(value)
  })
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/** One fact per line, so the model can read the block without guessing. */
function factLine(label: string, value: string): string {
  return `- ${label}: ${value}`
}

/**
 * A timestamp the model can reason about without knowing the user's locale:
 * ISO 8601 in UTC. Local-time formatting would silently depend on the machine's
 * settings for a message that outlives them (it is saved in the transcript).
 */
function isoText(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return 'time not recorded'
  return `${new Date(ts).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** Money as the rest of the app prints it, and never for a value we do not have. */
function usdText(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.001) return '<$0.001'
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * One past run's outcome, in the same vocabulary Settings -> Automations uses.
 * A skip names the rail that stopped it; a failure carries the error wording
 * when the code has one and the raw code when it does not.
 */
function outcomeFor(record: AutomationRunRecordData): string {
  if (record.status === 'success') return englishT('automation.status.success')
  if (record.status === 'skipped') {
    if (record.error === 'global_budget_exceeded') {
      return englishT('automation.status.globalBudgetSkipped')
    }
    if (record.error === 'budget_exceeded') return englishT('automation.status.budgetSkipped')
    if (record.error === 'missed_while_closed') {
      return englishT('automation.status.missedSkipped')
    }
    return englishT('automation.status.skipped')
  }
  const wording = record.error ? errorCodeText(record.error, englishT) : ''
  return wording
    ? `${englishT('automation.status.error')}: ${clip(wording, MAX_ERROR_CHARS)}`
    : englishT('automation.status.error')
}

/**
 * The run the user is asking about. A legacy job can fail without a history
 * record (the history was introduced later, or evicted under the cap); the
 * job's own last-run fields then describe that same run, so they stand in and
 * nothing is invented. The caller may pass the exact record it was showing
 * (the popover's and the catch-up card's rows name a specific run).
 */
function failingRecord(
  job: AutomationJobData,
  record: AutomationRunRecordData | null | undefined,
): AutomationRunRecordData | null {
  if (record) return record
  const newestFailed = [...(job.history ?? [])].reverse().find(r => r.status === 'error')
  if (newestFailed) return newestFailed
  if (job.lastStatus !== 'error' || job.lastRunAt === null) return null
  return {
    startedAt: job.lastRunAt,
    status: 'error',
    durationMs: job.lastDurationMs,
    sessionId: job.lastSessionId,
    error: job.lastError,
    late: job.lastRunLate,
    // `lastUsage` belongs to the same run this line describes.
    ...(job.lastUsage ? { usage: job.lastUsage } : {}),
  }
}

export interface InvestigatePromptInput {
  job: AutomationJobData
  /**
   * The failing run being shown. Omitted/`null` falls back to the newest failed
   * record in the job's history, then to the job's own last-run fields.
   */
  record?: AutomationRunRecordData | null
  /** Override the character cap; the UI always uses the default. */
  maxChars?: number
}

/**
 * Build the question. The returned string is what the composer is prefilled
 * with; it is never sent automatically.
 */
export function buildInvestigatePrompt({
  job,
  record,
  maxChars = MAX_INVESTIGATE_PROMPT_CHARS,
}: InvestigatePromptInput): string {
  const failed = failingRecord(job, record)
  const name = clip(job.name || 'Untitled automation', MAX_NAME_CHARS)

  const head = [
    `My scheduled AIPA automation "${name}" failed, and I'd like help working out why.`,
    '',
    'Facts:',
  ]

  const facts: string[] = [
    factLine('Job', name),
    factLine('Trigger', scheduleText(englishT, job.trigger)),
  ]

  if (failed) {
    const duration = failed.durationMs === null
      ? ''
      : ` (it ran for ${failed.durationMs < 1000
        ? `${Math.max(0, Math.round(failed.durationMs))} ms`
        : `${Math.round(failed.durationMs / 1000)} s`})`
    facts.push(factLine('Failed run started', `${isoText(failed.startedAt)}${duration}`))
    if (failed.late) facts.push(factLine('Note', 'It started after its scheduled minute (the app was closed).'))
    if (failed.error) {
      const wording = errorCodeText(failed.error, englishT)
      facts.push(factLine(
        'Failure',
        wording && wording !== failed.error
          ? `${failed.error} — ${clip(wording, MAX_ERROR_CHARS)}`
          : clip(failed.error, MAX_ERROR_CHARS),
      ))
    }
    // A retry attempt is a different fact from the failure streak: it says this
    // run was already a second attempt.
    if (typeof failed.retry === 'number') {
      facts.push(factLine('Retry attempt', String(failed.retry)))
    }
  } else if (job.lastError) {
    facts.push(factLine('Last error', clip(job.lastError, MAX_ERROR_CHARS)))
  }

  if (typeof job.failureStreak === 'number' && job.failureStreak >= 1) {
    facts.push(factLine(
      'Failures in a row',
      job.failureStreak === 1 ? '1 (the most recent run)' : String(job.failureStreak),
    ))
  }

  // Spend is only described with figures that exist. No limit means no line;
  // no reported cost means the line says so instead of printing $0.
  if (job.dailyCostLimitUsd !== undefined) {
    const parts = [`limit ${usdText(job.dailyCostLimitUsd)} per rolling 24 h`]
    const window = job.spendWindow
    if (window?.reportedCostUsd !== undefined) {
      const lowerBound = window.partial || window.unreportedRuns > 0
      const notes: string[] = []
      if (window.unreportedRuns > 0) {
        notes.push(`${window.unreportedRuns} ${window.unreportedRuns === 1 ? 'run' : 'runs'} reported no cost`)
      }
      if (window.partial) notes.push('the history may not reach back to the window start')
      parts.push(`reported spend ${lowerBound ? 'at least ' : ''}${usdText(window.reportedCostUsd)}`)
      if (notes.length > 0) parts.push(`a lower bound because ${notes.join(' and ')}`)
    } else if (window?.unmeasured) {
      parts.push('no run in the window reported any cost, so the limit cannot be evaluated')
    } else if (window) {
      parts.push('no run in the window reported any cost')
    }
    facts.push(factLine('Spend', parts.join('; ')))
  }

  if (failed?.sessionId) {
    facts.push(factLine('Transcript id for the failed run', failed.sessionId))
  }

  // Oldest to newest: the model should see what led up to the failure, which is
  // also the order the run happened in.
  const allHistory = job.history ?? []
  const history = allHistory.slice(-RECENT_RUNS_IN_PROMPT)
  let historyLines: string[] = history.map((run, index) => {
    const attempt = typeof run.retry === 'number' ? ` (retry ${run.retry})` : ''
    return `${index + 1}. ${isoText(run.startedAt)} — ${outcomeFor(run)}${attempt}`
  })
  let historyIntro = history.length > 0
    ? (allHistory.length > history.length
      ? `Recent runs (the last ${history.length} of ${allHistory.length}, oldest first):`
      : `Recent runs (${history.length}, oldest first):`)
    : ''

  const tail = [
    '',
    'What I need:',
    '1. Diagnose why this run failed, from the facts above and from the transcript if its id is listed. If you cannot open the transcript, say so and work from the facts alone.',
    '2. Say what I should check, in the order most likely to find the cause.',
    '3. Propose the smallest change that would let this job run again.',
    '',
    'Ask me before changing anything: do not edit files, change this automation, or run commands until I agree.',
  ].join('\n')

  const assemble = (lines: string[]) => {
    const historyBlock = lines.length > 0 ? ['', historyIntro, ...lines] : []
    return [...head, ...facts, ...historyBlock, tail].join('\n')
  }

  let text = assemble(historyLines)

  // Over the cap, the run list goes first. It is the only section whose length
  // grows with the data, and it is supporting evidence: the facts and the ask
  // are what the model actually needs, and cutting them would leave a question
  // that cannot be answered. Oldest entries go first because the newest run is
  // the failure itself, already described by the facts above.
  while (text.length > maxChars && historyLines.length > 0) {
    historyLines = historyLines.slice(1)
    if (historyLines.length > 0) {
      historyIntro = `Recent runs (the newest ${historyLines.length} kept to fit the message):`
    }
    text = assemble(historyLines)
  }

  // Last resort, reachable only with a pathological name or error. Slicing the
  // end keeps the header and the facts, which are the part a reader can still
  // act on.
  if (text.length > maxChars) text = clip(text, maxChars)
  return text
}
