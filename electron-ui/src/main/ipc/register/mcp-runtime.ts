/**
 * Live MCP state shared by two IPC groups.
 *
 * The CLI group writes these caches as bridges report (`systemInit` tools,
 * startup/auth notifications) and the config group reads and resets them for
 * Settings → MCP. They live here, in one module, rather than in either group:
 * both sides must observe the same maps, and duplicating them would make a
 * reload clear one copy while the page still read the other.
 */
import type {
  CodexMcpStartupStatus,
  CodexMcpOauthLoginCompleted,
} from '../../codex/codex-bridge'

// Cache for MCP server tools populated from system.init events
// Maps serverName -> list of tool names (e.g. "mcp__myserver__tool1")
const mcpServerToolsCache: Record<string, string[]> = {}

/** Remember the tools each MCP server reported, for the `mcp:getTools` lookups. */
export function cacheMcpTools(initData: unknown): void {
  const servers = (initData as { mcpServers?: Array<{ name: string; tools?: string[] }> })?.mcpServers
  if (!servers) return
  for (const srv of servers) {
    if (srv.tools && srv.tools.length > 0) mcpServerToolsCache[srv.name] = srv.tools
  }
}

/** The tools reported by one server so far (empty until its first `systemInit`). */
export function getCachedMcpTools(serverName: string): string[] {
  return mcpServerToolsCache[serverName] ?? []
}

/** Drop every cached tool list: `mcp:reload` replaced the configuration. */
export function clearMcpToolCache(): void {
  for (const name of Object.keys(mcpServerToolsCache)) delete mcpServerToolsCache[name]
}

/**
 * Latest live MCP reports, for Settings → MCP when it opens after the engine
 * already spoke. Startup state belongs to one app-server process, so records
 * are kept per (bridge, server) and a process exiting removes only its own:
 * a "ready" from a dead process is not a current status, while another live
 * process's older report still is. Background (`internal-`) bridges never
 * write here — they own no user-facing surface.
 */
type McpStartupStatusRecord = CodexMcpStartupStatus & { sessionId: string; receivedAt: number }
type McpOauthRecord = CodexMcpOauthLoginCompleted & { sessionId: string; receivedAt: number }

const mcpStartupStatusCache = new Map<string, McpStartupStatusRecord>()
const mcpOauthCache = new Map<string, McpOauthRecord>()

function mcpReportKey(bridgeId: string, serverName: string): string {
  return `${bridgeId}\u0000${serverName}`
}

/** Collapse the per-process records to the newest report per server name. */
function latestMcpReports<T extends { serverName: string; receivedAt: number }>(
  reports: Iterable<T>,
): T[] {
  const latest = new Map<string, T>()
  for (const report of reports) {
    const existing = latest.get(report.serverName)
    if (!existing || report.receivedAt >= existing.receivedAt) latest.set(report.serverName, report)
  }
  return [...latest.values()]
}

export function noteMcpStartupStatus(bridgeId: string, report: CodexMcpStartupStatus): void {
  mcpStartupStatusCache.set(mcpReportKey(bridgeId, report.serverName), {
    ...report,
    sessionId: bridgeId,
    receivedAt: Date.now(),
  })
  // A newer startup report supersedes an earlier sign-in notice from the same
  // process: the engine has moved on and the completion line would describe a
  // previous attempt.
  mcpOauthCache.delete(mcpReportKey(bridgeId, report.serverName))
}

export function noteMcpOauthCompleted(bridgeId: string, completed: CodexMcpOauthLoginCompleted): void {
  mcpOauthCache.set(mcpReportKey(bridgeId, completed.serverName), {
    ...completed,
    sessionId: bridgeId,
    receivedAt: Date.now(),
  })
}

export function forgetMcpRuntimeReports(bridgeId: string): void {
  const prefix = `${bridgeId}\u0000`
  for (const key of mcpStartupStatusCache.keys()) {
    if (key.startsWith(prefix)) mcpStartupStatusCache.delete(key)
  }
  for (const key of mcpOauthCache.keys()) {
    if (key.startsWith(prefix)) mcpOauthCache.delete(key)
  }
}

/**
 * Forget every live MCP report. Used after `config/mcpServer/reload`: those
 * reports described the configuration that was just replaced, and keeping
 * them would let a removed server keep a "started" pill or a renamed one
 * inherit its predecessor's state. The page goes back to "not reported yet"
 * until the engine speaks again.
 */
export function resetMcpRuntimeReports(): void {
  mcpStartupStatusCache.clear()
  mcpOauthCache.clear()
}

/**
 * Live startup/auth reports from the current app-server process, for
 * Settings → MCP when it opens after the notifications already fired. The
 * renderer intersects these with its configured list, so a report about a
 * server that is no longer configured never becomes a row.
 */
export function readMcpRuntimeReports(): {
  startup: Array<McpStartupStatusRecord>
  oauth: Array<McpOauthRecord>
} {
  return {
    startup: latestMcpReports(mcpStartupStatusCache.values()),
    oauth: latestMcpReports(mcpOauthCache.values()),
  }
}
