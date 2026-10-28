/**
 * Turn `cli:hookRun` notifications into transcript notices.
 *
 * Verified Codex behaviour (0.145.x):
 *   - a `userPromptSubmit` hook that returns `{"decision":"block"}` completes
 *     with `status: 'blocked'`; the model never receives a request and the
 *     turn ends with an empty item list. Without a row saying so, the chat
 *     simply has no answer and no reason.
 *   - a hook that exits non-zero completes with `status: 'failed'` but the turn
 *     proceeds (fail-open) and the model never sees the failure. That matters
 *     for `userPromptSubmit` and `sessionStart`, whose output the model would
 *     have used; a failed PreToolUse/PostToolUse hook concerns one tool call
 *     and must not become a row on every tool use.
 *   - `completed` runs are silent.
 *
 * React-free so the harness exercises the real decision logic.
 */
import type { HookNotice } from '../../types/app.types'

/**
 * Failed hooks whose output the model would have depended on. Everything else
 * fails open inside one tool call and would spam the transcript if surfaced.
 */
export const SURFACED_FAILED_EVENTS: ReadonlySet<string> = new Set([
  'userPromptSubmit',
  'sessionStart',
])

/** basename for Windows and POSIX paths, without pulling in Node's `path`. */
export function hookSourceName(sourcePath: unknown): string {
  if (typeof sourcePath !== 'string' || !sourcePath) return ''
  const trimmed = sourcePath.replace(/[\\/]+$/, '')
  const base = trimmed.split(/[\\/]/).pop() ?? ''
  return /^[A-Za-z]:$/.test(base) ? '' : base
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Decide whether this hook run deserves a transcript row.
 *
 * Only the completion notification can be judged: a `started` notification
 * says nothing about the outcome. A notification without a run, event name or
 * recognisable status is ignored, matching the bridge's drop rule.
 */
export function decideHookNotice(payload: unknown): HookNotice | null {
  const event = asRecord(payload)
  if (!event || event.phase !== 'completed') return null
  const run = asRecord(event.run)
  if (!run) return null

  const status = run.status
  if (status !== 'blocked' && status !== 'failed') return null
  const eventName = typeof run.eventName === 'string' ? run.eventName : ''
  if (!eventName) return null
  if (status === 'failed' && !SURFACED_FAILED_EVENTS.has(eventName)) return null

  const wantedKind = status === 'blocked' ? 'feedback' : 'error'
  const rawEntries = Array.isArray(run.entries) ? run.entries : []
  const texts: string[] = []
  let truncated = false
  for (const raw of rawEntries) {
    const entry = asRecord(raw)
    if (!entry || entry.kind !== wantedKind) continue
    if (typeof entry.text !== 'string' || !entry.text) continue
    texts.push(entry.text)
    if (entry.truncated === true) truncated = true
  }

  return {
    kind: status,
    runId: typeof run.id === 'string' ? run.id : '',
    eventName,
    sourceName: hookSourceName(run.sourcePath),
    // Verbatim, in the order the engine sent them. No summary line is added:
    // the hook's own words are the useful part.
    text: texts.join('\n\n'),
    truncated,
  }
}
