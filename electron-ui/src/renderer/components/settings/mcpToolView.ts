/**
 * Pure view model for the per-server tool list in Settings → MCP.
 *
 * `mcp:getTools` answers from a cache that is written only when an app-server
 * handshake reports a non-empty tool list (`systemInit` → `mcpServerStatus/
 * list`). An empty response therefore means "the engine has not reported any
 * tools" — it is not evidence that the server has none. The view keeps that
 * empty-versus-unknown distinction explicit and never turns either into a
 * count of zero.
 *
 * Tool names are the engine's data. They are shown and copied exactly as
 * received; this module never normalizes, prefixes, or renames them.
 *
 * No React, no timers, no I/O: the caller supplies every input, which keeps
 * the reasoning testable and keeps the component about rendering.
 */

export type McpToolListState = 'unknown' | 'empty' | 'reported'

export interface McpToolRow {
  /** The engine's tool name, verbatim. */
  name: string
  /** The engine's description when it sent a non-blank one; otherwise null. */
  description: string | null
}

export interface McpToolListView {
  /**
   * `unknown` — no answer (not asked yet, or the answer was malformed);
   * `empty` — the engine answered but reported nothing;
   * `reported` — at least one tool came back.
   *
   * `unknown` and `empty` render the same honest sentence; they are kept
   * apart so a future caller can distinguish silence from a broken reply
   * without the UI ever claiming "0 tools".
   */
  state: McpToolListState
  tools: McpToolRow[]
  /** A count only when tools were actually reported; null otherwise. */
  count: number | null
  /** True only when there is at least one tool row to disclose. */
  canDisclose: boolean
}

/** i18n key plus interpolation for the collapsed disclosure header. */
export interface McpToolHeader {
  key: string
  params?: Record<string, string>
}

/**
 * Reload outcome as far as the protocol actually confirmed it.
 *
 * `config/mcpServer/reload` is one request for the whole engine, so this says
 * only what the engine acknowledged. Whether a server came back is a separate
 * question answered later by `mcpServer/startupStatus/updated`.
 */
export interface McpReloadOutcome {
  tone: 'success' | 'failure'
  /**
   * Localized sentence used only when `error` is null. A refusal normally has
   * the API's own text, which must be shown instead of this fallback.
   */
  textKey: string
  /** The API's error text, verbatim; null when it sent none. */
  error: string | null
}

export const UNKNOWN_MCP_TOOL_VIEW: McpToolListView = {
  state: 'unknown',
  tools: [],
  count: null,
  canDisclose: false,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Read an `mcp:getTools` reply defensively.
 *
 * A name that is not a non-blank string cannot be attributed to a tool, so the
 * entry is dropped rather than stringified. Blank descriptions are treated as
 * absent: an empty sentence would render as a stray gap, not information.
 */
export function deriveMcpToolList(payload: unknown): McpToolListView {
  const record = asRecord(payload)
  if (!record || !Array.isArray(record.tools)) {
    return { ...UNKNOWN_MCP_TOOL_VIEW, tools: [] }
  }

  const tools: McpToolRow[] = []
  for (const entry of record.tools) {
    const tool = asRecord(entry)
    if (!tool || typeof tool.name !== 'string' || !tool.name.trim()) continue
    // Keep the name exactly as received — even surrounding spaces are the
    // engine's data, not ours to tidy.
    const description = typeof tool.description === 'string' && tool.description.trim()
      ? tool.description
      : null
    tools.push({ name: tool.name, description })
  }

  if (tools.length === 0) {
    return { state: 'empty', tools: [], count: null, canDisclose: false }
  }
  return { state: 'reported', tools, count: tools.length, canDisclose: true }
}

/**
 * Header text for the disclosure. Only a real report gets a count; both
 * "nothing known" states share the "not reported yet" sentence so the UI
 * never asserts a number the engine did not send.
 */
export function mcpToolHeader(view: McpToolListView): McpToolHeader {
  if (view.state !== 'reported') {
    return { key: 'settings.mcpPage.toolsNoneReported' }
  }
  if (view.tools.length === 1) {
    return { key: 'settings.mcpPage.toolsCount' }
  }
  return {
    key: 'settings.mcpPage.toolsCountPlural',
    params: { count: String(view.tools.length) },
  }
}

/**
 * Map an `mcp:reload` reply.
 *
 * Success is exactly the API's `success === true`; a truthy string or object is
 * not a protocol confirmation. `code: 'no_engine'` is AIPA's own refusal — there
 * was no running engine to reload — so it gets a localized sentence instead of
 * an English string from main. Any other refusal carries the engine's text
 * through untouched.
 */
export function readMcpReloadResult(payload: unknown): McpReloadOutcome {
  const record = asRecord(payload)
  if (record?.success === true) {
    return {
      tone: 'success',
      textKey: 'settings.mcpPage.reloadSucceeded',
      error: null,
    }
  }
  if (record?.code === 'no_engine') {
    return {
      tone: 'failure',
      textKey: 'settings.mcpPage.reloadNoEngine',
      error: null,
    }
  }
  const error = record && typeof record.error === 'string' && record.error.trim()
    ? record.error
    : null
  return {
    tone: 'failure',
    // A failure with no text is still a failure; it just has no engine
    // sentence to quote, so the localized sentence stands in without a cause.
    textKey: 'settings.mcpPage.reloadFailed',
    error,
  }
}

/**
 * The only CLI event that can change what `mcp:getTools` returns: the
 * app-server handshake fills the cache. `cli:skillsChanged` concerns the
 * skills catalogue, not MCP tools, and is deliberately not a trigger.
 */
export const MCP_TOOLS_REFRESH_EVENT = 'cli:systemInit'

export type McpToolsRefreshTrigger =
  | { type: 'expand' }
  | { type: 'startup'; before: string | null; after: string | null }
  | { type: 'cli-event'; event: string }

/** Whether this transition is a reason to ask for the tool list again. */
export function isToolRefreshDue(trigger: McpToolsRefreshTrigger): boolean {
  switch (trigger.type) {
    case 'expand':
      // Opening the disclosure is the user asking to see the current data.
      return true
    case 'startup':
      // A server that has just become ready is the one whose list may have
      // changed since the handshake. ready → ready is the same news twice.
      return trigger.after === 'ready' && trigger.before !== 'ready'
    case 'cli-event':
      return shouldRefetchToolsForCliEvent(trigger.event)
  }
}

export function shouldRefetchToolsForCliEvent(event: string): boolean {
  return event === MCP_TOOLS_REFRESH_EVENT
}
