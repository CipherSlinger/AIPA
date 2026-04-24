import { ipcMain, BrowserWindow } from 'electron'
import { getPref, setPref } from '../config/config-manager'
import { providerRegistry } from '../providers'
import { buildCliEnv } from '../providers/types'
import type { ModelProviderConfig } from '../providers'
import { streamBridgeManager } from '../pty/stream-bridge'
import { createLogger } from '../utils/logger'

const log = createLogger('ipc:providers')

export function registerProviderHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  // Initialize provider registry on startup
  const savedConfigs = getPref('modelProviders') as unknown as ModelProviderConfig[] | undefined
  providerRegistry.initialize(savedConfigs).catch(err => {
    log.warn('Failed to initialize provider registry:', String(err))
  })

  // Get all provider configs
  ipcMain.handle('provider:listConfigs', () => {
    return providerRegistry.getAllConfigs()
  })

  // Get all available models across all providers
  ipcMain.handle('provider:listModels', async () => {
    return providerRegistry.getAllModels()
  })

  // Update a provider config
  ipcMain.handle('provider:upsert', async (_e, config: ModelProviderConfig) => {
    try {
      await providerRegistry.upsertProvider(config)
      const allConfigs = providerRegistry.serializeConfigs()
      setPref('modelProviders', allConfigs)
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  })

  // Remove a provider
  ipcMain.handle('provider:remove', (_e, providerId: string) => {
    providerRegistry.removeProvider(providerId)
    const allConfigs = providerRegistry.serializeConfigs()
    setPref('modelProviders', allConfigs)
    return { success: true }
  })

  // Health check all providers (config completeness check — no HTTP requests)
  ipcMain.handle('provider:healthCheck', async () => {
    return providerRegistry.checkAllHealth()
  })

  // Get health statuses
  ipcMain.handle('provider:healthStatuses', () => {
    return providerRegistry.getHealthStatuses()
  })

  // Set active provider
  ipcMain.handle('provider:setActive', (_e, providerId: string) => {
    providerRegistry.setActiveProvider(providerId)
    setPref('activeProviderId', providerId)
    return { success: true }
  })

  // Get active provider ID
  ipcMain.handle('provider:getActive', () => {
    return providerRegistry.getActiveProviderId()
  })

  // Send message via Claude CLI with provider-specific env vars injected
  ipcMain.handle('provider:sendMessage', async (_e, args: {
    prompt: string
    model?: string
    providerId: string
    cwd?: string
    resumeSessionId?: string
  }) => {
    const config = providerRegistry.getConfig(args.providerId)
    if (!config) {
      return { success: false, error: `Provider not found: ${args.providerId}` }
    }

    const sessionId = `provider-${Date.now()}`
    const bridge = streamBridgeManager.create(sessionId)

    // Forward events to renderer (same pattern as registerCliHandlers)
    bridge.on('textDelta', (d) => send('cli:assistantText', d))
    bridge.on('thinkingDelta', (d) => send('cli:thinkingDelta', d))
    bridge.on('toolUse', (d) => send('cli:toolUse', d))
    bridge.on('toolResult', (d) => send('cli:toolResult', d))
    bridge.on('messageStop', (d) => send('cli:messageEnd', d))
    bridge.on('result', (d) => send('cli:result', d))
    bridge.on('processExit', (d) => send('cli:processExit', d))
    bridge.on('stderr', (d) => send('cli:error', { sessionId, error: d }))
    bridge.on('permissionRequest', (d) => send('cli:permissionRequest', d))
    bridge.on('hookCallback', (d) => send('cli:hookCallback', d))
    bridge.on('mcpElicitation', (d) => send('cli:elicitation', d))

    // Build env from provider config — this is the core of the new architecture
    const providerEnv = buildCliEnv(config)

    // Strip CLAUDECODE to allow nesting
    const env = { ...providerEnv, CLAUDECODE: '' }

    try {
      await bridge.sendMessage({
        prompt: args.prompt,
        cwd: args.cwd || process.cwd(),
        resumeSessionId: args.resumeSessionId,
        sessionId,
        model: args.model,
        env,
        skipPermissions: false,
      })
      return { success: true, sessionId }
    } catch (err) {
      send('cli:error', { sessionId, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  // Abort a provider session
  ipcMain.handle('provider:abort', (_e, sessionId: string) => {
    streamBridgeManager.abort(sessionId)
    return { success: true }
  })

  // Fetch models from an endpoint — tries multiple strategies for
  // compatibility (OpenAI-style, DashScope-compatible, fallback list)
  const COMMON_CLAUDE_MODELS = [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ]

  // User-Agent that mimics the official Claude CLI so proxies don't block us
  const CLI_USER_AGENT = 'claude-cli/2.0.0 (external, cli)'

  async function tryOpenAIModels(baseUrl: string, authHeader?: string): Promise<string[] | null> {
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': CLI_USER_AGENT,
    }
    if (authHeader) headers['Authorization'] = authHeader
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return null
    const data = await resp.json() as { data?: { id: string }[] }
    const models = (data.data || []).map((m: { id: string }) => m.id).filter(Boolean)
    return models.length > 0 ? models : null
  }

  async function tryDashScopeModels(baseUrl: string, authHeader?: string): Promise<string[] | null> {
    // DashScope OpenAI-compatible endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/models
    // Detect DashScope base URL and try the /compatible-mode/v1/models path
    if (!baseUrl.includes('dashscope.aliyuncs.com')) return null
    const dm = baseUrl.match(/^(https?:\/\/[^/]+)/)
    if (!dm) return null
    const url = `${dm[1]}/compatible-mode/v1/models`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': CLI_USER_AGENT,
    }
    if (authHeader) headers['Authorization'] = authHeader
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return null
    const data = await resp.json() as { data?: { id: string }[] }
    const models = (data.data || []).map((m: { id: string }) => m.id).filter(Boolean)
    // Filter to only Claude models for Anthropic-compatible proxy URLs
    const claudeModels = models.filter((m: string) => m.toLowerCase().includes('claude') || m.toLowerCase().includes('sonnet') || m.toLowerCase().includes('haiku') || m.toLowerCase().includes('opus'))
    return claudeModels.length > 0 ? claudeModels : null
  }

  ipcMain.handle('provider:fetchRemoteModels', async (_e, { baseUrl, apiKey, authToken }: { baseUrl: string; apiKey?: string; authToken?: string }) => {
    const key = apiKey?.trim() || authToken?.trim()
    const authHeader = key ? `Bearer ${key}` : undefined
    const strategies = [
      () => tryOpenAIModels(baseUrl, authHeader),
      () => tryDashScopeModels(baseUrl, authHeader),
    ]

    for (const strategy of strategies) {
      try {
        const models = await strategy()
        if (models && models.length > 0) {
          return { success: true, models }
        }
      } catch {
        // Strategy failed — try next one
      }
    }

    // All strategies failed — return common Claude models as fallback
    return { success: true, models: COMMON_CLAUDE_MODELS }
  })
}
