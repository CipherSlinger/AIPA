/**
 * Hot-pluggable left-rail/main-view plugins: listing, host capabilities,
 * plugin-owned automations and the edit drawer.
 *
 * The stopped-job markers live here because they are written by the abort
 * handlers and read by the completion callbacks in this same module; splitting
 * them would let a stopped job be reported as a failure.
 */
import { BrowserWindow, dialog, app } from 'electron'
import { createLogger } from '../../utils/logger'
import { registerAllowedRoot } from '../../utils/allowed-roots'
import {
  initNavPluginManager,
  listNavPlugins,
  reloadNavPlugins,
  openPluginFolder,
} from '../../plugins/nav-plugin-manager'
import { pluginUrl } from '../../plugins/plugin-url'
import { migrateLegacyTasks, startWorkCalendarReminders } from '../../plugins/work-calendar-reminders'
import {
  readPluginData,
  writePluginData,
  fetchGithubCommits,
  scanFolderChanges,
  startPluginAi,
  abortPluginAi,
  resolvePluginTurnTarget,
  type GithubCommitsArgs,
  type ScanFolderArgs,
} from '../../plugins/plugin-services'
import { startPluginEdit, sendPluginEdit, abortPluginEdit, endPluginEdit } from '../../plugins/plugin-edit-session'
import { askPluginChat } from '../../plugins/plugin-chat'
import {
  createPluginAutomation,
  deletePluginAutomation,
  listPluginAutomations,
} from '../../plugins/plugin-automation'
import { shouldAnnouncePluginConversation } from '../../plugins/plugin-chat-continuation'
import { recordPluginSessionOrigin } from '../../sessions/session-origins'
import { getApiKey, getPref } from '../../config/config-manager'
import { safePath, getAllowedFsRoots } from '../../utils/validate'
import { getClawdLanguage } from '../../clawd-integration'
import { raiseAttention } from '../../clawd-attention'
import {
  pluginAskTargetEngine,
  pluginChatContinuationEvidence,
  runInternalTurn,
} from './cli/internal-turns'
import { safeHandle } from './safe-handle'
import type { SendFn } from './types'

const log = createLogger('ipc:plugins')

/**
 * Plugin jobs the user stopped. Their terminal `error` event is an
 * acknowledgement, not a failure, so the pet must not call them over it.
 * Keyed by `pluginId:requestId` for one-shot AI jobs and by `pluginId` for the
 * persistent edit session.
 */
const stoppedPluginJobs = new Set<string>()

function takeStoppedPluginJob(key: string): boolean {
  return stoppedPluginJobs.delete(key)
}

/** Plugin label in the pet's language; falls back to the id when unknown. */
function pluginLabel(pluginId: string): string {
  try {
    const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
    if (!plugin) return pluginId
    return getClawdLanguage() === 'zh'
      ? (plugin.manifest.name || pluginId)
      : (plugin.manifest.nameEn || plugin.manifest.name || pluginId)
  } catch {
    return pluginId
  }
}

// ----------------------------------------
// Nav Plugin handlers (Hot-Pluggable Left-Rail & Main View Plugins)
// ----------------------------------------
/**
 * Attach the custom-scheme URL to every plugin before it reaches the renderer,
 * so the iframe src is built in one place and can never drift from the protocol
 * handler's host scheme.
 */
function withPluginUrls<T extends { manifest: { id: string }; entryPath: string }>(plugins: T[]): (T & { url: string })[] {
  return plugins.map(p => ({ ...p, url: pluginUrl(p.manifest.id, p.entryPath) }))
}

