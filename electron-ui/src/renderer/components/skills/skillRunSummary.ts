// What the skill page can say about its scheduled runs — and what it cannot.
//
// The page already reads `automationList()` for the schedules strip. This module
// turns those same jobs into one compact line, so it needs no new IPC and no
// second source of truth. It is React-free: the arithmetic and the wording are
// values, and the harness exercises them without mounting anything.
//
// Three states are kept apart on purpose:
//
//   no-schedule  no live job names this skill — there is nothing to count
//   no-runs      a live job names it, but no remembered run of the skill exists
//   runs         remembered runs exist; the line counts them
//
// `no-runs` is not "zero runs ever": each job remembers only its most recent
// runs, a deleted job's runs leave with it, and a run started from chat leaves
// no automation record at all. Every sentence that could imply otherwise says
// which window it covers.

import type { AutomationJobData, AutomationRunRecordData } from '../../../preload'

/** Same shape as the `t` returned by `useI18n()`. */
export type SkillRunTranslate = (key: string, params?: Record<string, string | number>) => string

/** The identity a scheduled job stores for a skill: one segment under a root. */
export interface SkillRunIdentity {
  source: 'personal' | 'project'
  /** `''` is the root-level SKILL.md, not a wildcard. */
  dir: string
}

/** One live schedule that runs this skill, and how many of its runs count. */
export interface SkillRunScheduleCount {
  id: string
  name: string
  runs: number
  failed: number
}

export type SkillRunSummary =
  | {
      state: 'no-schedule'
      /** Always empty; kept so every state carries the same shape. */
      schedules: SkillRunScheduleCount[]
    }
  | {
      state: 'no-runs'
      schedules: SkillRunScheduleCount[]
    }
  | {
      state: 'runs'
      schedules: SkillRunScheduleCount[]
      runs: number
      failed: number
      /** Epoch ms of the newest counted run. At least one run exists. */
      newestAt: number
      /**
       * Sum of the costs the counted runs reported, when at least one did.
       * Absent when none did — showing "$0.00" would claim a measured zero.
       */
      spendUsd?: number
      /** True when some counted run reported no cost, so `spendUsd` is a floor. */
      spendLowerBound: boolean
      /**
       * `digest` when every counted run carried a skill digest with a display
       * name matching this skill by identity; `job` when at least one run had
       * no digest or a digest whose optional name was absent, and was counted
       * because its live schedule runs this skill.
       */
      countedBy: 'digest' | 'job'
      /** Counted runs that reported a cost; used by the breakdown title. */
      costReportedRuns: number
    }

/**
 * Whether a job's action is this skill. `skillDir` is compared exactly: `''`
 * names the root's own SKILL.md and must not match every folder.
 */
export function matchesSkillAction(
  job: Pick<AutomationJobData, 'action'>,
  identity: SkillRunIdentity,
): boolean {
  return job.action.kind === 'skill'
    && job.action.skillSource === identity.source
    && job.action.skillDir === identity.dir
}

/**
 * Whether a run belongs to this skill.
 *
 * A digest names the skill by its stable identity (`source` + `dir`), never by
 * its display `name`: the name is optional when the file declares none, and it
 * can change without the folder moving. A record with a digest for another
 * skill is never counted even when its job now points here — the job may have
 * been edited after that run. A record with no digest at all (written before
 * digests existed, or repaired after a crash), or with a digest whose optional
 * name is absent, falls back to its job; the summary then says the count is by
 * job rather than by digest.
 */
function runBelongsToSkill(
  record: AutomationRunRecordData,
  identity: SkillRunIdentity,
): { counted: boolean; byDigest: boolean } {
  // A skip never ran the skill: it holds no digest and must not become a run
  // merely because its job now names this skill.
  if (record.status === 'skipped') return { counted: false, byDigest: false }
  const digest = record.skill
  if (!digest) return { counted: true, byDigest: false }
  // A digest for another skill keeps its run out even if the job now points
  // here: the digest is what actually ran.
  if (digest.source !== identity.source || digest.dir !== identity.dir) {
    return { counted: false, byDigest: false }
  }
  // With no display name the digest alone cannot name the skill in words, so
  // the run is attributed to its live job and the breakdown says so.
  return { counted: true, byDigest: Boolean(digest.name) }
}

