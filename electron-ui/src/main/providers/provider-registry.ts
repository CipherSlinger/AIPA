import { ModelProviderConfig, ProviderHealthStatus, ModelInfo, DEFAULT_PROVIDER_CONFIGS, buildCliEnv, migrateProviderConfig } from './types'
import { createLogger } from '../utils/logger'

const log = createLogger('provider-registry')

/**
 * ProviderRegistry manages all configured model providers.
 * All message sending is handled by the existing StreamBridge (CLI subprocess).
 * This registry only manages configurations and health status.
 */
export class ProviderRegistry {
  private configs = new Map<string, ModelProviderConfig>()
  private healthStatuses = new Map<string, ProviderHealthStatus>()
  private activeProviderId: string = 'claude-cli'

  /**
   * Initialize the registry with saved configs.
   * Call this once during app startup.
   */
  async initialize(savedConfigs?: ModelProviderConfig[]): Promise<void> {
    const effectiveConfigs: ModelProviderConfig[] = []

    if (savedConfigs && savedConfigs.length > 0) {
      // Migrate legacy configs (with 'type' field) to new 'scenario' format
      for (const raw of savedConfigs) {
        effectiveConfigs.push(migrateProviderConfig(raw as unknown as Record<string, unknown>))
      }
      // Add any default configs that don't exist in saved configs
      for (const def of DEFAULT_PROVIDER_CONFIGS) {
        if (!effectiveConfigs.find(s => s.id === def.id)) {
          effectiveConfigs.push({ ...def, apiKey: '' })
        }
      }
    } else {
      // First time: use defaults
      for (const def of DEFAULT_PROVIDER_CONFIGS) {
        effectiveConfigs.push({ ...def, apiKey: '' })
      }
    }

    for (const config of effectiveConfigs) {
      this.configs.set(config.id, config)
    }

    log.debug(`ProviderRegistry initialized with ${this.configs.size} providers`)
  }

  /**
   * Add or update a provider configuration.
   */
  async upsertProvider(config: ModelProviderConfig): Promise<void> {
    this.configs.set(config.id, config)
    log.debug(`Provider ${config.id} ${config.enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Remove a provider.
   */
  removeProvider(providerId: string): void {
    this.configs.delete(providerId)
    this.healthStatuses.delete(providerId)
    log.debug(`Provider ${providerId} removed`)
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
    for (const config of this.configs.values()) {
      if (config.enabled) {
        allModels.push(...config.models)
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
   * Check health of all enabled providers by validating config completeness.
   * No HTTP requests are made — health is determined by whether required fields are set.
   */
  async checkAllHealth(): Promise<ProviderHealthStatus[]> {
    const results: ProviderHealthStatus[] = []

    for (const config of this.configs.values()) {
      if (!config.enabled) continue

      const status = this.checkConfigHealth(config)
      this.healthStatuses.set(config.id, status)
      results.push(status)
    }

    return results
  }

  private checkConfigHealth(config: ModelProviderConfig): ProviderHealthStatus {
    const base: ProviderHealthStatus = {
      providerId: config.id,
      status: 'healthy',
      lastCheck: Date.now(),
    }

    switch (config.scenario) {
      case 'official':
        if (!config.apiKey || !config.apiKey.trim()) {
          return { ...base, status: 'down', lastError: 'API Key not configured' }
        }
        break

      case 'gateway':
        if (!config.authToken || !config.authToken.trim()) {
          return { ...base, status: 'down', lastError: 'Auth Token not configured' }
        }
        if (!config.baseUrl || !config.baseUrl.trim()) {
          return { ...base, status: 'down', lastError: 'Base URL not configured' }
        }
        break

      case 'compat':
        if (!config.apiKey || !config.apiKey.trim()) {
          return { ...base, status: 'down', lastError: 'API Key not configured' }
        }
        if (!config.baseUrl || !config.baseUrl.trim()) {
          return { ...base, status: 'down', lastError: 'Base URL not configured' }
        }
        break
    }

    return base
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
   * Get a provider config by ID.
   */
  getConfig(providerId: string): ModelProviderConfig | undefined {
    return this.configs.get(providerId)
  }

  /**
   * Build CLI environment variables for the given provider.
   * Returns the env object to inject into StreamBridge.sendMessage().
   */
  buildEnvForProvider(providerId: string): Record<string, string> {
    const config = this.configs.get(providerId)
    if (!config) return {}
    return buildCliEnv(config)
  }

  /**
   * Serialize configs for persistence.
   */
  serializeConfigs(): ModelProviderConfig[] {
    return Array.from(this.configs.values())
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()
