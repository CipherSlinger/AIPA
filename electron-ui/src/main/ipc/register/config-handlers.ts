/**
 * Settings surface: stored config/prefs, MCP configuration, memory files,
 * worktrees and the basic plugin registry.
 *
 * These are the channels Settings → * and the sidebar read on open. They stay
 * in one module because they are the same contiguous registration block in the
 * original single function and share the same `safeHandle`/validation rules.
 */
import { ipcMain, app } from 'electron'
import { createLogger } from '../../utils/logger'
import { readSettings, writeSettings } from '../../sessions/session-reader'
import {
  getApiKey,
  setApiKey,
  getPref,
  setPref,
  getAllPrefs,
  resetAllPrefs,
} from '../../config/config-manager'
import { redactProviderSecrets } from '../../providers'
import type { ModelProviderConfig } from '../../providers'
import { readCLISettings, writeCLISettings } from '../../config/cli-settings-manager'
import {
  addMcpServer,
  getMcpConfigInfo,
  readMcpServers,
  removeMcpServer,
  setMcpServerEnabledRouted,
} from '../../config/mcp-config'
import {
  listMemoryFiles,
  readMemoryFile,
  writeMemoryFile,
  createMemoryFile,
  deleteMemoryFile,
} from '../../sessions/memory-manager'
import { assembleMemoryContext, readPersonalMemories } from '../../sessions/memory-context'
import { checkIsGitRepo, listWorktrees, createWorktree, removeWorktree } from '../../sessions/worktree-manager'
import { listPlugins, setPluginEnabled, uninstallPlugin, registerLocalPlugin } from '../../plugins/plugin-manager'
import { safePath, getAllowedFsRoots, validateApiKey } from '../../utils/validate'
import { refreshAttention } from '../../clawd-attention'
import { codexBridgeManager } from '../../codex/codex-bridge'
import {
  clearMcpToolCache,
  getCachedMcpTools,
  readMcpRuntimeReports,
  resetMcpRuntimeReports,
} from './mcp-runtime'
import { safeHandle } from './safe-handle'

const log = createLogger('ipc:config')

/** Replace every value in a key→secret map with a marker, keeping the keys. */
function redactKeys(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(map).map(k => [k, '***']))
}

