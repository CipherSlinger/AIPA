/**
 * Pure view model for the live MCP server status in Settings → MCP.
 *
 * The settings list comes from the config file, which knows nothing about a
 * running engine. Codex reports startup separately (`mcpServer/startupStatus/
 * updated`) and sign-in completion separately (`mcpServer/oauthLogin/
 * completed`); this module is the one place that joins the two, so:
 *
 *  - a row exists only for a configured server — a report never creates one;
 *  - a configured server with no report has `startup: null`, and the UI shows
 *    nothing. "We have not heard from the engine" is not "connected";
 *  - `error` and `failureReason` are kept exactly as the engine sent them; the
 *    only derived value is which localized label names the reported enum.
 *
 * No React, no clock reads: callers pass `now` when they parse a live payload,
 * which keeps the module trivially testable.
 */

export type McpStartupState = 'starting' | 'ready' | 'failed' | 'cancelled'
export type McpStartupFailureReason = 'reauthenticationRequired'

/** One `mcpServer/startupStatus/updated` report, flattened by the bridge. */
export interface McpStartupReport {
  serverName: string
  status: McpStartupState
  /** The engine's own failure text, verbatim, or null when it sent none. */
  error: string | null
  /** The engine's typed enum token, verbatim. */
  failureReason: McpStartupFailureReason | null
  /** Reporting app-server process (the bridge id), for lifetime bookkeeping. */
  sessionId: string | null
  /** Wall-clock ms when the report was received. */
  receivedAt: number
}

/** One `mcpServer/oauthLogin/completed` report. */
export interface McpOauthReport {
  serverName: string
  success: boolean
  /** The engine's own failure text, verbatim, or null. */
  error: string | null
  sessionId: string | null
  receivedAt: number
}

export interface McpStatusSnapshot {
  startup: McpStartupReport[]
  oauth: McpOauthReport[]
}

/** What one configured server's row may render. Null means "nothing to say". */
export interface McpServerStatusRow {
  serverName: string
  startup: {
    /** The engine enum, kept so the pill can expose it as a raw token. */
    state: McpStartupState
    /** i18n key for the short label; never a "connected" claim. */
    labelKey: string
    error: string | null
    failureReason: string | null
  } | null
  oauth: {
    success: boolean
    labelKey: string
    error: string | null
  } | null
}

export const EMPTY_MCP_STATUS_SNAPSHOT: McpStatusSnapshot = { startup: [], oauth: [] }

