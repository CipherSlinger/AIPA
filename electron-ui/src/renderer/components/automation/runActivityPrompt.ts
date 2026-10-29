// "Ask AIPA what happened" — the page-level post-mortem draft for the runs on
// screen.
//
// The per-failure path answers one run; this one answers the question the page
// actually poses: "what happened across these runs?" It describes the current
// window and filter, never everything the app remembers, because a question
// that silently widened the scope would give an answer about a different set.
//
// Like `investigatePrompt.ts`, the output is *data handed to the model*, not a
// UI string, so it is written in English and takes its clock as an argument.
// The only locale-derived facts are the status and error wording, which go
// through the same shared helpers the rest of the app uses. Nothing here sends
// anything.

import type { AutomationRunActivityRowData, AutomationRunSourceData } from '../../../preload'
import type { Translate } from './scheduleText'
import { errorCodeText } from '../workflows/scheduleSummary'
import { RUN_ACTIVITY_WINDOW_MS, type RunActivityFilter, type RunActivityWindow } from './runActivity'

/**
 * The most a composer draft can reasonably become. The same ceiling the
 * single-run question uses; long enough for the facts, three failures and the
 * ask, short enough to read before pressing Enter.
 */
export const MAX_RUN_ACTIVITY_PROMPT_CHARS = 4000

/** The newest failures named in the draft. Older ones are summarised by count. */
export const FAILURES_IN_RUN_ACTIVITY_PROMPT = 3

const MAX_NAME_CHARS = 120
const MAX_ERROR_CHARS = 200
const MAX_QUERY_CHARS = 120

/**
 * English wording for the stored error codes a run record can carry. Missing
 * codes fall through to the raw code, exactly as the locale does — an engine
 * message is more useful than a blank.
 */