// ----------------------------------------
// Config handlers
// ----------------------------------------
export function registerConfigHandlers(): void {
  ipcMain.handle('config:read', () => readSettings())
  ipcMain.handle('config:write', (_e, patch) => writeSettings(patch))
  ipcMain.handle('config:getEnv', () => {
    try {
      return {
        apiKey: getApiKey(),
        hasApiKey: Boolean(getApiKey()),
      }
    } catch (err) {
      log.warn('config:getEnv error:', String(err))
      return { apiKey: '', hasApiKey: false }
    }
  })
  ipcMain.handle('config:setApiKey', (_e, key) => {
    try {
      const validated = validateApiKey(key)
      setApiKey(validated)
    } catch (err) {
      log.warn('Invalid API key format rejected:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('prefs:get', (_e, key) => {
    try {
      // Same redaction as prefs:getAll — a single-key read must not become a
      // side door for the credential fields.
      if (key === 'apiKeyEncrypted' || key === 'apiKey') return ''
      if (key === 'modelProviders') {
        const providers = getPref('modelProviders')
        return Array.isArray(providers)
          ? redactProviderSecrets(providers as ModelProviderConfig[])
          : []
      }
      return getPref(key)
    } catch (err) { log.warn('prefs:get error:', String(err)); return null }
  })
  ipcMain.handle('prefs:set', (_e, key, value) => {
    try {
      setPref(key, value)
      // Switching the background pet alerts off also retracts any bubble that
      // is currently up; switching them on lets queued items surface.
      if (key === 'petAttentionAlerts') refreshAttention()
    } catch (err) { log.warn('prefs:set error:', String(err)) }
  })
  ipcMain.handle('prefs:getAll', () => {
    try {
      // Never hand the encrypted API key (or any other secret) to the renderer.
      // The renderer only needs to know whether a key exists — see config:getEnv.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { apiKeyEncrypted, apiKey, modelProviders, ...safe } = getAllPrefs()
      return {
        ...safe,
        modelProviders: Array.isArray(modelProviders)
          ? redactProviderSecrets(modelProviders as ModelProviderConfig[])
          : [],
      }
    } catch (err) { log.warn('prefs:getAll error:', String(err)); return {} }
  })
  ipcMain.handle('prefs:resetAll', () => {
    resetAllPrefs()
    return true
  })

  // Locale detection for i18n
  ipcMain.handle('config:getLocale', () => app.getLocale())

  // ── MCP ──────────────────────────────────────────────────────────────────
  // Every handler below is engine-routed (src/main/config/mcp-config.ts):
  // Codex keeps servers in ~/.codex/config.toml, Claude in ~/.claude/settings.json.
  safeHandle('mcp:configInfo', () => getMcpConfigInfo())

  safeHandle('mcp:list', () => readMcpServers().map(srv => ({
    name: srv.name,
    command: srv.command,
    args: srv.args,
    url: srv.url,
    type: srv.type,
    disabled: srv.disabled,
  })))

  /**
   * Full config, including transport details, for the Settings → MCP tab.
   *
   * `env` and `headers` are where MCP servers keep their credentials
   * (`GITHUB_TOKEN`, `Authorization: Bearer …`), so the renderer only learns
   * which keys are set — the values never cross the bridge. `mcp:list` already
   * omits them; this channel must not become the way around it.
   */
  safeHandle('mcp:readConfig', () => ({
    ...getMcpConfigInfo(),
    servers: readMcpServers().map(srv => ({
      ...srv,
      env: srv.env ? redactKeys(srv.env) : undefined,
      headers: srv.headers ? redactKeys(srv.headers) : undefined,
    })),
  }))

  /**
   * Live MCP startup/auth reports from the current app-server process, for
   * Settings → MCP when it opens after the notifications already fired. The
   * renderer intersects these with its configured list, so a report about a
   * server that is no longer configured never becomes a row.
   */
  safeHandle('mcp:runtimeStatus', () => readMcpRuntimeReports())

  // ── CLI settings.json read/write (Iteration 518) ─────
  safeHandle('config:readCLISettings', () => {
    try {
      return readCLISettings()
    } catch (err) {
      log.warn('config:readCLISettings error:', String(err))
      return { error: String(err) }
    }
  })
  safeHandle('config:writeCLISettings', (_e, patch: Record<string, unknown>) => {
    try {
      writeCLISettings(patch)
      return { success: true }
    } catch (err) {
      log.warn('config:writeCLISettings error:', String(err))
      return { error: String(err) }
    }
  })
  safeHandle('mcp:setEnabled', (_e, { serverName, enabled }: { serverName: string; enabled: boolean }) =>
    setMcpServerEnabledRouted(serverName, enabled))

  safeHandle('mcp:add', (_e, { name, config }: { name: string; type: string; config: Record<string, unknown> }) =>
    addMcpServer(name, config))

  safeHandle('mcp:remove', (_e, { name }: { name: string }) => removeMcpServer(name))

  safeHandle('mcp:getTools', async (_e, { serverName }: { serverName: string }) => {
    // Return tools from system.init cache; fall back to empty array if not yet populated
    const cachedTools = getCachedMcpTools(serverName)
    const tools = cachedTools.map((toolFullName: string) => {
      // Parse display name from mcp__serverName__toolName format
      const prefix = `mcp__${serverName}__`
      const displayName = toolFullName.startsWith(prefix)
        ? toolFullName.slice(prefix.length)
        : toolFullName
      return { name: displayName, fullName: toolFullName }
    })
    return { tools }
  })

  /**
   * Reload the MCP configuration a running Codex engine uses.
   *
   * The protocol reloads the whole MCP configuration for one app-server
   * process (`config/mcpServer/reload`, no parameters) — it has no per-server
   * restart, so this is a page-level action, not a button per row. Success is
   * only the engine accepting the request; each server's outcome arrives later
   * through `mcpServer/startupStatus/updated`.
   */
  safeHandle('mcp:reload', async () => {
    const bridge = codexBridgeManager.firstLive()
    if (!bridge) {
      // Nothing to reload: a reload reaches the engine that is running, and
      // spawning one just to reload a config would report a state no
      // conversation is using. The renderer names this refusal itself.
      return { success: false as const, code: 'no_engine' as const }
    }
    try {
      await bridge.reloadMcpServers()
      // The tool cache and the startup reports were answers about the previous
      // configuration; drop them so nothing stale survives the reload.
      clearMcpToolCache()
      resetMcpRuntimeReports()
      return { success: true as const }
    } catch (err) {
      log.warn('mcp:reload error:', String(err))
      return { success: false as const, error: String(err) }
    }
  })

  // ── Memory ──────────────────────────────────────────────────────────────
  safeHandle('memory:list', (_e, { scope }: { scope?: 'global' | 'project' | 'all' }) => {
    try {
      return listMemoryFiles(scope || 'all')
    } catch (err) {
      log.warn('memory:list error:', String(err))
      return []
    }
  })
  // Read/write/create answer with their own ok/code envelope rather than an
  // exception string: the editor has to tell "changed on disk" from "too
  // large" from "failed", and a raw IPC rejection carries none of that.
  safeHandle('memory:read', (_e, { filePath }: { filePath?: unknown }) => {
    const result = readMemoryFile(typeof filePath === 'string' ? filePath : '')
    if (!result.ok) log.warn('memory:read refused:', result.code)
    return result
  })
  safeHandle('memory:write', (_e, {
    filePath, content, expectedSha256,
  }: { filePath?: unknown; content?: unknown; expectedSha256?: unknown }) => {
    const result = writeMemoryFile(
      typeof filePath === 'string' ? filePath : '',
      content,
      typeof expectedSha256 === 'string' ? expectedSha256 : undefined,
    )
    if (!result.ok) log.warn('memory:write refused:', result.code)
    return result
  })
  safeHandle('memory:create', (_e, args: {
    name?: unknown; description?: unknown; type?: unknown; body?: unknown
    scope?: unknown; projectHash?: unknown
  }) => {
    const result = createMemoryFile(
      typeof args?.name === 'string' ? args.name : '',
      typeof args?.description === 'string' ? args.description : '',
      typeof args?.type === 'string' ? args.type : 'reference',
      typeof args?.body === 'string' ? args.body : '',
      args?.scope === 'project' ? 'project' : 'global',
      typeof args?.projectHash === 'string' ? args.projectHash : undefined,
    )
    if (!result.ok) log.warn('memory:create refused:', result.code)
    return result
  })
  safeHandle('memory:delete', (_e, { filePath }: { filePath: string }) => {
    try {
      deleteMemoryFile(filePath)
      return { success: true }
    } catch (err) {
      log.warn('memory:delete error:', String(err))
      return { success: false, error: String(err) }
    }
  })
  // The canonical five-tier assembler. The renderer's chat turn calls this
  // instead of assembling locally, so a hidden automation/plugin turn and a
  // manual send produce the same `<memory_context>` block.
  safeHandle('memory:buildContext', async (_e, { cwd, personalMemories }: {
    cwd?: string
    personalMemories?: import('../../sessions/memory-context').PersonalMemoryLike[]
  }) => {
    try {
      return await assembleMemoryContext({
        cwd: typeof cwd === 'string' ? cwd : '',
        personalMemories: Array.isArray(personalMemories) ? personalMemories : readPersonalMemories(),
      })
    } catch (err) {
      log.warn('memory:buildContext error:', String(err))
      // Complete shape: a caller must not be able to tell a failed read from
      // an older build by looking for a missing field.
      return { text: '', applied: [], omitted: [], used: {}, truncated: [], unreadable: [], sources: [] }
    }
  })

  // ── Worktree ─────────────────────────────────────────────────────────────
  // `cwd` becomes the working directory of `git worktree add/remove`, so it has
  // to be inside the roots the user has actually opened. Every handler also
  // reports failures as data: worktree-manager throws on "not a git repo" and
  // on a bad branch name, and a raw IPC rejection shows the renderer an
  // "Error invoking remote method" string instead of something to display.
  const worktreeCwd = (cwd: string): string =>
    safePath(cwd, getAllowedFsRoots(getPref('workingDir') as string | undefined))
  safeHandle('worktree:isGitRepo', (_e, { cwd }: { cwd: string }) => {
    try {
      return { isGit: checkIsGitRepo(worktreeCwd(cwd)) }
    } catch (err) {
      log.warn('worktree:isGitRepo rejected:', String(err))
      return { isGit: false }
    }
  })
  safeHandle('worktree:list', (_e, { cwd }: { cwd: string }) => {
    try {
      return listWorktrees(worktreeCwd(cwd))
    } catch (err) {
      log.warn('worktree:list error:', String(err))
      return []
    }
  })
  safeHandle('worktree:create', async (_e, { cwd, name }: { cwd: string; name: string }) => {
    try {
      return createWorktree(worktreeCwd(cwd), name)
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  safeHandle('worktree:remove', (_e, { cwd, worktreePath, force }: { cwd: string; worktreePath: string; force: boolean }) => {
    try {
      removeWorktree(worktreeCwd(cwd), worktreePath, force)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Plugin ───────────────────────────────────────────────────────────────
  safeHandle('plugin:list', () => {
    return listPlugins()
  })
  safeHandle('plugin:setEnabled', (_e, { name, enabled }: { name: string; enabled: boolean }) => {
    setPluginEnabled(name, enabled)
    return { success: true }
  })
  safeHandle('plugin:uninstall', (_e, { name }: { name: string }) => {
    uninstallPlugin(name)
    return { success: true }
  })
  safeHandle('plugin:registerLocal', (_e, { pluginPath }: { pluginPath: string }) => {
    // The path is read, persisted to ~/.claude/plugins.json and later loaded by
    // the plugin scanner, so it must stay inside the roots the user has opened
    // rather than anywhere on disk (including UNC paths).
    try {
      const safe = safePath(pluginPath, getAllowedFsRoots(getPref('workingDir') as string | undefined))
      return registerLocalPlugin(safe)
    } catch (err) {
      log.warn('plugin:registerLocal rejected:', String(err))
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('feedback:rate', (_e: Electron.IpcMainInvokeEvent, { messageId, rating }: { messageId: string; rating: 'up' | 'down' | null }) => {
    const key = `feedback.${messageId}`
    ;(setPref as any)(key, rating)
  })
}
