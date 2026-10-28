/**
 * Normalizer for Codex's `hooks/list` reply.
 *
 * Verified shape (0.145.x):
 *
 *   { data: [{ cwd, hooks: [...], warnings: string[], errors: [{path,message}] }] }
 *
 * Each hook carries the command/matcher/trust data Settings → Hooks shows.
 * The engine's `trustStatus` is the honest reason a configured hook does
 * nothing (`untrusted` / `modified` hooks are listed but never executed).
 *
 * Pure and dependency-free so the harness tests the real normalizer.
 */

export interface CodexHookDefinition {
  key: string
  eventName: string
  handlerType: string
  matcher: string | null
  command: string | null
  timeoutSec: number | null
  statusMessage: string | null
  additionalContextLimit: number | null
  sourcePath: string
  source: string
  pluginId: string | null
  displayOrder: number
  enabled: boolean
  isManaged: boolean
  currentHash: string | null
  /** `untrusted | trusted | modified` observed; `managed` is in the strings. */
  trustStatus: string
}

export interface CodexHookListError {
  path: string
  message: string
}

export interface CodexHookListGroup {
  cwd: string
  hooks: CodexHookDefinition[]
  warnings: string[]
  errors: CodexHookListError[]
}

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

function normalizeHook(raw: unknown): CodexHookDefinition | null {
  const hook = asRecord(raw)
  if (!hook) return null
  const eventName = stringOr(hook.eventName)
  // Without an event name there is nothing to group the hook under.
  if (!eventName) return null
  return {
    key: stringOr(hook.key),
    eventName,
    handlerType: stringOr(hook.handlerType),
    matcher: typeof hook.matcher === 'string' ? hook.matcher : null,
    command: typeof hook.command === 'string' ? hook.command : null,
    timeoutSec: numberOrNull(hook.timeoutSec),
    statusMessage: typeof hook.statusMessage === 'string' ? hook.statusMessage : null,
    additionalContextLimit: numberOrNull(hook.additionalContextLimit),
    sourcePath: stringOr(hook.sourcePath),
    source: stringOr(hook.source),
    pluginId: typeof hook.pluginId === 'string' ? hook.pluginId : null,
    displayOrder: numberOrNull(hook.displayOrder) ?? 0,
    // Absent is not proof of enabled. A hook AIPA cannot see enabled for must
    // not be shown as one that runs.
    enabled: hook.enabled === true,
    isManaged: hook.isManaged === true,
    currentHash: typeof hook.currentHash === 'string' ? hook.currentHash : null,
    trustStatus: stringOr(hook.trustStatus),
  }
}

function normalizeError(raw: unknown): CodexHookListError | null {
  const error = asRecord(raw)
  if (!error) return null
  const message = stringOr(error.message)
  if (!message) return null
  return { path: stringOr(error.path), message }
}

function normalizeGroup(raw: unknown): CodexHookListGroup | null {
  const group = asRecord(raw)
  if (!group) return null
  const hooks: CodexHookDefinition[] = []
  for (const rawHook of Array.isArray(group.hooks) ? group.hooks : []) {
    const hook = normalizeHook(rawHook)
    if (hook) hooks.push(hook)
  }
  const warnings: string[] = []
  for (const rawWarning of Array.isArray(group.warnings) ? group.warnings : []) {
    if (typeof rawWarning === 'string' && rawWarning) warnings.push(rawWarning)
  }
  const errors: CodexHookListError[] = []
  for (const rawError of Array.isArray(group.errors) ? group.errors : []) {
    const error = normalizeError(rawError)
    if (error) errors.push(error)
  }
  return {
    cwd: stringOr(group.cwd),
    hooks,
    warnings,
    errors,
  }
}

/**
 * Normalize the whole reply. A malformed reply yields an empty list rather
 * than throwing; the IPC handler still reports transport failures separately.
 */
export function normalizeHookList(result: unknown): CodexHookListGroup[] {
  const reply = asRecord(result)
  if (!reply || !Array.isArray(reply.data)) return []
  const groups: CodexHookListGroup[] = []
  for (const raw of reply.data) {
    const group = normalizeGroup(raw)
    if (group) groups.push(group)
  }
  return groups
}
