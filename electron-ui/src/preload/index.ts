import { contextBridge, ipcRenderer } from 'electron'

type Unsubscribe = () => void

export interface SystemInitData {
  sessionId: string
  tools: string[]
  mcpServers: Array<{ name: string; status: string; tools?: string[] }>
  model: string
  permissionMode: string
  cwd: string
  skills: string[]
  plugins: string[]
}

const electronAPI = {
  // ── IPC readiness check ────────────────────
  ipcPing: () => ipcRenderer.invoke('ipc:ping') as Promise<{ ok: boolean; timestamp: number }>,

  // ── PTY ──────────────────────────────────
  ptyCreate: (args: unknown) => ipcRenderer.invoke('pty:create', args),
  ptyWrite: (args: unknown) => ipcRenderer.invoke('pty:write', args),
  ptyResize: (args: unknown) => ipcRenderer.invoke('pty:resize', args),
  ptyDestroy: (sessionId: string) => ipcRenderer.invoke('pty:destroy', sessionId),

  // ── CLI stream-json ───────────────────────
  cliSendMessage: (args: unknown) => ipcRenderer.invoke('cli:sendMessage', args),
  cliAbort: (sessionId: string) => ipcRenderer.invoke('cli:abort', sessionId),
  cliRespondPermission: (args: { sessionId: string; requestId: string; allowed: boolean }) =>
    ipcRenderer.invoke('cli:respondPermission', args),
  cliEndSession: (sessionId: string) =>
    ipcRenderer.invoke('cli:endSession', sessionId),
  cliGenerateSuggestion: (context: string) =>
    ipcRenderer.invoke('cli:generateSuggestion', { context }) as Promise<string>,
  cliGenerateAwaySummary: (context: string) =>
    ipcRenderer.invoke('cli:generateAwaySummary', { context }) as Promise<string>,
  cliRespondHookCallback: (args: { sessionId: string; requestId: string; response: Record<string, unknown> }) =>
    ipcRenderer.invoke('cli:respondHookCallback', args),
  cliRespondElicitation: (args: { sessionId: string; requestId: string; result: Record<string, unknown> }) =>
    ipcRenderer.invoke('cli:respondElicitation', args),
  cliRespondPlanApproval: (args: { sessionId: string; requestId: string; approved: boolean; feedback?: string }) =>
    ipcRenderer.invoke('cli:respondPlanApproval', args),
  cliCancelRequest: (args: { sessionId: string; requestId: string }) =>
    ipcRenderer.invoke('cli:cancelRequest', args),
  cliUpdateEnv: (args: { sessionId: string; vars: Record<string, string> }) =>
    ipcRenderer.invoke('cli:updateEnv', args),

  // ── Speculation ───────────────────────────
  speculationIsSafe: (prompt: string) =>
    ipcRenderer.invoke('speculation:isSafe', { prompt }) as Promise<boolean>,
  speculationRun: (args: { id: string; prompt: string; cwd: string; model: string; env: Record<string, string> }) =>
    ipcRenderer.invoke('speculation:run', args),
  speculationAccept: (id: string, cwd: string) =>
    ipcRenderer.invoke('speculation:accept', { id, cwd }) as Promise<{ merged: string[] }>,
  speculationReject: (id: string) =>
    ipcRenderer.invoke('speculation:reject', { id }),
  speculationAbort: (id: string) =>
    ipcRenderer.invoke('speculation:abort', { id }),

  // ── Sessions ─────────────────────────────
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionLoad: (id: string) => ipcRenderer.invoke('session:load', id),
  sessionDelete: (id: string) => ipcRenderer.invoke('session:delete', id),
  sessionFork: (sessionId: string, upToMessageIndex: number) => ipcRenderer.invoke('session:fork', { sessionId, upToMessageIndex }),
  sessionRename: (sessionId: string, title: string) => ipcRenderer.invoke('session:rename', { sessionId, title }),
  sessionGenerateTitle: (description: string) => ipcRenderer.invoke('session:generateTitle', { description }),
  sessionRewind: (sessionId: string, beforeTimestamp: string) => ipcRenderer.invoke('session:rewind', { sessionId, beforeTimestamp }),
  sessionSearch: (query: string, limit?: number) => ipcRenderer.invoke('session:search', { query, limit }),
  sessionDetectInterruption: (sessionId: string) => ipcRenderer.invoke('session:detectInterruption', { sessionId }),
  sessionGetStats: () => ipcRenderer.invoke('session:getStats'),
  /** Returns mtime (ms) of .consolidate-lock — used to detect dream completions */
  sessionGetDreamMtime: () => ipcRenderer.invoke('session:getDreamMtime') as Promise<number>,

  // ── Config / prefs ───────────────────────
  configRead: () => ipcRenderer.invoke('config:read'),
  configWrite: (patch: unknown) => ipcRenderer.invoke('config:write', patch),
  configGetEnv: () => ipcRenderer.invoke('config:getEnv'),
  configGetLocale: () => ipcRenderer.invoke('config:getLocale'),
  configSetApiKey: (key: string) => ipcRenderer.invoke('config:setApiKey', key),
  prefsGet: (key: string) => ipcRenderer.invoke('prefs:get', key),
  prefsSet: (key: string, value: unknown) => ipcRenderer.invoke('prefs:set', key, value),
  prefsGetAll: () => ipcRenderer.invoke('prefs:getAll'),
  prefsResetAll: () => ipcRenderer.invoke('prefs:resetAll'),

  // ── CLI settings.json (Iteration 518) ──────
  configReadCLISettings: () =>
    ipcRenderer.invoke('config:readCLISettings') as Promise<Record<string, unknown>>,
  configWriteCLISettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('config:writeCLISettings', patch) as Promise<{ success?: boolean; error?: string }>,

  // ── File system ──────────────────────────
  fsListDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  fsShowOpenDialog: () => ipcRenderer.invoke('fs:showOpenDialog'),
  fsShowOpenFileDialog: (filters?: { name: string; extensions: string[] }[], multiSelections?: boolean) =>
    ipcRenderer.invoke('fs:showOpenFileDialog', { filters, multiSelections }),
  fsShowSaveDialog: (defaultName: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('fs:showSaveDialog', { defaultName, filters }),
  fsWriteFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  fsReadFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),
  fsGetHome: () => ipcRenderer.invoke('fs:getHome'),
  fsEnsureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  fsListCommands: (workingDir: string) => ipcRenderer.invoke('fs:listCommands', workingDir),
  fsPathExists: (filePath: string) =>
    ipcRenderer.invoke('fs:pathExists', { filePath }) as Promise<boolean>,
  fsGitDiff: (filePath?: string) =>
    ipcRenderer.invoke('fs:gitDiff', { filePath }) as Promise<string | { error: string }>,
  fsGitStatus: () =>
    ipcRenderer.invoke('fs:gitStatus') as Promise<string | { error: string }>,

  // ── Shell ───────────────────────────────
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  shellShowItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('shell:showItemInFolder', filePath) as Promise<{ success: boolean; error?: string }>,

  // ── Push event listeners ─────────────────
  onPtyData: (sessionId: string, cb: (data: string) => void): Unsubscribe => {
    const handler = (_: unknown, sid: string, data: string) => { if (sid === sessionId) cb(data) }
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },

  onPtyExit: (sessionId: string, cb: (info: { exitCode: number; signal: string }) => void): Unsubscribe => {
    const handler = (_: unknown, sid: string, info: { exitCode: number; signal: string }) => {
      if (sid === sessionId) cb(info)
    }
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },

  onCliEvent: (
    sessionId: string,
    cb: (event: string, data: unknown) => void
  ): Unsubscribe => {
    const channels = [
      'cli:assistantText', 'cli:thinkingDelta', 'cli:toolUse',
      'cli:toolResult', 'cli:messageEnd', 'cli:result',
      'cli:error', 'cli:processExit',
      'cli:permissionRequest',
      'cli:hookEvent',
      'cli:hookCallback',
      'cli:elicitation',
      'cli:worktreeState',
      'cli:taskCompleted',
    ]
    const handlers = channels.map((ch) => {
      const h = (_: unknown, d: Record<string, unknown>) => {
        if (!sessionId || d?.sessionId === sessionId) cb(ch, d)
      }
      ipcRenderer.on(ch, h)
      return { ch, h }
    })
    return () => handlers.forEach(({ ch, h }) => ipcRenderer.removeListener(ch, h))
  },

  onSystemInit: (cb: (data: SystemInitData) => void): Unsubscribe => {
    const handler = (_: unknown, data: SystemInitData) => cb(data)
    ipcRenderer.on('cli:systemInit', handler)
    return () => ipcRenderer.removeListener('cli:systemInit', handler)
  },

  onNotification: (cb: (data: { message: string; title?: string; sessionId?: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { message: string; title?: string; sessionId?: string }) => cb(data)
    ipcRenderer.on('cli:notification', handler)
    return () => ipcRenderer.removeListener('cli:notification', handler)
  },

  onHookEvent: (cb: (data: { eventType?: string; [key: string]: unknown }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { eventType?: string; [key: string]: unknown }) => cb(data)
    ipcRenderer.on('cli:hookEvent', handler)
    return () => ipcRenderer.removeListener('cli:hookEvent', handler)
  },

  onPlanApprovalRequest: (cb: (data: { sessionId: string; requestId: string; from: string; planContent: string; planFilePath: string; timestamp: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { sessionId: string; requestId: string; from: string; planContent: string; planFilePath: string; timestamp: string }) => cb(data)
    ipcRenderer.on('cli:planApprovalRequest', handler)
    return () => ipcRenderer.removeListener('cli:planApprovalRequest', handler)
  },

  onApiError: (cb: (data: { sessionId: string; errorType: 'overloaded' | 'authentication'; message: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { sessionId: string; errorType: 'overloaded' | 'authentication'; message: string }) => cb(data)
    ipcRenderer.on('cli:apiError', handler)
    return () => ipcRenderer.removeListener('cli:apiError', handler)
  },

  onCustomTitle: (cb: (data: { sessionId: string; title: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { sessionId: string; title: string }) => cb(data)
    ipcRenderer.on('cli:customTitle', handler)
    return () => ipcRenderer.removeListener('cli:customTitle', handler)
  },

  // ── Menu events ──────────────────────────
  onMenuEvent: (event: string, cb: (...args: unknown[]) => void): Unsubscribe => {
    const h = (_: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(`menu:${event}`, h)
    return () => ipcRenderer.removeListener(`menu:${event}`, h)
  },

  // ── MCP ──────────────────────────────────
  mcpList: () => ipcRenderer.invoke('mcp:list'),
  mcpSetEnabled: (serverName: string, enabled: boolean) => ipcRenderer.invoke('mcp:setEnabled', { serverName, enabled }),
  mcpAdd: (name: string, type: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:add', { name, type, config }) as Promise<{ success: boolean; error?: string }>,
  mcpRemove: (name: string) =>
    ipcRenderer.invoke('mcp:remove', { name }) as Promise<{ success: boolean; error?: string }>,
  mcpGetTools: (serverName: string) =>
    ipcRenderer.invoke('mcp:getTools', { serverName }) as Promise<{ tools: { name: string; description?: string }[] }>,
  mcpReconnect: (serverName: string) =>
    ipcRenderer.invoke('mcp:reconnect', { serverName }) as Promise<{ success: boolean; error?: string }>,

  // ── Feedback ─────────────────────────────
  feedbackRate: (messageId: string, rating: 'up' | 'down' | null) =>
    ipcRenderer.invoke('feedback:rate', { messageId, rating }),

  // ── URL metadata (Iteration 462) ──────
  urlFetchMeta: (url: string) => ipcRenderer.invoke('url:fetchMeta', url) as Promise<{
    title: string; description: string; favicon: string; domain: string
  } | null>,

  // ── Skills ─────────────────────────────
  skillsList: (workingDir?: string) => ipcRenderer.invoke('skills:list', workingDir),
  skillsRead: (dirPath: string) => ipcRenderer.invoke('skills:read', dirPath),
  skillsInstall: (args: { name: string; content: string }) => ipcRenderer.invoke('skills:install', args),
  skillsDelete: (dirPath: string) => ipcRenderer.invoke('skills:delete', dirPath),

  // ── Window ──────────────────────────────
  windowSetTitleBarOverlay: (opts: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('window:setTitleBarOverlay', opts),
  windowFlashFrame: (flash: boolean) =>
    ipcRenderer.invoke('window:flashFrame', flash),
  windowShowNotification: (opts: { title: string; body: string }) =>
    ipcRenderer.invoke('window:showNotification', opts),
  windowToggleMaximize: () =>
    ipcRenderer.invoke('window:toggleMaximize'),
  windowSetAlwaysOnTop: (onTop: boolean) =>
    ipcRenderer.invoke('window:setAlwaysOnTop', onTop),
  windowIsAlwaysOnTop: () =>
    ipcRenderer.invoke('window:isAlwaysOnTop') as Promise<boolean>,
  windowCaptureScreen: () =>
    ipcRenderer.invoke('window:captureScreen') as Promise<string | null>,
  windowPreventSleep: (prevent: boolean) =>
    ipcRenderer.invoke('window:preventSleep', prevent),

  // ── Diagnostics (Iteration 377) ──────
  systemRunDiagnostics: () =>
    ipcRenderer.invoke('system:runDiagnostics') as Promise<{
      id: string; label: string; status: 'ok' | 'warning' | 'error'; detail: string; subDetail?: string
    }[]>,

  // ── Backup & Restore (Iteration 426) ──────
  backupExport: () =>
    ipcRenderer.invoke('backup:export') as Promise<{
      success?: boolean; canceled?: boolean; error?: string;
      filePath?: string; sizeKB?: number;
      counts?: { personas: number; workflows: number; notes: number; memories: number; snippets: number }
    }>,
  backupImport: () =>
    ipcRenderer.invoke('backup:import') as Promise<{
      success?: boolean; canceled?: boolean; error?: string;
      imported?: Record<string, number>; backupDate?: string
    }>,

  // ── Providers (multi-model support) ────
  providerListConfigs: () => ipcRenderer.invoke('provider:listConfigs'),
  providerListModels: () => ipcRenderer.invoke('provider:listModels'),
  providerUpsert: (config: unknown) => ipcRenderer.invoke('provider:upsert', config),
  providerRemove: (providerId: string) => ipcRenderer.invoke('provider:remove', providerId),
  providerHealthCheck: () => ipcRenderer.invoke('provider:healthCheck'),
  providerHealthStatuses: () => ipcRenderer.invoke('provider:healthStatuses'),
  providerSetActive: (providerId: string) => ipcRenderer.invoke('provider:setActive', providerId),
  providerGetActive: () => ipcRenderer.invoke('provider:getActive'),
  providerSendMessage: (args: unknown) => ipcRenderer.invoke('provider:sendMessage', args),
  providerAbort: (providerId: string) => ipcRenderer.invoke('provider:abort', providerId),
  providerFetchRemoteModels: (args: unknown) => ipcRenderer.invoke('provider:fetchRemoteModels', args),

  onProviderFailover: (cb: (data: { fromProvider: string; toProvider: string; reason: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { fromProvider: string; toProvider: string; reason: string }) => cb(data)
    ipcRenderer.on('provider:failover', handler)
    return () => ipcRenderer.removeListener('provider:failover', handler)
  },

  // ── Memory ──────────────────────────────────────────────────────────────
  memoryList: (scope?: 'global' | 'project' | 'all') =>
    ipcRenderer.invoke('memory:list', { scope }) as Promise<{
      filePath: string; name: string; description: string;
      type: string; content: string; scope: string; projectHash?: string; mtime: number
    }[]>,
  memoryRead: (filePath: string) =>
    ipcRenderer.invoke('memory:read', { filePath }) as Promise<string>,
  memoryWrite: (filePath: string, content: string) =>
    ipcRenderer.invoke('memory:write', { filePath, content }) as Promise<{ success: boolean }>,
  memoryCreate: (args: { name: string; description: string; type: string; body: string; scope: 'global' | 'project'; projectHash?: string }) =>
    ipcRenderer.invoke('memory:create', args) as Promise<{ success: boolean; filePath: string }>,
  memoryDelete: (filePath: string) =>
    ipcRenderer.invoke('memory:delete', { filePath }) as Promise<{ success: boolean }>,

  // ── Worktree ─────────────────────────────────────────────────────────────
  worktreeIsGitRepo: (cwd: string) =>
    ipcRenderer.invoke('worktree:isGitRepo', { cwd }) as Promise<{ isGit: boolean }>,
  worktreeList: (cwd: string) =>
    ipcRenderer.invoke('worktree:list', { cwd }) as Promise<{
      path: string; branch: string; head: string; isMain: boolean
    }[]>,
  worktreeCreate: (cwd: string, name: string) =>
    ipcRenderer.invoke('worktree:create', { cwd, name }) as Promise<{ path: string; branch: string }>,
  worktreeRemove: (cwd: string, worktreePath: string, force: boolean) =>
    ipcRenderer.invoke('worktree:remove', { cwd, worktreePath, force }) as Promise<{ success: boolean }>,

  // ── Plugin ───────────────────────────────────────────────────────────────
  pluginList: () =>
    ipcRenderer.invoke('plugin:list') as Promise<{
      name: string; version?: string; source: string; enabled: boolean;
      installDate: string; description?: string; mcpServers?: unknown; hooks?: unknown
    }[]>,
  pluginSetEnabled: (name: string, enabled: boolean) =>
    ipcRenderer.invoke('plugin:setEnabled', { name, enabled }) as Promise<{ success: boolean }>,
  pluginUninstall: (name: string) =>
    ipcRenderer.invoke('plugin:uninstall', { name }) as Promise<{ success: boolean }>,
  pluginRegisterLocal: (pluginPath: string) =>
    ipcRenderer.invoke('plugin:registerLocal', { pluginPath }),

  // ── Version info ────────────────────────
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    app: (() => { try { return require('../../package.json').version } catch { return 'unknown' } })(),
    platform: process.platform,
    arch: process.arch,
  },

  // ── Clawd desktop pet (Iteration 615) ──
  clawdLaunch: () =>
    ipcRenderer.invoke('clawd:launch') as Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }>,
  clawdIsRunning: () =>
    ipcRenderer.invoke('clawd:isRunning') as Promise<{ running: boolean }>,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
