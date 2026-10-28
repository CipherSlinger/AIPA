/**
 * Host capability `chat.ask` — a plugin asks the assistant a question and gets
 * the answer back instead of only drawing UI.
 *
 * The turn runs on the same private machinery as the app's own background work
 * (`cli:runInternal`): a fresh `internal-` bridge, permission mode `plan`
 * (read-only sandbox for Codex, plan mode on the Claude CLI), `ephemeral`, and
 * a private sink. Nothing reaches the renderer, no `cli:*` event is published,
 * and a private turn leaves no archive entry.
 *
 * A *visible* variant — a real session the user can open later — would need a
 * non-ephemeral thread. The automation runner creates those, but it reports
 * only a 280-character summary, not the answer, so reusing it would return the
 * wrong thing. `visible: true` is therefore refused with its own error code
 * rather than silently downgraded.
 */
import { listNavPlugins } from './nav-plugin-manager'
import { pluginAiCwd } from './plugin-services'
import { assembleMemoryContext, prefixWithMemoryContext, readPersonalMemories } from '../sessions/memory-context'
import { createLogger } from '../utils/logger'

const log = createLogger('plugin-chat')

/** Permission a manifest must declare to reach this capability. */
export const PLUGIN_CHAT_PERMISSION = 'chat'

export type PluginChatErrorCode =
  | 'plugin_unknown'
  | 'permission_denied'
  | 'invalid_request'
  | 'unsupported'
  | 'busy'
  | 'rate_limited'
  | 'timeout'
  | 'failed'

/**
 * The message carries the code in `[code]` form because Electron serialises a
 * rejected invoke down to its message string. PluginHostView lifts the code
 * back out and adds it to the `aipa:response`, so the plugin gets a typed
 * refusal instead of having to parse prose.
 */
export class PluginChatError extends Error {
  constructor(readonly code: PluginChatErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'PluginChatError'
  }
}

export interface PluginChatAskArgs {
  prompt: string
  /** Ask for a session the user can read later. Refused for now (see above). */
  visible?: boolean
  /** Only meaningful for a visible turn; accepted and ignored otherwise. */
  title?: string
  /** Ask budget in ms; clamped to [MIN_TIMEOUT_MS, MAX_TIMEOUT_MS]. */
  timeoutMs?: number
}

export interface PluginChatAnswer {
  text: string
  /** Null for every private turn: no session is created. */
  sessionId: string | null
}

/** A private answer-only turn, injected by the IPC layer. */
export interface PluginChatTurn {
  prompt: string
  cwd: string
  timeoutMs: number
  /** Sanitised label embedded in the internal bridge id for attribution. */
  tag: string
}

export type PluginChatRunner = (turn: PluginChatTurn) => Promise<{
  success: boolean
  text?: string
  error?: string
}>

const DEFAULT_TIMEOUT_MS = 60_000
/** The cap the UI is allowed to ask for; a wedged turn must not hold a slot forever. */
const MAX_TIMEOUT_MS = 10 * 60_000
const MIN_TIMEOUT_MS = 5_000
/** Extra grace over the runner's own budget before this layer calls it dead. */
const OUTER_GRACE_MS = 500

/**
 * A plugin UI may fire on every click; two turns at once is already more than
 * a person can read, and the rolling cap stops a plugin-asks-in-a-loop from
 * turning into an unbounded token burn.
 */
const MAX_CONCURRENT_PER_PLUGIN = 2
const RATE_WINDOW_MS = 60_000
const MAX_ASKS_PER_WINDOW = 10

const MAX_PROMPT_CHARS = 100_000

/** Live runs per plugin id. */
const activeByPlugin = new Map<string, number>()
/** Start timestamps per plugin id, for the rolling cap. */
const recentStarts = new Map<string, number[]>()
let sequence = 0

/**
 * Manifest check, re-done here and not only in PluginHostView: a compromised
 * renderer path must not reach the capability a plugin never declared. The
 * wording matches the other host capabilities' refusal.
 */
function assertChatPermission(pluginId: unknown): string {
  if (typeof pluginId !== 'string' || !pluginId) {
    throw new PluginChatError('plugin_unknown', 'Missing plugin id')
  }
  const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
  if (!plugin) {
    throw new PluginChatError('plugin_unknown', `Unknown plugin: ${pluginId}`)
  }
  if (!plugin.manifest.permissions?.includes(PLUGIN_CHAT_PERMISSION)) {
    throw new PluginChatError(
      'permission_denied',
      `Plugin "${pluginId}" does not declare the "${PLUGIN_CHAT_PERMISSION}" permission (plugin.json → permissions)`,
    )
  }
  return pluginId
}

