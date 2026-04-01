import { contextBridge, ipcRenderer } from 'electron'

type Unsubscribe = () => void

const electronAPI = {
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

  // ── Sessions ─────────────────────────────
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionLoad: (id: string) => ipcRenderer.invoke('session:load', id),
  sessionDelete: (id: string) => ipcRenderer.invoke('session:delete', id),
  sessionFork: (sessionId: string, upToMessageIndex: number) => ipcRenderer.invoke('session:fork', { sessionId, upToMessageIndex }),
  sessionRename: (sessionId: string, title: string) => ipcRenderer.invoke('session:rename', { sessionId, title }),
  sessionGenerateTitle: (description: string) => ipcRenderer.invoke('session:generateTitle', { description }),
  sessionRewind: (sessionId: string, beforeTimestamp: string) => ipcRenderer.invoke('session:rewind', { sessionId, beforeTimestamp }),
  sessionSearch: (query: string, limit?: number) => ipcRenderer.invoke('session:search', { query, limit }),

  // ── Config / prefs ───────────────────────
  configRead: () => ipcRenderer.invoke('config:read'),
  configWrite: (patch: unknown) => ipcRenderer.invoke('config:write', patch),
  configGetEnv: () => ipcRenderer.invoke('config:getEnv'),
  configGetLocale: () => ipcRenderer.invoke('config:getLocale'),
  configSetApiKey: (key: string) => ipcRenderer.invoke('config:setApiKey', key),
  prefsGet: (key: string) => ipcRenderer.invoke('prefs:get', key),
  prefsSet: (key: string, value: unknown) => ipcRenderer.invoke('prefs:set', key, value),
  prefsGetAll: () => ipcRenderer.invoke('prefs:getAll'),

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

  // ── Menu events ──────────────────────────
  onMenuEvent: (event: string, cb: (...args: unknown[]) => void): Unsubscribe => {
    const h = (_: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(`menu:${event}`, h)
    return () => ipcRenderer.removeListener(`menu:${event}`, h)
  },

  // ── MCP ──────────────────────────────────
  mcpList: () => ipcRenderer.invoke('mcp:list'),
  mcpSetEnabled: (serverName: string, enabled: boolean) => ipcRenderer.invoke('mcp:setEnabled', { serverName, enabled }),

  // ── Feedback ─────────────────────────────
  feedbackRate: (messageId: string, rating: 'up' | 'down' | null) =>
    ipcRenderer.invoke('feedback:rate', { messageId, rating }),

  // ── Shell ───────────────────────────────
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

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

  onProviderFailover: (cb: (data: { fromProvider: string; toProvider: string; reason: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { fromProvider: string; toProvider: string; reason: string }) => cb(data)
    ipcRenderer.on('provider:failover', handler)
    return () => ipcRenderer.removeListener('provider:failover', handler)
  },

  // ── Version info ────────────────────────
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    app: (() => { try { return require('../../package.json').version } catch { return 'unknown' } })(),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
