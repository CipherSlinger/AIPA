/**
 * Provider scenario determines how CLI environment variables are injected.
 *
 * - official: Anthropic official API via ANTHROPIC_API_KEY
 * - gateway:  AI gateway / proxy via ANTHROPIC_AUTH_TOKEN + empty ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL
 * - compat:   Third-party compatible API (DeepSeek, Qwen, OpenAI, etc.) via
 *             ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL + ANTHROPIC_MODEL
 */
export type ProviderScenario = 'official' | 'gateway' | 'compat'

export interface ModelProviderConfig {
  id: string
  name: string
  /** Scenario determines which env vars are injected into the CLI subprocess */
  scenario: ProviderScenario
  baseUrl?: string
  apiKey?: string
  /** Bearer token for gateway/proxy authentication (ANTHROPIC_AUTH_TOKEN).
   *  When set, apiKey must be empty to prevent it from taking precedence. */
  authToken?: string
  /** Model override injected as ANTHROPIC_MODEL. Only used in 'compat' scenario. */
  model?: string
  models: ModelInfo[]
  enabled: boolean
  isDefault?: boolean
  /** Failover priority (lower = higher priority) */
  failoverPriority?: number
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  capabilities?: ModelCapabilities
  maxTokens?: number
  contextWindow?: number
}

export interface ModelCapabilities {
  vision?: boolean
  code?: boolean
  reasoning?: boolean
  tools?: boolean
  streaming?: boolean
}

export interface ProviderHealthStatus {
  providerId: string
  status: 'healthy' | 'degraded' | 'down'
  lastCheck: number
  lastError?: string
  /** Cooldown until timestamp (ms since epoch) — provider is skipped during failover */
  cooldownUntil?: number
}

/**
 * Build the environment variable overrides to inject into the CLI subprocess
 * based on the provider's scenario and configuration.
 */
export function buildCliEnv(config: ModelProviderConfig): Record<string, string> {
  const env: Record<string, string> = {}

  switch (config.scenario) {
    case 'official':
      // Direct Anthropic API — just pass the API key
      if (config.apiKey) env.ANTHROPIC_API_KEY = config.apiKey
      break

    case 'gateway':
      // AI gateway/proxy (e.g. Vercel AI Gateway):
      // Must set ANTHROPIC_API_KEY to empty string so it doesn't take precedence over the token
      env.ANTHROPIC_API_KEY = ''
      if (config.authToken) env.ANTHROPIC_AUTH_TOKEN = config.authToken
      if (config.baseUrl) env.ANTHROPIC_BASE_URL = config.baseUrl
      break

    case 'compat':
      // Third-party compatible API (DeepSeek, Qwen, OpenAI, Ollama, etc.)
      if (config.apiKey) env.ANTHROPIC_API_KEY = config.apiKey
      if (config.baseUrl) env.ANTHROPIC_BASE_URL = config.baseUrl
      if (config.model) env.ANTHROPIC_MODEL = config.model
      break
  }

  return env
}

/**
 * Migrate a legacy provider config (with 'type' field) to the new 'scenario' format.
 */
export function migrateProviderConfig(raw: Record<string, unknown>): ModelProviderConfig {
  if (raw.scenario) {
    // Already in new format
    return raw as unknown as ModelProviderConfig
  }

  // Map old 'type' to 'scenario'
  let scenario: ProviderScenario = 'official'
  const oldType = raw.type as string | undefined
  if (oldType === 'openai-compat' || oldType === 'ollama') {
    scenario = 'compat'
  }

  // For ollama, ensure baseUrl uses /v1 path
  let baseUrl = raw.baseUrl as string | undefined
  if (oldType === 'ollama' && baseUrl === 'http://localhost:11434') {
    baseUrl = 'http://localhost:11434/v1'
  }

  const { type: _type, ...rest } = raw
  return { ...rest, scenario, baseUrl } as unknown as ModelProviderConfig
}

/**
 * Default provider configs for well-known services.
 * All providers now use the Claude CLI as the execution engine.
 */
export const DEFAULT_PROVIDER_CONFIGS: ModelProviderConfig[] = [
  {
    id: 'claude-cli',
    name: 'Claude (Anthropic)',
    scenario: 'official',
    enabled: true,
    isDefault: true,
    failoverPriority: 0,
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'claude-cli', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 200000 },
      { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', provider: 'claude-cli', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 200000 },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'claude-cli', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 200000 },
      { id: 'claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', provider: 'claude-cli', capabilities: { vision: true, code: true, reasoning: false, tools: true, streaming: true }, contextWindow: 200000 },
    ],
  },
  {
    id: 'gateway',
    name: 'AI Gateway / Proxy',
    scenario: 'gateway',
    enabled: false,
    failoverPriority: 1,
    models: [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    scenario: 'compat',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    enabled: false,
    failoverPriority: 2,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: { vision: true, code: true, reasoning: false, tools: true, streaming: true }, contextWindow: 128000 },
      { id: 'o3-mini', name: 'o3-mini', provider: 'openai', capabilities: { vision: false, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 200000 },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    scenario: 'compat',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    enabled: false,
    failoverPriority: 3,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', capabilities: { vision: false, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', capabilities: { vision: false, code: true, reasoning: true, tools: false, streaming: true }, contextWindow: 64000 },
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba Cloud)',
    scenario: 'compat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    enabled: false,
    failoverPriority: 4,
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'qwen', capabilities: { vision: false, code: true, reasoning: false, tools: true, streaming: true }, contextWindow: 131072 },
      { id: 'qwen-plus', name: 'Qwen Plus', provider: 'qwen', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 131072 },
      { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 32768 },
      { id: 'qwen-long', name: 'Qwen Long', provider: 'qwen', capabilities: { vision: false, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 1000000 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    scenario: 'compat',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3',
    enabled: false,
    failoverPriority: 5,
    models: [],
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    scenario: 'compat',
    baseUrl: '',
    model: '',
    enabled: false,
    failoverPriority: 99,
    models: [],
  },
]
