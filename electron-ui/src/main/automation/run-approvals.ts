/**
 * The bounded queue of permission requests an unattended run is holding.
 *
 * Until this existed, a scheduled run that hit a permission prompt answered it
 * itself — always "no" — because nobody was there to ask. That is safe, but a
 * nightly job that needs one write outside the sandbox then fails every night
 * while the user sleeps. This module is the middle ground: a request is held
 * for a bounded time and put in front of the user; no answer within the stated
 * timeout is still a denial, so the deny path keeps exactly the semantics it
 * had, only later.
 *
 * The rules the queue enforces, each one a safety property rather than a
 * preference:
 *  - one held request per run, and at most `MAX_HELD_RUN_APPROVALS` across all
 *    runs. Past either limit the request is denied immediately with a stated
 *    reason, never queued behind an unbounded line;
 *  - no request outlives its run: `releaseRun` settles every hold that run owns,
 *    and the runner calls it on every ending — a finished turn, a stopped
 *    process, a disposed bridge;
 *  - an answer names one request id and answers only that request. There is no
 *    "always allow", no per-job rule and nothing persisted about the answer;
 *  - every decision is reported exactly once, so the run record can say who
 *    answered and how long the wait was without ever inferring it.
 *
 * Pure and Electron-free (clock and timers are injectable) so the harness can
 * drive a fake clock through the timeout and the cap without waiting 15 real
 * minutes.
 */
import type {
  AutomationRunApproval,
  AutomationRunApprovalOutcome,
  AutomationWaitingApproval,
} from './types'

/** How long a request may wait for the user before it is denied. */
export const RUN_APPROVAL_TIMEOUT_MS = 15 * 60_000

/**
 * Requests held across all runs at once.
 *
 * Small on purpose: every held request is a run that is neither working nor
 * finished, and more than a couple of them is a sign the user is not there to
 * answer. Past the cap the honest answer is a refusal, not a longer line.
 */
export const MAX_HELD_RUN_APPROVALS = 3

/**
 * Ceiling for the stored description of a request.
 *
 * The ask is shown verbatim, never summarized, so this only bounds what a
 * hand-edited or hostile engine could write into `automations.json`; the full
 * text is clipped with an ellipsis rather than rewritten.
 */
export const MAX_APPROVAL_SUBJECT_CHARS = 2_000

/** Requests retained on one run record; older ones are dropped, newest kept. */
export const MAX_RUN_APPROVALS_RECORDED = 5

/** The shape a clock must have; the harness supplies a fake one. */
export interface RunApprovalClock {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const REAL_CLOCK: RunApprovalClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms)
    // A held request must never keep the process alive on its own; the run it
    // belongs to already does.
    ;(handle as { unref?: () => void }).unref?.()
    return handle
  },
  clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout),
}

export interface RunApprovalAsk {
  jobId: string
  jobName: string
  /** Identity of the run: one job runs at most once at a time. */
  runKey: string
  requestId: string
  subject: string
}

export interface HeldRunApproval extends AutomationWaitingApproval {
  jobId: string
  jobName: string
  runKey: string
}

export interface RunApprovalDecision {
  jobId: string
  runKey: string
  requestId: string
  subject: string
  since: number
  resolvedAt: number
  waitedMs: number
  outcome: AutomationRunApprovalOutcome
  answeredBy?: 'user'
}

interface Entry {
  hold: HeldRunApproval
  settle: (outcome: AutomationRunApprovalOutcome, answeredBy?: 'user') => void
  timer: unknown
}

/** Keep the exact text; only bound it, and say where the bound cut. */
export function clipApprovalSubject(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (text.length <= MAX_APPROVAL_SUBJECT_CHARS) return text
  return `${text.slice(0, MAX_APPROVAL_SUBJECT_CHARS - 1)}…`
}

const SUBJECT_OUTCOMES: AutomationRunApprovalOutcome[] = [
  'approved',
  'denied',
  'timeout',
  'queue-full',
  'run-busy',
  'run-ended',
  'interrupted',
]

/**
 * Restore the live wait attached to a job, or drop it.
 *
 * Only a request that can still be answered is kept: an id, a real timestamp
 * and at least one character of description. A value that fails any check is
 * dropped rather than shown as "waiting for something" the panel cannot name.
 */