export function registerNavPluginHandlers(win: BrowserWindow, send: SendFn): void {
  const getWorkingDir = () => ((getPref as any)('workingDir') as string) || ''
  initNavPluginManager(
    getWorkingDir,
    (plugins) => {
      send('plugin:nav:updated', withPluginUrls(plugins))
    }
  )
  // Tasks panel moved into the Work Calendar plugin — carry old data over
  migrateLegacyTasks()
  startWorkCalendarReminders(win)

  safeHandle('plugin:nav:list', () => withPluginUrls(listNavPlugins()))
  safeHandle('plugin:nav:reload', () => withPluginUrls(reloadNavPlugins(getWorkingDir())))
  safeHandle('plugin:nav:openFolder', (_e, { pluginId }: { pluginId?: string } = {}) => {
    return openPluginFolder(pluginId || '')
  })

  // ── Host capabilities for plugins (gated by manifest.permissions) ──
  // PluginHostView already checks permissions; re-check here so a compromised
  // renderer path can't reach capabilities a plugin never declared.
  const requirePermission = (pluginId: string, permission: string): void => {
    const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (!plugin.manifest.permissions?.includes(permission)) {
      throw new Error(`Plugin ${pluginId} lacks "${permission}" permission`)
    }
  }

  safeHandle('plugin:data:get', (_e, { pluginId, key }: { pluginId: string; key: string }) => {
    requirePermission(pluginId, 'storage')
    return readPluginData(pluginId, key)
  })
  safeHandle('plugin:data:set', (_e, { pluginId, key, value }: { pluginId: string; key: string; value: unknown }) => {
    requirePermission(pluginId, 'storage')
    writePluginData(pluginId, key, value)
    return true
  })
  safeHandle('plugin:github:commits', (_e, { pluginId, args }: { pluginId: string; args: GithubCommitsArgs }) => {
    requirePermission(pluginId, 'network')
    return fetchGithubCommits(args)
  })
  safeHandle('plugin:fs:scanFolder', (_e, { pluginId, args }: { pluginId: string; args: ScanFolderArgs }) => {
    // `fs` permission is a manifest self-declaration; containment is enforced
    // separately so a plugin cannot enumerate the whole disk through it.
    try {
      requirePermission(pluginId, 'fs')
      const folderPath = safePath(args.folderPath, getAllowedFsRoots(getPref('workingDir') as string | undefined))
      return scanFolderChanges({ ...args, folderPath })
    } catch (err) {
      log.warn('plugin:fs:scanFolder rejected:', String(err))
      return { success: false, error: String(err) }
    }
  })
  safeHandle('plugin:fs:pickFolder', async (_e, { pluginId, title }: { pluginId: string; title?: string }) => {
    requirePermission(pluginId, 'fs')
    const result = win.isDestroyed()
      ? await dialog.showOpenDialog({ title, properties: ['openDirectory'] })
      : await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] })
    const picked = result.canceled ? null : result.filePaths[0] ?? null
    // A plugin asking for a folder is still the user answering a system dialog.
    // Without this the plugin's own `plugin:fs:scanFolder` on the folder it just
    // received would be refused by the gate — a dialog whose answer the app then
    // pretends not to have been given.
    if (picked) registerAllowedRoot(picked)
    return picked
  })
  safeHandle('plugin:ai:generate', async (_e, { pluginId, requestId, prompt, instructions, model }: {
    pluginId: string
    requestId: string
    prompt: string
    instructions?: string
    model?: string
  }) => {
    requirePermission(pluginId, 'ai')
    const scopedId = `${pluginId}:${requestId}`
    await startPluginAi(
      { requestId: scopedId, prompt, instructions, model, apiKey: getApiKey() || undefined },
      (event) => {
        send('plugin:ai:event', { ...event, pluginId, requestId })
        // Terminal events are what the user is waiting for; report them to
        // the pet when nobody is watching the plugin view.
        if (event.type === 'done') {
          stoppedPluginJobs.delete(scopedId)
          raiseAttention({ kind: 'plugin-done', pluginId, detail: pluginLabel(pluginId) })
        } else if (event.type === 'error' && !takeStoppedPluginJob(scopedId)) {
          raiseAttention({ kind: 'failed', pluginId, detail: pluginLabel(pluginId) })
        }
      }
    )
    return { started: true }
  })
  safeHandle('plugin:ai:abort', (_e, { pluginId, requestId }: { pluginId: string; requestId: string }) => {
    // The terminal error this produces is a user cancellation, not a failure.
    stoppedPluginJobs.add(`${pluginId}:${requestId}`)
    abortPluginAi(`${pluginId}:${requestId}`)
  })

  // `chat.ask` — a plugin asks the assistant a question and gets the answer
  // back. `runInternalTurn` always gives it an `internal-` bridge, a read-only
  // permission mode and a private event sink, so nothing reaches the renderer.
  // A private turn is also ephemeral. A visible turn persists the thread and
  // reports the openable id; the event below tells the renderer to refresh the
  // archive and name the plugin that started the conversation. With a
  // `sessionId`, the same visible turn continues an earlier conversation this
  // plugin started, after the origin ledger check inside `askPluginChat`. The
  // permission itself is checked there too, and every refusal carries a code
  // the plugin can branch on.
  safeHandle('plugin:chat:ask', async (_e, { pluginId, args }: {
    pluginId: string
    args?: import('../../plugins/plugin-chat').PluginChatAskArgs
  }) => {
    // Route like chat / ai.generate: a gateway or compatible provider serves
    // the turn on its own credentials; otherwise the default engine does.
    const target = resolvePluginTurnTarget()
    const requestedSessionId = typeof args?.sessionId === 'string' ? args.sessionId.trim() : ''
    const answer = await askPluginChat(pluginId, args, (turn) => runInternalTurn({
      prompt: turn.prompt,
      cwd: turn.cwd,
      timeoutMs: turn.timeoutMs,
      internalTag: turn.tag,
      answerOnly: true,
      visible: turn.visible,
      ...(turn.sessionId ? { resumeSessionId: turn.sessionId } : {}),
      ...(target ? { model: target.model, env: target.env } : {}),
    }), {
      targetEngine: pluginAskTargetEngine(target?.env),
      evidence: pluginChatContinuationEvidence,
    })
    // askPluginChat only returns a sessionId for a visible turn whose id the
    // archive can open, so the renderer is never told about a phantom session.
    if (args?.visible === true && answer.sessionId) {
      // Record before announcing: the renderer refreshes the archive on the
      // event below, and a row arriving before its origin would read as
      // user-started until the next refresh. A continuation refreshes its
      // existing record so the ledger's cap cannot evict a conversation that
      // is still in use. Recording is best-effort; it must never fail the ask.
      recordPluginSessionOrigin(app.getPath('userData'), {
        sessionId: answer.sessionId,
        pluginId,
        pluginLabel: pluginLabel(pluginId),
      })
      // A continuation already has an archive row; announcing it again would
      // read as a second conversation.
      if (shouldAnnouncePluginConversation(true, requestedSessionId || null, answer.sessionId)) {
        send('plugin:conversation-created', {
          pluginId,
          pluginLabel: pluginLabel(pluginId),
          sessionId: answer.sessionId,
        })
      }
    }
    return answer
  })

  // `schedule` — a plugin creates, lists and deletes its own automations.
  //
  // The manifest gate lives in `plugin-automation.ts` rather than here, for the
  // same reason `chat.ask`'s does: the capability module re-checks it on every
  // call, so one check cannot drift from the other and a rejected invoke still
  // carries a `[code]` the plugin can branch on (the local `requirePermission`
  // throws plain prose, which the other capabilities use for their
  // `{ success, error }` shape). Ownership is stamped by the scheduler through
  // the `…ForPlugin` entry points and never read from this payload, so nothing
  // a renderer sends can choose whose job it becomes.
  safeHandle('plugin:automation:create', (_e, { pluginId, input }: {
    pluginId: string
    input?: import('../../plugins/plugin-automation').PluginAutomationInput
  }) => createPluginAutomation(pluginId, input))
  safeHandle('plugin:automation:list', (_e, { pluginId }: { pluginId: string }) =>
    listPluginAutomations(pluginId))
  safeHandle('plugin:automation:delete', (_e, { pluginId, id }: { pluginId: string; id: string }) =>
    deletePluginAutomation(pluginId, id))

  // ── Edit drawer: a chat whose cwd IS the plugin folder, so the AI rewrites
  // the plugin's own files. Not permission-gated — this is the *host* editing
  // the plugin at the user's request, the same trust level as the source view.
  const editDir = (pluginId: string): string => {
    const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    // Resolve from our own scan, never from a renderer-supplied path.
    return plugin.dirPath
  }

  safeHandle('plugin:edit:start', async (_e, { pluginId, prompt, model }: {
    pluginId: string
    prompt: string
    model?: string
  }) => {
    // A new turn clears an earlier "stopped" marker so a genuine failure is
    // still reported.
    stoppedPluginJobs.delete(pluginId)
    await startPluginEdit(
      { pluginId, dirPath: editDir(pluginId), prompt, model, apiKey: getApiKey() || undefined },
      (event) => {
        send('plugin:edit:event', event)
        // Same completion path as the one-shot AI jobs: a background edit turn
        // that ends while the app is in the background is a plugin job done.
        if (event.type === 'done') {
          stoppedPluginJobs.delete(pluginId)
          raiseAttention({ kind: 'plugin-done', pluginId, detail: pluginLabel(pluginId) })
        } else if (event.type === 'error' && !takeStoppedPluginJob(pluginId)) {
          raiseAttention({ kind: 'failed', pluginId, detail: pluginLabel(pluginId) })
        }
      }
    )
    return { started: true }
  })
  safeHandle('plugin:edit:send', async (_e, { pluginId, prompt }: { pluginId: string; prompt: string }) => {
    stoppedPluginJobs.delete(pluginId)
    await sendPluginEdit(pluginId, prompt)
    return { sent: true }
  })
  safeHandle('plugin:edit:abort', (_e, { pluginId }: { pluginId: string }) => {
    stoppedPluginJobs.add(pluginId)
    abortPluginEdit(pluginId)
  })
  safeHandle('plugin:edit:close', (_e, { pluginId }: { pluginId: string }) => {
    stoppedPluginJobs.add(pluginId)
    endPluginEdit(pluginId)
  })
}
