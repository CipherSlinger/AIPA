/**
 * ModelProvider interface — the abstraction layer for multi-model support.
 * All model providers (Claude CLI, OpenAI, Ollama, etc.) implement this interface.
 *
 * Events emitted by providers follow the same pattern as the existing StreamBridge:
 * - textDelta: { text: string }
 * - thinkingDelta: { thinking: string }
 * - toolUse: { event: { id, name, input } }
 * - toolResult: { event: { tool_use_id, content, is_error } }
 * - messageStop: {}
 * - result: { claudeSessionId?: string, event: any }
 * - error: { error: string }
 * - processExit: { code: number }
 */

export interface ModelProviderConfig {
  id: string
  name: string
  type: 'claude-cli' | 'openai-compat' | 'ollama'
  baseUrl?: string
  apiKey?: string
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

export interface StreamEvent {
  type: 'textDelta' | 'thinkingDelta' | 'toolUse' | 'toolResult' | 'messageStop' | 'result' | 'error'
  data: Record<string, unknown>
}

export interface SendMessageOptions {
  prompt: string
  model: string
  systemPrompt?: string
  /** Previous messages for context (OpenAI-format: {role, content}[]) */
  messages?: Array<{ role: string; content: string }>
  /** Image attachments as base64 data URLs */
  images?: string[]
  /** Max tokens to generate */
  maxTokens?: number
  /** Temperature (0-2) */
  temperature?: number
  /** Abort signal */
  signal?: AbortSignal
}

export interface ModelProvider {
  readonly id: string
  readonly type: ModelProviderConfig['type']

  /** Initialize the provider with config */
  initialize(config: ModelProviderConfig): Promise<void>

  /** Check if the provider is healthy and reachable */
  healthCheck(): Promise<ProviderHealthStatus>

  /** List available models from this provider */
  listModels(): Promise<ModelInfo[]>

  /** Send a message and stream the response */
  sendMessage(
    options: SendMessageOptions,
    onEvent: (event: StreamEvent) => void,
  ): Promise<void>

  /** Abort the current request */
  abort(): void

  /** Get current config */
  getConfig(): ModelProviderConfig

  /** Whether this provider supports tool use */
  supportsTools(): boolean

  /** Whether this provider supports image/vision inputs */
  supportsVision(): boolean
}

/**
 * Default provider configs for well-known services.
 * Users can add custom providers beyond these.
 */
export const DEFAULT_PROVIDER_CONFIGS: Omit<ModelProviderConfig, 'apiKey'>[] = [
  {
    id: 'claude-cli',
    name: 'Claude (CLI)',
    type: 'claude-cli',
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
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    enabled: false,
    failoverPriority: 1,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: { vision: true, code: true, reasoning: false, tools: true, streaming: true }, contextWindow: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', capabilities: { vision: true, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 128000 },
      { id: 'o3-mini', name: 'o3-mini', provider: 'openai', capabilities: { vision: false, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 200000 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    enabled: false,
    failoverPriority: 2,
    models: [], // Dynamically discovered from Ollama API
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compat',
    baseUrl: 'https://api.deepseek.com/v1',
    enabled: false,
    failoverPriority: 3,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', capabilities: { vision: false, code: true, reasoning: true, tools: true, streaming: true }, contextWindow: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', capabilities: { vision: false, code: true, reasoning: true, tools: false, streaming: true }, contextWindow: 64000 },
    ],
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    type: 'openai-compat',
    baseUrl: '',
    enabled: false,
    failoverPriority: 99,
    models: [],
  },
]