export function normalizeWaitingApproval(raw: unknown): AutomationWaitingApproval | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const wait = raw as Record<string, unknown>
  if (typeof wait.requestId !== 'string' || !wait.requestId.trim()) return undefined
  if (typeof wait.since !== 'number' || !Number.isFinite(wait.since) || wait.since < 0) return undefined
  const subject = clipApprovalSubject(wait.subject)
  if (!subject) return undefined
  return {
    requestId: wait.requestId.trim(),
    since: Math.floor(wait.since),
    subject,
  }
}

/**
 * Restore one held-request record, or drop it.
 *
 * The internal invariants are re-checked here because the record is the only
 * place a reader learns who answered: `answeredBy` exists exactly for the two
 * human answers, a wait cannot resolve before it was asked, and a structural
 * refusal waited 0 ms. A row that breaks one of those is a row that lies, so it
 * is dropped without taking the run with it.
 */
export function normalizeRunApproval(raw: unknown): AutomationRunApproval | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const approval = raw as Record<string, unknown>
  if (typeof approval.askedAt !== 'number' || !Number.isFinite(approval.askedAt) || approval.askedAt < 0) {
    return undefined
  }
  if (typeof approval.resolvedAt !== 'number' || !Number.isFinite(approval.resolvedAt)) return undefined
  if (approval.resolvedAt < approval.askedAt) return undefined
  if (typeof approval.outcome !== 'string' ||
    !SUBJECT_OUTCOMES.includes(approval.outcome as AutomationRunApprovalOutcome)) {
    return undefined
  }
  const outcome = approval.outcome as AutomationRunApprovalOutcome
  const subject = clipApprovalSubject(approval.subject)
  if (!subject) return undefined
  const waitedMs = typeof approval.waitedMs === 'number' && Number.isFinite(approval.waitedMs) &&
    approval.waitedMs >= 0
    ? Math.floor(approval.waitedMs)
    : Math.max(0, Math.floor(approval.resolvedAt - approval.askedAt))

  const answeredByUser = approval.answeredBy === 'user'
  const humanAnswer = outcome === 'approved' || outcome === 'denied'
  if (humanAnswer !== answeredByUser) return undefined
  if ((outcome === 'queue-full' || outcome === 'run-busy') && waitedMs !== 0) return undefined

  return {
    askedAt: Math.floor(approval.askedAt),
    subject,
    outcome,
    ...(answeredByUser ? { answeredBy: 'user' as const } : {}),
    resolvedAt: Math.floor(approval.resolvedAt),
    waitedMs,
  }
}

/** The whole list attached to a record, newest kept, or absent when none is usable. */
export function normalizeRunApprovals(raw: unknown): AutomationRunApproval[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const approvals = raw
    .map(normalizeRunApproval)
    .filter((approval): approval is AutomationRunApproval => approval !== undefined)
    .slice(-MAX_RUN_APPROVALS_RECORDED)
  return approvals.length > 0 ? approvals : undefined
}

/** Turn a settled decision into the row the run record keeps. */
export function toRunApproval(decision: RunApprovalDecision): AutomationRunApproval {
  return {
    askedAt: decision.since,
    subject: decision.subject,
    outcome: decision.outcome,
    ...(decision.answeredBy ? { answeredBy: decision.answeredBy } : {}),
    resolvedAt: decision.resolvedAt,
    waitedMs: decision.waitedMs,
  }
}

export class RunApprovalQueue {
  private readonly clock: RunApprovalClock
  /** Keyed by `jobId \u0000 requestId`, so one job cannot hold two. */
  private readonly entries = new Map<string, Entry>()

  constructor(clock: RunApprovalClock = REAL_CLOCK) {
    this.clock = clock
  }

  /** The requests a panel should show right now, oldest first. */
  list(): HeldRunApproval[] {
    return [...this.entries.values()]
      .map(entry => entry.hold)
      .sort((a, b) => a.since - b.since)
  }

