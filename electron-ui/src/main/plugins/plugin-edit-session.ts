/**
 * Plugin edit sessions — the AI drawer behind PluginHostView's 「编辑」 button.
 *
 * A plugin is a plain folder of HTML/CSS/JS on disk, so "chat with the AI to
 * change the plugin" needs no new editing machinery: it is an ordinary
 * multi-turn chat whose working directory IS the plugin folder, and the agent
 * simply reads and rewrites the plugin's own files as the conversation goes.
 *
 * One CodexBridge per plugin, kept alive between turns so follow-ups stay in
 * context. The thread is ephemeral (it never lands in session history) and runs
 * with approvalPolicy 'never': the drawer streams every tool call as it happens
 * and the user can interrupt at any moment, so there is nothing left to prompt
 * for.
 */
import * as path from 'path'
import { CodexBridge, CodexAuthError } from '../codex/codex-bridge'
import { createLogger } from '../utils/logger'

const log = createLogger('plugin-edit')

/** What one edit turn can report back. */
type TurnEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; detail: string }
  | { type: 'status'; message: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }

export type PluginEditEvent = TurnEvent & { pluginId: string }

export interface PluginEditStartArgs {
  pluginId: string
  dirPath: string
  prompt: string
  model?: string
  apiKey?: string
}

/** One turn can churn through several files; ten minutes is the "still alive?" line. */
const EDIT_TIMEOUT_MS = 10 * 60 * 1000

const AI_TIMEOUT_MESSAGE = 'AI 编辑超时（10 分钟），本轮已中断，可以再发一条消息继续'
const AI_FAILED_MESSAGE = 'AI 编辑失败'
const AI_CANCELLED_MESSAGE = '已停止本轮编辑'
const AUTH_MESSAGE =
  'Codex 尚未登录，也未配置 OpenAI API Key。请在 AIPA 设置中填写 API Key，或执行 codex login 后重试'

/**
 * Standing brief for every edit session: what a plugin is, where it may write,
 * and how to report back. Kept short — the files themselves say the rest.
 */
const EDIT_INSTRUCTIONS = [
  '你正在直接修改一个 AIPA 插件的源码，你的工作目录就是该插件文件夹。',
  '插件是免编译的纯前端文件夹：plugin.json 是清单（id / name / nameEn / version / icon / main / permissions），',
  'main 指向的 HTML 是入口，其余 JS/CSS 由入口自行引入；不需要构建步骤。',
  '插件运行在沙箱 iframe 中，只能通过 postMessage 与宿主通信，可直接使用宿主 CSS 变量（如 var(--bg-primary)）。',
  '动手前先读相关文件，改动尽量小、就近修改，不要重写整个插件；不要改 plugin.json 的 id；',
  '不要写入插件文件夹以外的任何路径。',
  '每轮结束后用一两句话说明改了哪些文件、改了什么，使用用户所用的语言回答。',
].join('')

interface EditSession {
  pluginId: string
  bridge: CodexBridge
  emit: (e: PluginEditEvent) => void
  /** Deltas of the turn in flight (Codex streams these without an itemId). */
  streaming: string
  /** Latest completed agent message of the turn in flight. */
  completed: string
  busy: boolean
  /** Set when the drawer closes, so the dying bridge stops reporting errors. */
  closed: boolean
  timer: NodeJS.Timeout | null
}

/** Live edit session per plugin id — the value owns that plugin's bridge. */
const sessions = new Map<string, EditSession>()

/** Keep the tool chip readable: a filename or a truncated command. */
function describeTool(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return name
  const file = input.path ?? input.file_path ?? input.filePath ?? input.filename
  if (typeof file === 'string' && file) return path.basename(file)
  const cmd = input.command ?? input.cmd
  if (typeof cmd === 'string' && cmd) return cmd.length > 90 ? `${cmd.slice(0, 90)}…` : cmd
  return name
}

function beginTurn(session: EditSession): void {
  session.streaming = ''
  session.completed = ''
  session.busy = true
  session.timer = setTimeout(() => {
    session.bridge.interruptTurn().catch(() => session.bridge.abort())
    finishTurn(session, { type: 'error', message: AI_TIMEOUT_MESSAGE })
  }, EDIT_TIMEOUT_MS)
}

/** Emit the turn's terminal event — the first one wins, later ones are dropped. */
function finishTurn(session: EditSession, event: TurnEvent): void {
  if (!session.busy) return
  session.busy = false
  if (session.timer) {
    clearTimeout(session.timer)
    session.timer = null
  }
  session.emit({ pluginId: session.pluginId, ...event })
}