function clampTimeout(requested: unknown): number {
  const n = Number(requested)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.floor(n), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

/** Bridge ids are strings, not paths; keep the tag to a charset safe there. */
function tagFor(pluginId: string): string {
  const safe = pluginId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48)
  sequence = (sequence + 1) % 1_000_000
  return `plugin-${safe}-${sequence.toString(36)}`
}

function claimSlot(pluginId: string): void {
  const running = activeByPlugin.get(pluginId) ?? 0
  if (running >= MAX_CONCURRENT_PER_PLUGIN) {
    throw new PluginChatError(
      'busy',
      `Plugin "${pluginId}" already has ${running} chat turns in flight; wait for one to finish`,
    )
  }

  const now = Date.now()
  const starts = (recentStarts.get(pluginId) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (starts.length >= MAX_ASKS_PER_WINDOW) {
    throw new PluginChatError(
      'rate_limited',
      `Plugin "${pluginId}" has asked ${starts.length} questions in the last minute; try again shortly`,
    )
  }

  starts.push(now)
  recentStarts.set(pluginId, starts)
  activeByPlugin.set(pluginId, running + 1)
}

function releaseSlot(pluginId: string): void {
  const running = activeByPlugin.get(pluginId) ?? 0
  if (running <= 1) activeByPlugin.delete(pluginId)
  else activeByPlugin.set(pluginId, running - 1)
}

/**
 * Ask the assistant one question and wait for the answer.
 *
 * `runTurn` owns the engine wiring; this function owns the permission check and
 * the rails, so the same policy applies no matter where the turn actually runs.
 */
export async function askPluginChat(
  pluginId: string,
  args: PluginChatAskArgs | undefined,
  runTurn: PluginChatRunner,
): Promise<PluginChatAnswer> {
  const id = assertChatPermission(pluginId)

  const prompt = typeof args?.prompt === 'string' ? args.prompt : ''
  if (!prompt.trim()) {
    throw new PluginChatError('invalid_request', 'prompt must be a non-empty string')
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new PluginChatError('invalid_request', `prompt exceeds ${MAX_PROMPT_CHARS} characters`)
  }
  if (args?.visible === true) {
    throw new PluginChatError(
      'unsupported',
      'Visible plugin turns are not supported yet; ask with visible:false and render the answer yourself (or hand it to chat with aipa:sendPrompt)',
    )
  }

  const timeoutMs = clampTimeout(args?.timeoutMs)
  claimSlot(id)
  const tag = tagFor(id)

  log.info(`ask ${tag} (${timeoutMs}ms)`)

  // A plugin's question is still the user's assistant talking to itself: give it
  // the same persistent-memory block a manual turn sends. It reads from the
  // plugin workspace (`pluginAiCwd()`) so project-scoped memory matches where
  // the answer is produced. Best-effort: an empty/failed read leaves the prompt
  // byte-for-byte as the plugin wrote it.
  const cwd = pluginAiCwd()
  let memoryText = ''
  try {
    memoryText = (await assembleMemoryContext({
      cwd,
      personalMemories: readPersonalMemories(),
    })).text
  } catch {
    memoryText = ''
  }
  const memoryPrompt = prefixWithMemoryContext(prompt, memoryText)

  let timer: NodeJS.Timeout | undefined
  try {
    const outcome = await Promise.race([
      runTurn({ prompt: memoryPrompt, cwd, timeoutMs, tag }),
      new Promise<'outer-timeout'>((resolve) => {
        timer = setTimeout(() => resolve('outer-timeout'), timeoutMs + OUTER_GRACE_MS)
        timer.unref?.()
      }),
    ])

    if (outcome === 'outer-timeout') {
      throw new PluginChatError('timeout', `Plugin "${id}" did not get an answer within ${timeoutMs}ms`)
    }
    if (!outcome.success) {
      const detail = outcome.error || 'The assistant returned no answer'
      // The internal runner owns the real timeout; its wording is the only
      // signal that distinguishes a slow turn from a genuine failure.
      if (/timed out/i.test(detail)) {
        throw new PluginChatError('timeout', `Plugin "${id}" did not get an answer within ${timeoutMs}ms (${detail})`)
      }
      throw new PluginChatError('failed', detail)
    }

    const text = (outcome.text ?? '').trim()
    if (!text) {
      throw new PluginChatError('failed', 'The assistant returned an empty answer')
    }
    log.info(`done ${tag} (${text.length} chars)`)
    return { text, sessionId: null }
  } catch (err) {
    if (err instanceof PluginChatError) {
      log.warn(`${tag} failed: ${err.message}`)
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    log.warn(`${tag} failed: ${message}`)
    throw new PluginChatError('failed', message)
  } finally {
    if (timer) clearTimeout(timer)
    releaseSlot(id)
  }
}