  /**
   * Hold one request, or refuse it.
   *
   * `onSettled` runs exactly once per call: synchronously for a refusal, and
   * later for a held request (answered, timed out, or released with its run).
   * It is the caller's single path to both answer the engine and record what
   * happened — keeping those together is what makes "answered" and "recorded"
   * impossible to disagree.
   */
  request(
    ask: RunApprovalAsk,
    onSettled: (decision: RunApprovalDecision) => void,
  ): { held: boolean; hold?: HeldRunApproval; decision?: RunApprovalDecision } {
    const now = this.clock.now()
    const jobId = typeof ask.jobId === 'string' ? ask.jobId.trim() : ''
    const runKey = typeof ask.runKey === 'string' ? ask.runKey.trim() : ''
    const requestId = typeof ask.requestId === 'string' ? ask.requestId.trim() : ''
    const subject = clipApprovalSubject(ask.subject)
    if (!jobId || !runKey || !requestId || !subject) {
      // Not a request this queue can put to anyone; the caller denies it and
      // keeps no record, because there is nothing the user could have answered.
      return { held: false }
    }

    const refuse = (outcome: AutomationRunApprovalOutcome): { held: false; decision: RunApprovalDecision } => {
      const decision: RunApprovalDecision = {
        jobId,
        runKey,
        requestId,
        subject,
        since: now,
        resolvedAt: now,
        waitedMs: 0,
        outcome,
      }
      onSettled(decision)
      return { held: false, decision }
    }

    // One request per run: a second concurrent ask from the same run is refused
    // rather than queued, because the run cannot answer two and holding both
    // would make the panel's approve button mean two different things.
    if (this.hasRun(runKey)) return refuse('run-busy')
    if (this.entries.size >= MAX_HELD_RUN_APPROVALS) return refuse('queue-full')

    const hold: HeldRunApproval = {
      jobId,
      jobName: typeof ask.jobName === 'string' ? ask.jobName : jobId,
      runKey,
      requestId,
      since: now,
      subject,
    }
    const key = entryKey(jobId, requestId)
    let settled = false
    const settle = (decision: RunApprovalDecision) => {
      if (settled) return
      settled = true
      const entry = this.entries.get(key)
      if (entry) {
        this.clock.clearTimeout(entry.timer)
        this.entries.delete(key)
      }
      onSettled(decision)
    }
    const finish = (outcome: AutomationRunApprovalOutcome, answeredBy?: 'user') => {
      const at = this.clock.now()
      settle({
        jobId,
        runKey,
        requestId,
        subject,
        since: hold.since,
        resolvedAt: at,
        waitedMs: Math.max(0, at - hold.since),
        outcome,
        ...(answeredBy ? { answeredBy } : {}),
      })
    }

    const timer = this.clock.setTimeout(() => finish('timeout'), RUN_APPROVAL_TIMEOUT_MS)
    this.entries.set(key, { hold, settle: finish, timer })
    return { held: true, hold }
  }

  /**
   * Answer one held request. Only a live hold can be answered: a stale row in
   * a panel (the request timed out between render and click) must not be able
   * to answer a request that no longer exists, and must not answer a different
   * one.
   */
  answer(jobId: string, requestId: string, approved: boolean): boolean {
    const entry = this.entries.get(entryKey(jobId, requestId))
    if (!entry) return false
    entry.settle(approved ? 'approved' : 'denied', 'user')
    return true
  }

  /** Settle every request this run owns; called when the run ends or stops. */
  releaseRun(runKey: string, outcome: 'run-ended' | 'interrupted' = 'run-ended'): number {
    let released = 0
    for (const entry of [...this.entries.values()]) {
      if (entry.hold.runKey !== runKey) continue
      entry.settle(outcome)
      released += 1
    }
    return released
  }

  /** Settle everything — process shutdown, or a harness between scenarios. */
  dispose(outcome: 'run-ended' | 'interrupted' = 'run-ended'): void {
    for (const entry of [...this.entries.values()]) entry.settle(outcome)
  }

  /** Size, for callers that only need to know whether the cap is reached. */
  get size(): number {
    return this.entries.size
  }

  private hasRun(runKey: string): boolean {
    for (const entry of this.entries.values()) {
      if (entry.hold.runKey === runKey) return true
    }
    return false
  }
}

function entryKey(jobId: string, requestId: string): string {
  return `${jobId}\u0000${requestId}`
}

/**
 * The process-wide queue. The runner holds requests in it and the IPC handler
 * answers them through it, so there is one set of holds in the process, not one
 * per module copy. Harnesses construct their own `RunApprovalQueue` with a fake
 * clock instead of touching this one.
 */
export const runApprovalQueue = new RunApprovalQueue()
