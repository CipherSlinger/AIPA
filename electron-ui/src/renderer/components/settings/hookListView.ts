/**
 * View logic for Settings → Hooks (Codex-native, read-only).
 *
 * The page receives the engine's `hooks/list` reply and shows what Codex will
 * actually consider. The important honest bit is trust: an `untrusted` or
 * `modified` hook is listed by the engine but never executes, and the protocol
 * has no trust request — the user writes `[hooks.state.'<key>']` with
 * `trusted_hash` and restarts Codex.
 *
 * React-free so the wave-46 harness tests the real grouping/decision code.
 */

/** Wire shape of one hook after the preload boundary. */
export interface HookListRow {
  key: string
  eventName: string
  handlerType: string
  matcher: string | null
  command: string | null
  timeoutSec: number | null
  sourcePath: string
  source: string
  displayOrder: number
  enabled: boolean
  trustStatus: string
  /** Hash the trust state must match; shown for untrusted/modified hooks. */
  currentHash: string | null
  /** The working directory this row was listed for. */
  cwd: string
}

export interface HookListGroupView {
  cwd: string
  hooks: HookListRow[]
  warnings: string[]
  errors: Array<{ path: string; message: string }>
}

export interface HookEventGroup {
  eventName: string
  hooks: HookListRow[]
}

export type HookListOutcome =
  | { ok: true; groups: HookListGroupView[]; error: null }
  | { ok: false; groups: HookListGroupView[]; error: string | null }

/**
 * Canonical event order for the page. Known protocol events come first in
 * lifecycle order; an event this build does not know sorts after them by name
 * instead of disappearing.
 */
export const HOOK_EVENT_ORDER: readonly string[] = [
  'sessionStart',
  'userPromptSubmit',
  'preToolUse',
  'permissionRequest',
  'postToolUse',
  'preCompact',
  'postCompact',
  'subagentStart',
  'subagentStop',
  'stop',
  'sessionEnd',
]

export type HookRunState = 'runs' | 'not-running' | 'unknown'

const TRUST_LABEL_KEYS: Record<string, string> = {
  trusted: 'settings.hooks.trusted',
  untrusted: 'settings.hooks.untrusted',
  modified: 'settings.hooks.modified',
  managed: 'settings.hooks.managed',
}

/** Locale key for the engine's raw trust status. */
export function trustLabelKey(trustStatus: string): string {
  return TRUST_LABEL_KEYS[trustStatus] ?? 'settings.hooks.trustUnknown'
}

/**
 * Whether this hook will execute. Only `trusted` was verified to run;
 * `untrusted` and `modified` were verified *not* to run. Anything else
 * (`managed`, or a status a future build adds) is left unclaimed rather than
 * shown as running.
 */
export function hookRunState(hook: { enabled: boolean; trustStatus: string }): HookRunState {
  if (!hook.enabled) return 'not-running'
  if (hook.trustStatus === 'trusted') return 'runs'
  if (hook.trustStatus === 'untrusted' || hook.trustStatus === 'modified') return 'not-running'
  return 'unknown'
}

