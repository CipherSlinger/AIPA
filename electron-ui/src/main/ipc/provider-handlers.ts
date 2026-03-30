import { ipcMain, BrowserWindow } from 'electron'
import { getPref, setPref } from '../config/config-manager'
import { providerRegistry } from '../providers'
import type { ModelProviderConfig, StreamEvent } from '../providers'
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
      // Persist all configs
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

  // Health check all providers
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

  // Send message to a non-Claude provider (OpenAI, Ollama, etc.)
  ipcMain.handle('provider:sendMessage', async (_e, args: {
    prompt: string
    model: string
    systemPrompt?: string
    messages?: Array<{ role: string; content: string }>
    images?: string[]
    maxTokens?: number
    temperature?: number
  }) => {
    const sessionId = `provider-${Date.now()}`

    try {
      const handledBy = await providerRegistry.sendMessageWithFailover(
        {
          prompt: args.prompt,
          model: args.model,
          systemPrompt: args.systemPrompt,
          messages: args.messages,
          images: args.images,
          maxTokens: args.maxTokens,
          temperature: args.temperature,
        },
        (event: StreamEvent) => {
          switch (event.type) {
            case 'textDelta':
              send('cli:assistantText', { sessionId, text: event.data.text })
              break
            case 'thinkingDelta':
              send('cli:thinkingDelta', { sessionId, thinking: event.data.thinking })
              break
            case 'toolUse':
              send('cli:toolUse', { sessionId, event: event.data })
              break
            case 'toolResult':
              send('cli:toolResult', { sessionId, event: event.data })
              break
            case 'messageStop':
              send('cli:messageEnd', { sessionId })
              break
            case 'result':
              send('cli:result', { sessionId, event: event.data.event })
              break
            case 'error':
              send('cli:error', { sessionId, error: event.data.error })
              break
          }
        },
        (fromProvider, toProvider, reason) => {
          send('provider:failover', { fromProvider, toProvider, reason })
        },
      )

      return { success: true, sessionId, handledBy }
    } catch (err) {
      return { success: false, sessionId, error: String(err) }
    }
  })

  // Abort a provider request
  ipcMain.handle('provider:abort', (_e, providerId: string) => {
    const provider = providerRegistry.getProvider(providerId)
    if (provider) {
      provider.abort()
    }
    return { success: true }
  })
}
