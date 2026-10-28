/**
 * Host capability `chat.ask` — a plugin asks the assistant a question and gets
 * the answer back instead of only drawing UI.
 *
 * Two shapes, both on the same hidden machinery as the app's own background
 * work (`cli:runInternal`):
 *
 *  - Private (default): a fresh `internal-` bridge, permission mode `plan`
 *    (read-only sandbox for Codex, plan mode on the Claude CLI), an ephemeral
 *    thread and a private sink. Nothing reaches the renderer, no `cli:*` event
 *    is published, and the turn leaves no archive entry.
 *
 *  - Visible (`visible: true`): the same `internal-` tag and private sink keep
 *    the turn out of whatever conversation the user has open, but the rollout /
 *    JSONL persists, so the answer also becomes a conversation the user can
 *    open from the archive. The runner returns the openable session id — the
 *    Codex thread id or the Claude JSONL id, never the internal bridge id — and
 *    the IPC layer announces it to the renderer.
 *
 * Visibility changes persistence, not trust. Every plugin turn keeps
 * `permissionMode: 'plan'` and sinks that deny every approval request: a plugin
 * must not silently write the user's files or run tools just because the user
 * may read the transcript later.
 *
 * A visible turn that produces text but no openable id breaks the visibility
 * contract. It is reported as `failed` rather than as a success with a
 * fabricated or bridge id: telling the plugin a conversation exists when the
 * archive cannot open it is worse than telling it the visible turn did not
 * happen.
 *
 * A visible ask may also pass back the `sessionId` it was given and continue
 * that conversation. The continuation rule lives in
 * `plugin-chat-continuation.ts`; this file owns the request-level checks and
 * the rails. A continuation is verified against the plugin-origin ledger
 * before any slot is claimed, so an id the plugin does not own is refused
 * without creating a session or spending a model call.
 */
import { listNavPlugins } from './nav-plugin-manager'
import { pluginAiCwd } from './plugin-services'
import {
  decidePluginChatContinuation,
  type PluginChatContinuationEvidence,
  type PluginChatContinuationRefusalCode,
} from './plugin-chat-continuation'
import { assembleMemoryContext, prefixWithMemoryContext, readPersonalMemories } from '../sessions/memory-context'
import { createLogger } from '../utils/logger'

const log = createLogger('plugin-chat')

/** Permission a manifest must declare to reach this capability. */
export const PLUGIN_CHAT_PERMISSION = 'chat'

export type PluginChatErrorCode =
  | 'plugin_unknown'
  | 'permission_denied'
  | 'invalid_request'
  | PluginChatContinuationRefusalCode
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
  /** Ask for a persisted conversation the user can open later. */
  visible?: boolean
  /**
   * Continue a conversation this plugin started with an earlier visible ask.
   * Pass the id that ask returned. A continuation is always persisted (it
   * continues a conversation that already is) and returns the same id, so
   * `visible: true` is required; a private ask with a session id is refused
   * with `session_requires_visible`.
   */
  sessionId?: string
  /**
   * Human-readable attribution only (logs). There is no session-title channel
   * on this capability, so it is never used as the archived conversation's title.
   */
  title?: string
  /** Ask budget in ms; clamped to [MIN_TIMEOUT_MS, MAX_TIMEOUT_MS]. */
  timeoutMs?: number
}

export interface PluginChatAnswer {
  text: string
  /** Openable session id for a visible turn; null for a private turn. */
  sessionId: string | null
}

/** One answer-only turn, injected by the IPC layer. */
export interface PluginChatTurn {
  prompt: string
  cwd: string
  timeoutMs: number
  /** Sanitised label embedded in the internal bridge id for attribution. */
  tag: string
  /** Persist the rollout / JSONL so the archive can open the conversation. */
  visible: boolean
  /** Existing conversation to continue; absent starts a new thread. */
  sessionId?: string
}

/**
 * How the host verifies a continuation before any model work starts. The IPC
 * layer supplies evidence from the origin ledger and the archive; the rule
 * itself stays pure.
 */
export interface PluginChatContinuationContext {
  /** Engine that will serve this ask; null when none can authenticate. */
  targetEngine: 'codex' | 'claude' | null
  /** Ownership and openability of an id, read only for a continuation. */
  evidence: (sessionId: string) => PluginChatContinuationEvidence
}

