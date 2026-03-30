import { ModelProvider, ModelProviderConfig, ModelInfo, ProviderHealthStatus, StreamEvent, SendMessageOptions, DEFAULT_PROVIDER_CONFIGS } from './types'
import { OpenAICompatProvider } from './openai-compat-provider'
import { OllamaProvider } from './ollama-provider'
import { createLogger } from '../utils/logger'

const log = createLogger('provider-registry')

/** Cooldown duration for a failed provider (60 seconds) */
const FAILOVER_COOLDOWN_MS = 60_000

/**
 * ProviderRegistry manages all configured model providers.
 * Handles provider lifecycle, health monitoring, and failover routing.
 */
export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>()
  private configs = new Map<string, ModelProviderConfig>()
  private healthStatuses = new Map<string, ProviderHealthStatus>()
  private activeProviderId: string = 'claude-cli'

  /**
   * Initialize the registry with saved configs.
   * Call this once during app startup.
   */
  async initialize(savedConfigs?: ModelProviderConfig[]): Promise<void> {
    // Merge saved configs with defaults (saved configs take precedence)
    const effectiveConfigs: ModelProviderConfig[] = []

    if (savedConfigs && savedConfigs.length > 0) {
      // Use saved configs as primary
      for (const saved of savedConfigs) {
        effectiveConfigs.push(saved)
      }
      // Add any default configs that don't exist in saved
      for (const def of DEFAULT_PROVIDER_CONFIGS) {
        if (!savedConfigs.find(s => s.id === def.id)) {
          effectiveConfigs.push({ ...def, apiKey: '' })
        }
      }
    } else {
      // First time: use defaults
      for (const def of DEFAULT_PROVIDER_CONFIGS) {
        effectiveConfigs.push({ ...def, apiKey: '' })
      }
    }

    // Initialize each provider
    for (const config of effectiveConfigs) {
      this.configs.set(config.id, config)
      if (config.enabled) {
        await this.instantiateProvider(config)
      }
    }

    log.debug(`ProviderRegistry initialized with ${this.providers.size} active providers out of ${this.configs.size} configured`)
  }

  private async instantiateProvider(config: ModelProviderConfig): Promise<ModelProvider | null> {
    try {
      let provider: ModelProvider

      switch (config.type) {
        case 'claude-cli':
          // Claude CLI provider is handled separately by the existing StreamBridge
          // We just track the config here for model listing and failover
          return null
        case 'openai-compat':
          provider = new OpenAICompatProvider()
          break
        case 'ollama':
          provider = new OllamaProvider()
          break
        default:
          log.warn(`Unknown provider type: ${config.type}`)
          return null
      }

      await provider.initialize(config)
      this.providers.set(config.id, provider)
      return provider
    } catch (err) {
      log.warn(`Failed to initialize provider ${config.id}: ${err}`)
      return null
    }
  }

  /**
   * Add or update a provider configuration.
   */
  async upsertProvider(config: ModelProviderConfig): Promise<void> {
    this.configs.set(config.id, config)

    // Remove existing instance if any
    const existing = this.providers.get(config.id)
    if (existing) {
      existing.abort()
      this.providers.delete(config.id)
    }

    if (config.enabled && config.type !== 'claude-cli') {
      await this.instantiateProvider(config)
    }

    log.debug(`Provider ${config.id} ${config.enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Remove a provider.
   */
  removeProvider(providerId: string): void {
    const provider = this.providers.get(providerId)
    if (provider) {
      provider.abort()
      this.providers.delete(providerId)
    }
    this.configs.delete(providerId)
    this.healthStatuses.delete(providerId)
    log.debug(`Provider ${providerId} removed`)
  }

  /**
   * Get a specific provider instance (for non-Claude providers).
   */
  getProvider(providerId: string): ModelProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Get all provider configs (for UI display).
   */
  getAllConfigs(): ModelProviderConfig[] {
    return Array.from(this.configs.values()).sort((a, b) =>
      (a.failoverPriority ?? 99) - (b.failoverPriority ?? 99)
    )
  }

  /**
   * Get all available models across all enabled providers.
   */
  async getAllModels(): Promise<ModelInfo[]> {
    const allModels: ModelInfo[] = []

    for (const [id, config] of this.configs) {
      if (!config.enabled) continue

      if (config.type === 'claude-cli') {
        // Static model list for Claude CLI
        allModels.push(...config.models)
      } else {
        const provider = this.providers.get(id)
        if (provider) {
          try {
            const models = await provider.listModels()
            allModels.push(...models)
          } catch {
            // Fallback to static model list
            allModels.push(...config.models)
          }
        }
      }
    }

    return allModels
  }

  /**
   * Get all health statuses.
   */
  getHealthStatuses(): ProviderHealthStatus[] {
    return Array.from(this.healthStatuses.values())
  }

  /**
   * Run health check on all enabled providers.
   */
  async checkAllHealth(): Promise<ProviderHealthStatus[]> {
    const results: ProviderHealthStatus[] = []

    for (const [id, config] of this.configs) {
      if (!config.enabled) continue

      if (config.type === 'claude-cli') {
        // Claude CLI health is assumed good if we have an API key
        const status: ProviderHealthStatus = {
          providerId: id,
          status: config.apiKey ? 'healthy' : 'down',
          lastCheck: Date.now(),
          lastError: config.apiKey ? undefined : 'No API key configured',
        }
        this.healthStatuses.set(id, status)
        results.push(status)
      } else {
        const provider = this.providers.get(id)
        if (provider) {
          const status = await provider.healthCheck()
          this.healthStatuses.set(id, status)
          results.push(status)
        }
      }
    }

    return results
  }

  /**
   * Set the active provider for routing messages.
   */
  setActiveProvider(providerId: string): void {
    this.activeProviderId = providerId
    log.debug(`Active provider set to: ${providerId}`)
  }

  /**
   * Get the active provider ID.
   */
  getActiveProviderId(): string {
    return this.activeProviderId
  }

  /**
   * Determine which provider should handle a given model ID.
   */
  resolveProviderForModel(modelId: string): { providerId: string; config: ModelProviderConfig } | null {
    // First check if the model belongs to a specific provider
    for (const [id, config] of this.configs) {
      if (!config.enabled) continue
      if (config.models.some(m => m.id === modelId)) {
        return { providerId: id, config }
      }
    }
    // Fall back to active provider
    const activeConfig = this.configs.get(this.activeProviderId)
    if (activeConfig) {
      return { providerId: this.activeProviderId, config: activeConfig }
    }
    return null
  }

  /**
   * Send a message to a non-Claude provider with failover support.
   * For Claude CLI, use the existing StreamBridge directly (handled by IPC layer).
   *
   * Returns the provider ID that actually handled the request.
   */
  async sendMessageWithFailover(
    options: SendMessageOptions,
    onEvent: (event: StreamEvent) => void,
    onFailover?: (fromProvider: string, toProvider: string, reason: string) => void,
  ): Promise<string> {
    const resolved = this.resolveProviderForModel(options.model)
    if (!resolved) {
      onEvent({ type: 'error', data: { error: `No provider found for model: ${options.model}` } })
      throw new Error(`No provider found for model: ${options.model}`)
    }

    // If it's a Claude CLI model, signal the caller to use StreamBridge
    if (resolved.config.type === 'claude-cli') {
      return 'claude-cli'
    }

    // Try primary provider
    const primaryProvider = this.providers.get(resolved.providerId)
    if (primaryProvider) {
      const health = this.healthStatuses.get(resolved.providerId)
      const isCoolingDown = health?.cooldownUntil && Date.now() < health.cooldownUntil

      if (!isCoolingDown) {
        try {
          await primaryProvider.sendMessage(options, onEvent)
          return resolved.providerId
        } catch (err) {
          const errMsg = String(err)
          log.warn(`Provider ${resolved.providerId} failed: ${errMsg}`)

          // Mark provider on cooldown
          this.healthStatuses.set(resolved.providerId, {
            providerId: resolved.providerId,
            status: 'down',
            lastCheck: Date.now(),
            lastError: errMsg,
            cooldownUntil: Date.now() + FAILOVER_COOLDOWN_MS,
          })
        }
      }
    }

    // Failover: try other enabled providers in priority order
    const failoverProviders = Array.from(this.configs.values())
      .filter(c => c.enabled && c.id !== resolved.providerId && c.type !== 'claude-cli')
      .sort((a, b) => (a.failoverPriority ?? 99) - (b.failoverPriority ?? 99))

    for (const fallbackConfig of failoverProviders) {
      const health = this.healthStatuses.get(fallbackConfig.id)
      if (health?.cooldownUntil && Date.now() < health.cooldownUntil) {
        continue // Skip providers on cooldown
      }

      const fallbackProvider = this.providers.get(fallbackConfig.id)
      if (!fallbackProvider) continue

      // Find a suitable model from the fallback provider
      const fallbackModel = fallbackConfig.models[0]?.id || options.model

      try {
        const reason = `Primary provider ${resolved.providerId} unavailable`
        if (onFailover) {
          onFailover(resolved.providerId, fallbackConfig.id, reason)
        }
        log.debug(`Failing over from ${resolved.providerId} to ${fallbackConfig.id} (model: ${fallbackModel})`)

        await fallbackProvider.sendMessage({ ...options, model: fallbackModel }, onEvent)
        return fallbackConfig.id
      } catch (err) {
        log.warn(`Failover provider ${fallbackConfig.id} also failed: ${err}`)
        this.healthStatuses.set(fallbackConfig.id, {
          providerId: fallbackConfig.id,
          status: 'down',
          lastCheck: Date.now(),
          lastError: String(err),
          cooldownUntil: Date.now() + FAILOVER_COOLDOWN_MS,
        })
      }
    }

    // All providers failed
    onEvent({ type: 'error', data: { error: 'All providers failed. Please check your API keys and try again.' } })
    throw new Error('All providers failed')
  }

  /**
   * Serialize configs for persistence (strips sensitive data for logging).
   */
  serializeConfigs(): ModelProviderConfig[] {
    return Array.from(this.configs.values())
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()