/** basename for Windows and POSIX paths, without Node's `path` module. */
export function hookSourceBasename(sourcePath: string): string {
  if (!sourcePath) return ''
  const trimmed = sourcePath.replace(/[\\/]+$/, '')
  const base = trimmed.split(/[\\/]/).pop() ?? ''
  return /^[A-Za-z]:$/.test(base) ? '' : base
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeRow(raw: unknown, cwd: string): HookListRow | null {
  const hook = asRecord(raw)
  if (!hook) return null
  const eventName = stringOr(hook.eventName)
  if (!eventName) return null
  return {
    key: stringOr(hook.key),
    eventName,
    handlerType: stringOr(hook.handlerType),
    matcher: typeof hook.matcher === 'string' ? hook.matcher : null,
    command: typeof hook.command === 'string' ? hook.command : null,
    timeoutSec: typeof hook.timeoutSec === 'number' && Number.isFinite(hook.timeoutSec)
      ? hook.timeoutSec
      : null,
    sourcePath: stringOr(hook.sourcePath),
    source: stringOr(hook.source),
    displayOrder: typeof hook.displayOrder === 'number' && Number.isFinite(hook.displayOrder)
      ? hook.displayOrder
      : 0,
    enabled: hook.enabled === true,
    trustStatus: stringOr(hook.trustStatus),
    currentHash: typeof hook.currentHash === 'string' ? hook.currentHash : null,
    cwd,
  }
}

function normalizeGroup(raw: unknown): HookListGroupView | null {
  const group = asRecord(raw)
  if (!group) return null
  const cwd = stringOr(group.cwd)
  const hooks: HookListRow[] = []
  for (const rawHook of Array.isArray(group.hooks) ? group.hooks : []) {
    const row = normalizeRow(rawHook, cwd)
    if (row) hooks.push(row)
  }
  const warnings: string[] = []
  for (const rawWarning of Array.isArray(group.warnings) ? group.warnings : []) {
    if (typeof rawWarning === 'string' && rawWarning) warnings.push(rawWarning)
  }
  const errors: Array<{ path: string; message: string }> = []
  for (const rawError of Array.isArray(group.errors) ? group.errors : []) {
    const error = asRecord(rawError)
    const message = stringOr(error?.message)
    if (message) errors.push({ path: stringOr(error?.path), message })
  }
  return { cwd, hooks, warnings, errors }
}

/**
 * Read the IPC reply defensively. `success: true` with no array is not a
 * successful empty list — it is a reply this build cannot read, and the UI says
 * so instead of claiming there are no hooks.
 */
export function readHookListReply(raw: unknown): HookListOutcome {
  const reply = asRecord(raw)
  if (!reply || reply.success !== true) {
    const error = typeof reply?.error === 'string' && reply.error.trim() ? reply.error : null
    return { ok: false, groups: [], error }
  }
  if (!Array.isArray(reply.data)) {
    return { ok: false, groups: [], error: null }
  }
  const groups: HookListGroupView[] = []
  for (const rawGroup of reply.data) {
    const group = normalizeGroup(rawGroup)
    if (group) groups.push(group)
  }
  return { ok: true, groups, error: null }
}

function eventRank(eventName: string): number {
  const index = HOOK_EVENT_ORDER.indexOf(eventName)
  return index === -1 ? HOOK_EVENT_ORDER.length : index
}

/**
 * Flatten the groups and group their hooks by event. The same hook can be
 * listed for more than one cwd (the engine resolves global config per cwd);
 * a keyed hook is shown once. Sorting is deterministic: lifecycle order for
 * known events, display order then key within an event.
 */
export function groupHooksByEvent(groups: HookListGroupView[]): HookEventGroup[] {
  const seen = new Set<string>()
  const byEvent = new Map<string, HookListRow[]>()
  for (const group of groups) {
    for (const hook of group.hooks) {
      const identity = hook.key || `${hook.eventName}\u0000${hook.sourcePath}\u0000${hook.displayOrder}`
      if (seen.has(identity)) continue
      seen.add(identity)
      const list = byEvent.get(hook.eventName)
      if (list) list.push(hook)
      else byEvent.set(hook.eventName, [hook])
    }
  }
  return [...byEvent.entries()]
    .sort(([a], [b]) => {
      const rank = eventRank(a) - eventRank(b)
      if (rank !== 0) return rank
      return a.localeCompare(b)
    })
    .map(([eventName, hooks]) => ({
      eventName,
      hooks: hooks.slice().sort((a, b) =>
        a.displayOrder - b.displayOrder || a.key.localeCompare(b.key)),
    }))
}

/** The displayable command, or a handler-type fallback (e.g. `prompt`). */
export function hookCommandLabel(hook: HookListRow): string {
  if (hook.command && hook.command.trim()) return hook.command
  return hook.handlerType ? `[${hook.handlerType}]` : ''
}