export type PluginChatRunner = (turn: PluginChatTurn) => Promise<{
  success: boolean
  text?: string
  error?: string
  /**
   * The id the archive can open. Required for a successful visible turn; the
   * runner returns null when the engine reported none.
   */
  sessionId?: string | null
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
/** A log line, not a title: long enough to identify the turn, short enough to read. */
const MAX_TITLE_CHARS = 80

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

/**
 * A continuation id is opaque to this layer; it is only passed to the evidence
 * reader and back to the engine. Reject a non-string or empty value instead of
 * treating it as "start a new thread", because a plugin that sent an id asked
 * to continue something.
 */
function readSessionId(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new PluginChatError('invalid_request', 'sessionId must be a string when provided')
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new PluginChatError('invalid_request', 'sessionId must be a non-empty string when provided')
  }
  return trimmed
}

/**
 * Attribution/logging text only. Strip control characters and collapse
 * whitespace so a plugin-supplied title cannot forge extra log lines; it never
 * reaches a filesystem path or the archived conversation.
 */
function sanitizeTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_CHARS)
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
  continuation: PluginChatContinuationContext,
): Promise<PluginChatAnswer> {
  const id = assertChatPermission(pluginId)

  const prompt = typeof args?.prompt === 'string' ? args.prompt : ''
  if (!prompt.trim()) {
    throw new PluginChatError('invalid_request', 'prompt must be a non-empty string')
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new PluginChatError('invalid_request', `prompt exceeds ${MAX_PROMPT_CHARS} characters`)
  }

  const visible = args?.visible === true
  const title = sanitizeTitle(args?.title)
  const timeoutMs = clampTimeout(args?.timeoutMs)
  const requestedSessionId = readSessionId(args?.sessionId)

  // Verify before claiming a slot or spawning anything: every refusal here is
  // free of side effects and model spend. The evidence reader is skipped for a
  // private request, whose contradiction the pure rule settles on its own.
  if (requestedSessionId) {
    let evidence: PluginChatContinuationEvidence | undefined
    if (visible) {
      try {
        evidence = continuation.evidence(requestedSessionId)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        log.warn(`continuation check failed for ${id}: ${detail}`)
        throw new PluginChatError('failed', 'Could not verify the conversation to continue')
      }
    }
    const decision = decidePluginChatContinuation({
      pluginId: id,
      sessionId: requestedSessionId,
      visible,
      targetEngine: continuation.targetEngine,
      ...(evidence ? { evidence } : {}),
    })
    if (!decision.ok) {
      // Code and plugin id only: never the prompt, the answer, or a transcript.
      log.warn(`continuation refused for ${id}: ${decision.code}`)
      throw new PluginChatError(decision.code, decision.reason)
    }
  }

  claimSlot(id)
  const tag = tagFor(id)

  // The title is diagnostic only: `title` never becomes a session title.
  log.info(
    `ask ${tag}${visible ? ' (visible)' : ''}`
    + `${requestedSessionId ? ` (continuing ${requestedSessionId})` : ''}`
    + `${title ? ` "${title}"` : ''} (${timeoutMs}ms)`,
  )

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
      runTurn({
        prompt: memoryPrompt,
        cwd,
        timeoutMs,
        tag,
        visible,
        ...(requestedSessionId ? { sessionId: requestedSessionId } : {}),
      }),
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
    if (requestedSessionId) {
      // The resumed conversation keeps its id. Returning the engine's own id
      // (or dropping it) would split one archive conversation into two handles.
      log.info(`done ${tag} (${text.length} chars, continued session ${requestedSessionId})`)
      return { text, sessionId: requestedSessionId }
    }
    if (visible) {
      const sessionId = typeof outcome.sessionId === 'string' && outcome.sessionId ? outcome.sessionId : null
      if (!sessionId) {
        // The engine answered but reported no persisted id. Do not hand back the
        // internal bridge id: the archive cannot open it, so a success here
        // would promise a conversation that does not exist.
        throw new PluginChatError(
          'failed',
          `Plugin "${id}" asked for a visible conversation, but the engine reported no openable session; the answer is not in the archive`,
        )
      }
      log.info(`done ${tag} (${text.length} chars, session ${sessionId})`)
      return { text, sessionId }
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