const ENGLISH: Record<string, string> = {
  'automation.errors.run_failed': 'The run failed.',
  'automation.errors.interrupted': 'The run was interrupted when AIPA closed.',
  'automation.errors.nothing_to_run': 'The workflow produced nothing to run.',
  'automation.errors.workflow_missing': 'That workflow no longer exists.',
  'automation.errors.skill_missing': 'That skill is no longer installed.',
  'automation.errors.skill_unreadable': 'That skill could not be read.',
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

function isoText(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return 'time not recorded'
  return `${new Date(ts).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** Money as the rest of the app prints it; a missing cost is never zero. */
function usdText(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.001) return '<$0.001'
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function countText(value: number): string {
  return String(Math.max(0, Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function factLine(label: string, value: string): string {
  return `- ${label}: ${value}`
}

export interface RunActivityPromptInput {
  /** The rows on screen after the window and every filter, newest first. */
  rows: readonly AutomationRunActivityRowData[]
  window: RunActivityWindow
  filter: RunActivityFilter
  /** Rows main returned (already capped). */
  loaded: number
  /** Runs remembered before the cap. */
  total: number
  /** Main's cap, so the draft can name the same 500 the footer does. */
  cap: number
  /** Clock override; the UI uses now. */
  now?: number
  /** Character cap override; the UI always uses the default. */
  maxChars?: number
}

function windowText(window: RunActivityWindow, now: number): string {
  if (window === 'all') return 'all remembered runs'
  const span = RUN_ACTIVITY_WINDOW_MS[window]
  const phrase = window === '24h' ? 'the last 24 hours' : 'the last 7 days'
  return `runs started in ${phrase} (since ${isoText(now - span)})`
}

function sourceWord(source: AutomationRunSourceData, count: number): string {
  const noun = count === 1 ? 'run' : 'runs'
  switch (source) {
    case 'scheduled': return `${count} ${noun} on schedule`
    case 'manual': return `${count} ${noun} started by hand`
    case 'watch': return `${count} ${noun} from a file watch`
    case 'chain': return `${count} ${noun} by a job chain`
  }
}

/**
 * "How the runs started", aggregated. An absent source is printed in the words
 * the task demands — "source not recorded" — rather than being folded into
 * scheduled, which is what every legacy record would otherwise become.
 */
function startsText(rows: readonly AutomationRunActivityRowData[]): string {
  const counts: Record<AutomationRunSourceData, number> = {
    scheduled: 0, manual: 0, watch: 0, chain: 0,
  }
  let unrecorded = 0
  for (const row of rows) {
    if (row.run.source === undefined) unrecorded += 1
    else counts[row.run.source] += 1
  }
  const parts: string[] = []
  for (const source of ['scheduled', 'manual', 'watch', 'chain'] as const) {
    if (counts[source] > 0) parts.push(sourceWord(source, counts[source]))
  }
  if (unrecorded > 0) {
    parts.push(`${unrecorded} ${unrecorded === 1 ? 'run' : 'runs'} with source not recorded`)
  }
  if (parts.length === 0) return 'no runs in this view'
  const suffix = unrecorded > 0
    ? ' Records written before AIPA stored the source have none; they are not assumed to be scheduled.'
    : ''
  return `${parts.join(', ')}.${suffix}`
}

/**
 * Reported spend for the view.
 *
 * A missing cost is not $0. When some runs reported money and some did not,
 * the sum is a lower bound and says so; when none reported, the draft says the
 * spend is unknown instead of printing a figure.
 */
function spendText(rows: readonly AutomationRunActivityRowData[]): string {
  if (rows.length === 0) return 'no runs in this view, so there is no spend to report.'
  let reported = 0
  let unknown = 0
  let sum = 0
  for (const row of rows) {
    const cost = row.run.usage?.costUsd
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      reported += 1
      sum += cost
    } else {
      unknown += 1
    }
  }
  if (reported === 0) {
    return `unknown — none of the ${rows.length} ${rows.length === 1 ? 'run' : 'runs'} reported a cost; this is not $0.`
  }
  if (unknown > 0) {
    if (sum === 0) {
      // Reporting "$0" here would read as "these runs cost nothing", which is
      // exactly the unknown the missing entries represent.
      return `unknown — ${reported} ${reported === 1 ? 'run' : 'runs'} reported a cost of zero and ${unknown} reported none, so the real total cannot be computed.`
    }
    return `at least ${usdText(sum)} — a lower bound because ${unknown} ${unknown === 1 ? 'run' : 'runs'} reported no cost.`
  }
  return `${usdText(sum)} (every run in this view reported a cost).`
}

function describeFilter(input: RunActivityPromptInput): string {
  const { filter, window } = input
  const parts: string[] = [windowText(window, input.now ?? Date.now())]
  if (filter.status !== 'all') parts.push(`${filter.status} runs only`)
  if (filter.source !== 'all') {
    parts.push(filter.source === 'unrecorded'
      ? 'only runs whose source was not recorded'
      : `only runs started by ${filter.source}`)
  }
  if (filter.jobId !== null) {
    const named = input.rows.find(row => row.jobId === filter.jobId)?.jobName
      ?? filter.jobId
    parts.push(`job "${clip(named, MAX_NAME_CHARS)}" only`)
  }
  const query = filter.query.trim()
  if (query) parts.push(`matching "${clip(query, MAX_QUERY_CHARS)}"`)
  return parts.join(', ')
}

function failureLine(
  row: AutomationRunActivityRowData,
  index: number,
): string {
  const code = row.run.error ?? 'no error code recorded'
  const wording = errorCodeText(row.run.error, englishT)
  const detail = wording && wording !== code
    ? ` — ${clip(wording, MAX_ERROR_CHARS)}`
    : ''
  return `${index + 1}. ${isoText(row.run.startedAt)} — ${clip(row.jobName, MAX_NAME_CHARS)} — ${clip(code, MAX_ERROR_CHARS)}${detail}`
}

/**
 * Build the post-mortem question. Pure: the clock and the cap are arguments,
 * and the result is a string the caller may park in the composer.
 */
export function buildRunActivityPrompt({
  rows,
  window,
  filter,
  loaded,
  total,
  cap,
  now = Date.now(),
  maxChars = MAX_RUN_ACTIVITY_PROMPT_CHARS,
}: RunActivityPromptInput): string {
  const sorted = [...rows].sort((a, b) => b.run.startedAt - a.run.startedAt)
  const failed = sorted.filter(row => row.run.status === 'error')
  const skipped = sorted.filter(row => row.run.status === 'skipped')
  const succeeded = sorted.filter(row => row.run.status === 'success')
  const capped = loaded < total
  const runCount = capped
    ? `at least ${countText(sorted.length)}`
    : countText(sorted.length)

  const head = [
    `AIPA run post-mortem — ${describeFilter({ rows: sorted, window, filter, loaded, total, cap, now })}.`,
    '',
    'Facts:',
  ]

  const facts: string[] = [
    factLine('Runs in this view', runCount),
    factLine(
      'Outcomes in the loaded runs',
      `${countText(failed.length)} failed, ${countText(skipped.length)} skipped, ${countText(succeeded.length)} succeeded`,
    ),
    factLine('How they started', startsText(sorted)),
    factLine('Reported spend', spendText(sorted)),
  ]

  if (capped) {
    facts.push(factLine(
      `The ${countText(cap)}-row cap truncated this set`,
      `the app loaded the newest ${countText(loaded)} of ${countText(total)} remembered runs, so "at least" counts are lower bounds and older matching runs may not be listed`,
    ))
  } else {
    facts.push(factLine(
      `The ${countText(cap)}-row cap`,
      `did not truncate the loaded set: all ${countText(total)} remembered runs were loaded, though the window and filter still narrow this view`,
    ))
  }

  const failures = failed.slice(0, FAILURES_IN_RUN_ACTIVITY_PROMPT)
  const failureLines = failures.map(failureLine)
  let failureHeading = 'Failures (newest first):'
  const noFailures = sorted.length > 0
    ? 'Failures: none in this view.'
    : 'Failures: none — there are no runs in this view.'

  const tail = [
    '',
    'What I need:',
    '1. Diagnose what happened across these runs. Work from the facts above; if a transcript id is needed and not listed, say so and do not guess.',
    '2. Say what I should check first, in the order most likely to find the cause, separating one-off failures from a pattern.',
    '3. Propose the smallest change that would make the failing runs reliable. If nothing is wrong, say that too.',
    '',
    'Ask me before changing anything: do not edit files, change automations, or run commands until I agree.',
  ].join('\n')

  const failureBlock = (): string[] => {
    if (failures.length === 0) return ['', noFailures]
    return ['', failureHeading, ...failureLines]
  }

  const assemble = (): string =>
    [...head, ...facts, ...failureBlock(), tail].join('\n')

  let text = assemble()

  // Over the cap, the failure list goes first — the facts and the ask are what
  // the model actually needs. Oldest entries go first because the newest failure
  // is the most likely lead; the heading is rewritten so the missing entries are
  // never mistaken for "there were only these".
  while (text.length > maxChars && failureLines.length > 0) {
    failureLines.pop()
    failureHeading = failureLines.length > 0
      ? `Failures (the newest ${failureLines.length} of ${failures.length} kept to fit the message, newest first):`
      : `Failures (none of the ${failures.length} listed to fit the message; the outcome counts above still describe the set):`
    text = assemble()
  }

  // Last resort, reachable only with pathological names/errors. Keep the tail:
  // the instruction to diagnose and not change anything must survive a cut.
  if (text.length > maxChars) {
    const tailStart = text.lastIndexOf('\nWhat I need:')
    const tailText = tailStart >= 0 ? text.slice(tailStart) : ''
    text = tailText.length > 0 && tailText.length < maxChars
      ? text.slice(0, maxChars - tailText.length) + tailText
      : text.slice(0, maxChars)
  }
  return text
}
