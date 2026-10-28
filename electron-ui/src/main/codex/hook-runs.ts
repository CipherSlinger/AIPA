/**
 * Normalizers for Codex's hook-run notifications.
 *
 * The engine emits `hook/started` and `hook/completed` with identical params
 * (verified against Codex 0.145.x with a mock Responses provider):
 *
 *   { threadId: string, turnId: string | null, run: HookRunSummary }
 *
 * `HookRunSummary` carries more than AIPA displays. This module is the one
 * place that decides which fields cross the process boundary; unknown fields
 * are dropped, malformed values become null/empty instead of throwing, and a
 * notification without a usable `run` is dropped rather than guessed at.
 *
 * Kept free of Node/Electron/React imports so the wave-46 harness can bundle
 * and exercise the real code.
 */

/** Longest hook entry text AIPA forwards. Hook output is not a file body. */
export const HOOK_ENTRY_TEXT_LIMIT = 2000

/** Most entries forwarded from one run. A hook can return a flood. */
export const HOOK_ENTRY_LIMIT = 20

export type CodexHookRunStatus = 'running' | 'completed' | 'failed' | 'blocked'

export interface CodexHookRunEntry {
  /** `error | context | feedback | warning | stop` on the wire. */
  kind: string
  /** Hook output, verbatim unless `truncated` is set. */
  text: string
  /** True when `text` was cut at {@link HOOK_ENTRY_TEXT_LIMIT}. */
  truncated: boolean
}

export interface CodexHookRun {
  /** `<kebab-event>:<displayOrder>:<sourcePath>[:<tool_use_id>]`. */
  id: string
  /** camelCase event name (`preToolUse`, `userPromptSubmit`, …). */
  eventName: string
  handlerType: string
  executionMode: string
  /** `thread` (sessionStart) or `turn`. */
  scope: string
  sourcePath: string
  source: string
  displayOrder: number | null
  status: CodexHookRunStatus
  /** null in every observed run; passed through, never interpreted. */
  statusMessage: string | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  /** Empty while running; entries arrive with the completion notification. */
  entries: CodexHookRunEntry[]
}

export interface CodexHookRunNotification {
  threadId: string
  turnId: string | null
  run: CodexHookRun
}

const RUN_STATUSES: ReadonlySet<string> = new Set([
  'running',
  'completed',
  'failed',
  'blocked',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeEntry(raw: unknown): CodexHookRunEntry | null {
  const entry = asRecord(raw)
  if (!entry) return null
  const text = stringOr(entry.text)
  // An entry with no text says nothing; forwarding it would only add a blank
  // line to the notice.
  if (!text) return null
  return {
    kind: stringOr(entry.kind),
    text: text.length > HOOK_ENTRY_TEXT_LIMIT
      ? text.slice(0, HOOK_ENTRY_TEXT_LIMIT)
      : text,
    truncated: text.length > HOOK_ENTRY_TEXT_LIMIT,
  }
}

/**
 * Normalize one `hook/started` or `hook/completed` notification.
 *
 * Returns null when the payload has no run object, no usable event name, or a
 * status this build does not know. The caller (the bridge) then logs and drops
 * the notification — inventing a run would put a made-up row in the transcript.
 * `phase` comes from the notification method, not from `run.status`: the two
 * notifications share `HookRunSummary` and only the method names the moment.
 */
export function normalizeHookRun(params: unknown): CodexHookRunNotification | null {
  const payload = asRecord(params)
  if (!payload) return null
  const run = asRecord(payload.run)
  if (!run) return null

  const eventName = stringOr(run.eventName)
  if (!eventName) return null
  const status = stringOr(run.status)
  if (!RUN_STATUSES.has(status)) return null

  const rawEntries = Array.isArray(run.entries) ? run.entries : []
  const entries: CodexHookRunEntry[] = []
  for (const raw of rawEntries) {
    if (entries.length >= HOOK_ENTRY_LIMIT) break
    const entry = normalizeEntry(raw)
    if (entry) entries.push(entry)
  }

  return {
    threadId: stringOr(payload.threadId),
    turnId: typeof payload.turnId === 'string' ? payload.turnId : null,
    run: {
      id: stringOr(run.id),
      eventName,
      handlerType: stringOr(run.handlerType),
      executionMode: stringOr(run.executionMode),
      scope: stringOr(run.scope),
      sourcePath: stringOr(run.sourcePath),
      source: stringOr(run.source),
      displayOrder: numberOrNull(run.displayOrder),
      status: status as CodexHookRunStatus,
      statusMessage: typeof run.statusMessage === 'string' ? run.statusMessage : null,
      startedAt: numberOrNull(run.startedAt),
      completedAt: numberOrNull(run.completedAt),
      durationMs: numberOrNull(run.durationMs),
      entries,
    },
  }
}
