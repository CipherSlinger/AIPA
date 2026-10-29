/**
 * Pure helpers for what a finished code-block run leaves behind.
 *
 * `CodeBlock`'s Run panel used to end at a status line: the output could be
 * read but not copied, the command could not be run again, and the user had to
 * retype the whole situation to ask AIPA about it. These helpers own the
 * decisions behind those three actions so they can be tested without React:
 *
 *   - `describeRunOutcome` — the status in words, exactly the three distinct
 *     facts the panel already distinguishes: exit, stopped, could not start.
 *   - `buildRunDraft` — a bounded composer draft. Both the command and the
 *     output are capped, and a cap that bites is stated in the draft rather
 *     than silently shortening what the user asked about.
 *   - `planOutputCopy` — what Copy writes, and whether anything is there to
 *     write. The empty case is not a successful copy of nothing.
 *
 * Nothing here starts a process or claims one ran: every input is the state
 * the panel got from the main process's exit event.
 */

/** Characters of output tail included in the composer draft. */
export const RUN_DRAFT_OUTPUT_CAP = 2000
/** Characters of command included in the composer draft. */
export const RUN_DRAFT_COMMAND_CAP = 2000
/** Characters of a spawn error included in the composer draft. */
export const RUN_DRAFT_REASON_CAP = 500
/** Characters of a folder path included in the composer draft. */
export const RUN_DRAFT_PATH_CAP = 500

export type RunStatus = 'idle' | 'running' | 'exited' | 'failed' | 'stopped'
export type RunStopReason = 'user' | 'timeout'

export interface RunFacts {
  status: RunStatus
  exitCode: number | null
  signal: string | null
  stoppedReason: RunStopReason | null
  failureMessage: string | null
  durationMs: number | null
  timeoutMs: number | null
  output: string
  truncated: boolean
}

export type RunTranslate = (key: string, params?: Record<string, string | number>) => string

/** `3s`, `1m 05s` — same wording as the status row, so the draft cannot disagree. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, '0')}s`
    : `${seconds}s`
}

function count(n: number): string {
  return n.toLocaleString()
}

function takeHead(text: string, cap: number): string {
  return text.length > cap ? text.slice(0, cap) : text
}

/** A draft is only meaningful once the run reported a result. */
export function canAskAboutRun(facts: RunFacts): boolean {
  return facts.status === 'exited' || facts.status === 'failed' || facts.status === 'stopped'
}

/** The result in words. Timed out and stopped-by-you are different facts. */
export function describeRunOutcome(facts: RunFacts, t: RunTranslate): string {
  switch (facts.status) {
    case 'failed': {
      const raw = facts.failureMessage || t('codeAction.run.unknownError')
      const reason = takeHead(raw, RUN_DRAFT_REASON_CAP)
      return t('codeAction.run.draft.status.couldNotStart', {
        reason: raw.length > RUN_DRAFT_REASON_CAP
          ? t('codeAction.run.draft.reasonTruncated', {
            reason,
            chars: count(RUN_DRAFT_REASON_CAP),
          })
          : reason,
      })
    }
    case 'stopped':
      if (facts.stoppedReason === 'timeout') {
        return t('codeAction.run.draft.status.timedOut', {
          seconds: Math.round((facts.timeoutMs ?? 120_000) / 1000),
        })
      }
      return facts.exitCode !== null
        ? t('codeAction.run.draft.status.stoppedWithCode', { code: facts.exitCode })
        : t('codeAction.run.draft.status.stopped')
    case 'exited':
      if (facts.exitCode !== null) {
        return t('codeAction.run.draft.status.exited', { code: facts.exitCode })
      }
      return facts.signal
        ? t('codeAction.run.draft.status.signal', { signal: facts.signal })
        : t('codeAction.run.draft.status.noExitCode')
    default:
      // The Ask button is hidden until `canAskAboutRun`; this keeps a stray
      // call from inventing an outcome.
      return t('codeAction.run.draft.status.unreported')
  }
}

export interface RunDraftOptions {
  /** The fenced block's text, as shown above the panel. */
  command: string
  /** The folder the confirmation dialog showed for this run. */
  cwd: string | null
  t: RunTranslate
}

/**
 * The text inserted into the composer. It asks, it does not send: the user
 * edits and sends it. Every variable part is bounded, and any bound that bites
 * is written into the draft.
 */
export function buildRunDraft(facts: RunFacts, options: RunDraftOptions): string {
  if (!canAskAboutRun(facts)) return ''
  const { t } = options

  const rawCommand = options.command.trim()
  const command = rawCommand
    ? takeHead(rawCommand, RUN_DRAFT_COMMAND_CAP)
    : t('codeAction.run.draft.commandEmpty')

  const rawCwd = options.cwd ? options.cwd.trim() : ''
  const cwd = rawCwd
    ? takeHead(rawCwd, RUN_DRAFT_PATH_CAP)
    : t('codeAction.run.draft.folderUnknown')

  const lines: string[] = [
    t('codeAction.run.draft.header'),
    '',
    t('codeAction.run.draft.commandLabel'),
    command,
  ]
  if (rawCommand.length > RUN_DRAFT_COMMAND_CAP) {
    lines.push(t('codeAction.run.draft.commandTruncated', {
      chars: count(RUN_DRAFT_COMMAND_CAP),
    }))
  }
  lines.push(
    '',
    rawCwd ? t('codeAction.run.draft.folder', { cwd }) : cwd,
    t('codeAction.run.draft.result', { status: describeRunOutcome(facts, t) }),
    t('codeAction.run.draft.elapsed', { time: formatElapsed(facts.durationMs ?? 0) }),
    '',
    t('codeAction.run.draft.outputLabel'),
  )

  if (facts.status === 'failed' && !facts.output) {
    // A failure with no output is the spawn/validation path: the draft must
    // not leave a blank line that could be read as output. A failure that did
    // emit something falls through and shows it rather than hiding it.
    lines.push(t('codeAction.run.draft.outputNoneStarted'))
  } else if (!facts.output) {
    lines.push(t('codeAction.run.draft.outputEmpty'))
  } else {
    const tail = facts.output.length > RUN_DRAFT_OUTPUT_CAP
      ? facts.output.slice(facts.output.length - RUN_DRAFT_OUTPUT_CAP)
      : facts.output
    if (facts.output.length > RUN_DRAFT_OUTPUT_CAP || facts.truncated) {
      lines.push(t('codeAction.run.draft.outputTruncated', { chars: count(tail.length) }))
    }
    lines.push(tail)
  }

  return lines.join('\n')
}

export interface OutputCopyPlan {
  /** False when the run left nothing to copy; never a "copied" of empty text. */
  copyable: boolean
  /** Exactly the stripped, tail-capped text the panel showed. */
  text: string
  chars: number
  /** Whether earlier output had already been dropped before this copy. */
  truncated: boolean
}

/** Copy copies the visible text, and the toast must mention dropped output. */
export function planOutputCopy(facts: Pick<RunFacts, 'output' | 'truncated'>): OutputCopyPlan {
  return {
    copyable: facts.output.length > 0,
    text: facts.output,
    chars: facts.output.length,
    truncated: facts.truncated,
  }
}