function attachHandlers(session: EditSession): void {
  const { bridge, pluginId } = session

  bridge.on('textDelta', (d: { text?: string; itemId?: string }) => {
    if (!d?.text) return
    // A completed agent message re-sends its full text with an itemId; the
    // unprefixed deltas are the live stream.
    if (d.itemId) {
      session.completed = d.text
      session.streaming = ''
    } else {
      session.streaming += d.text
    }
    if (!session.busy) return
    session.emit({ pluginId, type: 'delta', text: session.streaming || session.completed })
  })

  bridge.on('toolUse', (d: { event?: { name?: string; input?: Record<string, unknown> } }) => {
    if (!session.busy) return
    const name = d?.event?.name || 'tool'
    session.emit({ pluginId, type: 'tool', name, detail: describeTool(name, d?.event?.input) })
  })

  bridge.on('turnError', (d: { message: string; details?: string; willRetry: boolean }) => {
    // A retry is a hiccup, not the end of the turn — show it and keep waiting.
    if (d.willRetry) {
      session.emit({ pluginId, type: 'status', message: d.message })
      return
    }
    finishTurn(session, {
      type: 'error',
      message: d.details ? `${d.message}（${d.details}）` : d.message,
    })
  })

  bridge.on('result', (d: { status?: string; event?: { turn?: { error?: { message?: string } } } }) => {
    // Unlike the one-shot generator, an empty reply is fine here — a turn that
    // only edited files still shows its tool chips.
    const text = (session.completed || session.streaming).trim()
    if (d.status === 'failed') {
      finishTurn(session, { type: 'error', message: d.event?.turn?.error?.message || AI_FAILED_MESSAGE })
    } else if (d.status === 'interrupted') {
      finishTurn(session, { type: 'error', message: AI_CANCELLED_MESSAGE })
    } else {
      finishTurn(session, { type: 'done', text })
    }
  })

  bridge.on('processExit', (d: { code?: number | null }) => {
    // The bridge is gone; drop it so the next message can start a fresh one.
    if (sessions.get(pluginId) === session) sessions.delete(pluginId)
    if (session.closed) return
    finishTurn(session, { type: 'error', message: `Codex 进程已退出（code ${d?.code ?? 'null'}）` })
  })

  bridge.on('stderr', (text: string) => log.debug('stderr:', text.trim().slice(0, 300)))
}

/** First message: opens the session (or continues it, if the drawer reopened it). */
export async function startPluginEdit(
  args: PluginEditStartArgs,
  emit: (e: PluginEditEvent) => void
): Promise<void> {
  if (sessions.has(args.pluginId)) return sendPluginEdit(args.pluginId, args.prompt)

  const session: EditSession = {
    pluginId: args.pluginId,
    bridge: new CodexBridge(`plugin-edit-${args.pluginId}`),
    emit,
    streaming: '',
    completed: '',
    busy: false,
    closed: false,
    timer: null,
  }
  sessions.set(args.pluginId, session)
  attachHandlers(session)
  beginTurn(session)

  const env: Record<string, string> = {}
  if (args.apiKey) env.OPENAI_API_KEY = args.apiKey

  try {
    await session.bridge.sendMessage({
      prompt: args.prompt,
      cwd: args.dirPath,
      model: args.model || undefined,
      env,
      approvalPolicy: 'never',
      personality: 'pragmatic',
      ephemeral: true,
      requireAuth: true,
      developerInstructions: EDIT_INSTRUCTIONS,
    })
  } catch (err) {
    sessions.delete(args.pluginId)
    session.bridge.abort()
    finishTurn(session, {
      type: 'error',
      message: err instanceof CodexAuthError
        ? AUTH_MESSAGE
        : `启动 Codex 失败：${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

export async function sendPluginEdit(pluginId: string, prompt: string): Promise<void> {
  const session = sessions.get(pluginId)
  if (!session) throw new Error('AI 编辑会话已结束，请重新打开编辑抽屉')
  if (session.busy) throw new Error('AI 正在处理上一条消息，请稍候或先点停止')

  beginTurn(session)
  try {
    await session.bridge.sendFollowUp(prompt)
  } catch (err) {
    finishTurn(session, {
      type: 'error',
      message: `发送失败：${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

export function abortPluginEdit(pluginId: string): void {
  const session = sessions.get(pluginId)
  // Nothing in flight — leave the live session alone (interrupting a finished
  // turn would just kill the bridge).
  if (!session?.busy) return
  // Report the stop ourselves so the drawer unsticks even if the bridge never
  // reports the interrupted turn.
  finishTurn(session, { type: 'error', message: AI_CANCELLED_MESSAGE })
  session.bridge.interruptTurn().catch(() => session.bridge.abort())
}

/** Drawer closed — tear the session down (an in-flight turn is cancelled). */
export function endPluginEdit(pluginId: string): void {
  const session = sessions.get(pluginId)
  if (!session) return
  sessions.delete(pluginId)
  session.closed = true
  finishTurn(session, { type: 'error', message: AI_CANCELLED_MESSAGE })
  try { session.bridge.endSession() } catch { /* stdin may already be closed */ }
  session.bridge.abort()
}

export function endAllPluginEdits(): void {
  for (const pluginId of [...sessions.keys()]) endPluginEdit(pluginId)
}