export function buildSkillRunSummary(
  jobs: readonly AutomationJobData[],
  identity: SkillRunIdentity,
): SkillRunSummary {
  const matched = jobs.filter(job => matchesSkillAction(job, identity))
  const schedules: SkillRunScheduleCount[] = matched.map(job => ({
    id: job.id,
    name: job.name,
    runs: 0,
    failed: 0,
  }))
  if (matched.length === 0) return { state: 'no-schedule', schedules: [] }

  let runs = 0
  let failed = 0
  let newestAt = -Infinity
  let spendUsd = 0
  let costReportedRuns = 0
  let countedByJob = false

  for (let index = 0; index < matched.length; index += 1) {
    const job = matched[index]
    const schedule = schedules[index]
    for (const record of job.history) {
      const relation = runBelongsToSkill(record, identity)
      if (!relation.counted) continue
      if (!relation.byDigest) countedByJob = true
      runs += 1
      schedule.runs += 1
      if (record.status === 'error') {
        failed += 1
        schedule.failed += 1
      }
      if (record.startedAt > newestAt) newestAt = record.startedAt
      const cost = record.usage?.costUsd
      if (typeof cost === 'number' && Number.isFinite(cost)) {
        spendUsd += cost
        costReportedRuns += 1
      }
    }
  }

  if (runs === 0) return { state: 'no-runs', schedules }

  return {
    state: 'runs',
    schedules,
    runs,
    failed,
    newestAt,
    ...(costReportedRuns > 0 ? { spendUsd } : {}),
    spendLowerBound: costReportedRuns > 0 && costReportedRuns < runs,
    countedBy: countedByJob ? 'job' : 'digest',
    costReportedRuns,
  }
}

/** Same compact USD form the automation surfaces use. */
export function formatSkillRunSpend(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** "3h ago" / "just now": compact, and honest that it is an age, not a time. */
export function skillRunAgeText(
  startedAt: number,
  now: number,
  t: SkillRunTranslate,
): string {
  const elapsed = Math.max(0, now - startedAt)
  if (elapsed < 60_000) return t('skills.run.summary.age.now')
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 60) return t('skills.run.summary.age.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return t('skills.run.summary.age.hours', { count: hours })
  return t('skills.run.summary.age.days', { count: Math.floor(hours / 24) })
}

export interface SkillRunSummaryPresentation {
  /** One compact line. It always says it covers scheduled runs only. */
  text: string
  /** The breakdown, shown on hover: per-schedule counts and every caveat. */
  title: string
  tone: 'muted' | 'warn'
}

export function skillRunSummaryText(
  summary: SkillRunSummary,
  t: SkillRunTranslate,
  now: number,
): SkillRunSummaryPresentation {
  if (summary.state === 'no-schedule') {
    return {
      text: t('skills.run.summary.noSchedule'),
      title: [
        t('skills.run.summary.title.noSchedule'),
        t('skills.run.summary.title.chatOnly'),
      ].join('\n'),
      tone: 'muted',
    }
  }

  const scheduleLines = summary.schedules.map(schedule => t(
    'skills.run.summary.title.schedule',
    { name: schedule.name, runs: schedule.runs, failed: schedule.failed },
  ))

  if (summary.state === 'no-runs') {
    return {
      text: t(
        summary.schedules.length === 1
          ? 'skills.run.summary.noRuns_one'
          : 'skills.run.summary.noRuns_other',
        { count: summary.schedules.length },
      ),
      title: [
        t('skills.run.summary.title.noRuns'),
        ...scheduleLines,
        t('skills.run.summary.title.window'),
        t('skills.run.summary.title.liveOnly'),
        t('skills.run.summary.title.chatOnly'),
      ].join('\n'),
      tone: 'muted',
    }
  }

  const age = skillRunAgeText(summary.newestAt, now, t)
  const spend = typeof summary.spendUsd === 'number'
    ? summary.spendLowerBound
      ? t('skills.run.summary.spendLowerBound', {
        amount: formatSkillRunSpend(summary.spendUsd),
      })
      : t('skills.run.summary.spend', {
        amount: formatSkillRunSpend(summary.spendUsd),
      })
    : ''

  return {
    text: t(
      summary.runs === 1
        ? 'skills.run.summary.runs_one'
        : 'skills.run.summary.runs_other',
      { runs: summary.runs, failed: summary.failed, age, spend },
    ),
    title: [
      t('skills.run.summary.title.runs'),
      ...scheduleLines,
      summary.countedBy === 'job'
        ? t('skills.run.summary.title.job')
        : t('skills.run.summary.title.digest'),
      ...(summary.spendLowerBound ? [t('skills.run.summary.title.lowerBound')] : []),
      t('skills.run.summary.title.window'),
      t('skills.run.summary.title.liveOnly'),
      t('skills.run.summary.title.chatOnly'),
    ].join('\n'),
    tone: summary.failed > 0 ? 'warn' : 'muted',
  }
}