const STARTUP_STATES: ReadonlySet<string> = new Set([
  'starting',
  'ready',
  'failed',
  'cancelled',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function receivedAtOf(record: Record<string, unknown>, nowMs: number): number {
  return typeof record.receivedAt === 'number' && Number.isFinite(record.receivedAt)
    ? record.receivedAt
    : nowMs
}

/**
 * Validate one `cli:mcpStartupStatusUpdated` payload. Returns null for a
 * payload that cannot be attributed to a server or names a state this build
 * does not know — an unknown state shows nothing rather than being guessed.
 */
export function parseMcpStartupReport(
  payload: unknown,
  nowMs: number,
): McpStartupReport | null {
  const record = asRecord(payload)
  if (!record) return null
  const serverName = nonEmptyString(record.serverName)
  if (!serverName) return null
  if (typeof record.status !== 'string' || !STARTUP_STATES.has(record.status)) return null
  return {
    serverName,
    status: record.status as McpStartupState,
    error: nonEmptyString(record.error),
    failureReason: record.failureReason === 'reauthenticationRequired'
      ? 'reauthenticationRequired'
      : null,
    sessionId: nonEmptyString(record.sessionId),
    receivedAt: receivedAtOf(record, nowMs),
  }
}

/** Validate one `cli:mcpOauthLoginCompleted` payload. */
export function parseMcpOauthReport(
  payload: unknown,
  nowMs: number,
): McpOauthReport | null {
  const record = asRecord(payload)
  if (!record) return null
  const serverName = nonEmptyString(record.serverName)
  if (!serverName) return null
  if (typeof record.success !== 'boolean') return null
  return {
    serverName,
    success: record.success,
    error: nonEmptyString(record.error),
    sessionId: nonEmptyString(record.sessionId),
    receivedAt: receivedAtOf(record, nowMs),
  }
}

function upsertByServer<T extends { serverName: string; receivedAt: number }>(
  reports: readonly T[],
  next: T,
): T[] {
  const index = reports.findIndex(report => report.serverName === next.serverName)
  if (index < 0) return [...reports, next]
  const existing = reports[index]
  // A late-arriving older report must not overwrite a newer one.
  if (existing.receivedAt > next.receivedAt) return [...reports]
  const copy = [...reports]
  copy[index] = next
  return copy
}

/** Read the `mcp:runtimeStatus` snapshot defensively, newest per server. */
export function readMcpStatusSnapshot(payload: unknown, nowMs: number): McpStatusSnapshot {
  const record = asRecord(payload)
  const startupRaw = Array.isArray(record?.startup) ? record.startup : []
  const oauthRaw = Array.isArray(record?.oauth) ? record.oauth : []
  let startup: McpStartupReport[] = []
  for (const entry of startupRaw) {
    const report = parseMcpStartupReport(entry, nowMs)
    if (report) startup = upsertByServer(startup, report)
  }
  let oauth: McpOauthReport[] = []
  for (const entry of oauthRaw) {
    const report = parseMcpOauthReport(entry, nowMs)
    if (report) oauth = upsertByServer(oauth, report)
  }
  return { startup, oauth }
}

/**
 * Fold in a live startup report. A newer startup report also retires an older
 * sign-in line for that server: the engine has moved on, and the completion
 * would describe a previous attempt.
 */
export function applyMcpStartupReport(
  snapshot: McpStatusSnapshot,
  report: McpStartupReport,
): McpStatusSnapshot {
  return {
    startup: upsertByServer(snapshot.startup, report),
    oauth: snapshot.oauth.filter(existing =>
      existing.serverName !== report.serverName || existing.receivedAt > report.receivedAt),
  }
}

/**
 * Fold in a live sign-in completion. A successful sign-in clears an older
 * startup report for that server — the "needs sign-in" verdict no longer
 * applies and the engine has not yet re-reported startup. A failed sign-in
 * leaves the previous startup state alone: it may still be accurate.
 */
export function applyMcpOauthReport(
  snapshot: McpStatusSnapshot,
  report: McpOauthReport,
): McpStatusSnapshot {
  const startup = report.success
    ? snapshot.startup.filter(existing =>
        existing.serverName !== report.serverName || existing.receivedAt > report.receivedAt)
    : snapshot.startup
  return {
    startup,
    oauth: upsertByServer(snapshot.oauth, report),
  }
}

/**
 * Merge a snapshot read with reports that arrived while the read was in
 * flight. The live copy wins when it is newer; the snapshot fills the gaps.
 */
export function mergeMcpStatusSnapshot(
  current: McpStatusSnapshot,
  incoming: McpStatusSnapshot,
): McpStatusSnapshot {
  let merged = incoming
  for (const report of current.startup) merged = applyMcpStartupReport(merged, report)
  for (const report of current.oauth) merged = applyMcpOauthReport(merged, report)
  return merged
}

/**
 * Drop everything reported by an app-server process that has exited. Its
 * reports described that process only; a status from a dead process is not a
 * current status.
 */
export function dropMcpReportsForSession(
  snapshot: McpStatusSnapshot,
  sessionId: string,
): McpStatusSnapshot {
  if (!sessionId) return snapshot
  const startup = snapshot.startup.filter(report => report.sessionId !== sessionId)
  const oauth = snapshot.oauth.filter(report => report.sessionId !== sessionId)
  if (startup.length === snapshot.startup.length && oauth.length === snapshot.oauth.length) {
    return snapshot
  }
  return { startup, oauth }
}

function startupLabelKey(report: McpStartupReport): string {
  // `failed` + this typed reason is the engine saying the server needs the user
  // to sign in. That is more specific than "failed", so it names the row.
  if (report.status === 'failed' && report.failureReason === 'reauthenticationRequired') {
    return 'settings.mcpPage.statusNeedsAuth'
  }
  switch (report.status) {
    case 'starting': return 'settings.mcpPage.statusStarting'
    case 'ready': return 'settings.mcpPage.statusReady'
    case 'failed': return 'settings.mcpPage.statusFailed'
    case 'cancelled': return 'settings.mcpPage.statusCancelled'
  }
}

/**
 * Join the configured list with the known reports. Only names present in
 * `configuredNames` produce rows, in config order — a report about a server
 * that is no longer configured cannot fabricate a row.
 */
export function deriveMcpServerStatuses(
  configuredNames: readonly string[],
  snapshot: McpStatusSnapshot,
): McpServerStatusRow[] {
  const startupByName = new Map(snapshot.startup.map(report => [report.serverName, report]))
  const oauthByName = new Map(snapshot.oauth.map(report => [report.serverName, report]))

  return configuredNames.map(serverName => {
    const startup = startupByName.get(serverName)
    const oauth = oauthByName.get(serverName)
    return {
      serverName,
      startup: startup
        ? {
            state: startup.status,
            labelKey: startupLabelKey(startup),
            error: startup.error,
            failureReason: startup.failureReason,
          }
        : null,
      oauth: oauth
        ? {
            success: oauth.success,
            labelKey: oauth.success
              ? 'settings.mcpPage.oauthCompleted'
              : 'settings.mcpPage.oauthFailed',
            error: oauth.error,
          }
        : null,
    }
  })
}
