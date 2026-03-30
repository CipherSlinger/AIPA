import https from 'https'
import http from 'http'
import { ModelProvider, ModelProviderConfig, ModelInfo, ProviderHealthStatus, SendMessageOptions, StreamEvent } from './types'
import { createLogger } from '../utils/logger'

const log = createLogger('openai-provider')

/**
 * OpenAI-compatible API provider.
 * Works with OpenAI, DeepSeek, Together AI, Groq, and any other provider
 * that implements the OpenAI Chat Completions API.
 */
export class OpenAICompatProvider implements ModelProvider {
  readonly type = 'openai-compat' as const
  private config!: ModelProviderConfig
  private abortController: AbortController | null = null

  get id(): string {
    return this.config?.id || 'openai-compat'
  }

  async initialize(config: ModelProviderConfig): Promise<void> {
    this.config = config
    log.debug(`Initialized OpenAI-compat provider: ${config.name} (${config.baseUrl})`)
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const base: ProviderHealthStatus = {
      providerId: this.id,
      status: 'healthy',
      lastCheck: Date.now(),
    }

    if (!this.config.apiKey || !this.config.baseUrl) {
      return { ...base, status: 'down', lastError: 'Missing API key or base URL' }
    }

    try {
      // Try listing models as a health check
      const url = new URL('/models', this.config.baseUrl)
      const response = await this.fetchJson(url.toString(), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      })
      if ((response as Record<string, unknown>).error) {
        const errObj = (response as Record<string, unknown>).error as Record<string, unknown>
        return { ...base, status: 'degraded', lastError: (errObj.message as string) || 'API error' }
      }
      return base
    } catch (err) {
      return { ...base, status: 'down', lastError: String(err) }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      return this.config.models || []
    }

    try {
      const url = new URL('/models', this.config.baseUrl)
      const response = await this.fetchJson(url.toString(), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      })
      if (response.data && Array.isArray(response.data)) {
        return response.data.map((m: { id: string; owned_by?: string }) => ({
          id: m.id,
          name: m.id,
          provider: this.id,
          capabilities: { streaming: true },
        }))
      }
    } catch (err) {
      log.debug(`Failed to list models from ${this.config.name}: ${err}`)
    }
    return this.config.models || []
  }

  async sendMessage(options: SendMessageOptions, onEvent: (event: StreamEvent) => void): Promise<void> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      onEvent({ type: 'error', data: { error: `Provider ${this.config.name} not configured (missing API key or base URL)` } })
      return
    }

    this.abortController = new AbortController()

    // Build messages array
    const messages: Array<{ role: string; content: unknown }> = []

    // System prompt
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    // Previous conversation history
    if (options.messages) {
      messages.push(...options.messages)
    }

    // Current user message (with optional images)
    if (options.images && options.images.length > 0) {
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: options.prompt },
        ...options.images.map(img => ({
          type: 'image_url' as const,
          image_url: { url: img },
        })),
      ]
      messages.push({ role: 'user', content })
    } else {
      messages.push({ role: 'user', content: options.prompt })
    }

    const body = JSON.stringify({
      model: options.model,
      messages,
      stream: true,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    })

    const url = new URL('/chat/completions', this.config.baseUrl)

    try {
      await this.streamRequest(url.toString(), body, options.signal || this.abortController.signal, onEvent)
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        log.debug('Request aborted')
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        onEvent({ type: 'error', data: { error: errMsg } })
      }
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  getConfig(): ModelProviderConfig {
    return this.config
  }

  supportsTools(): boolean {
    return false // Tool use requires special handling per-provider
  }

  supportsVision(): boolean {
    return this.config.models.some(m => m.capabilities?.vision)
  }

  // ── Private helpers ──

  private streamRequest(
    url: string,
    body: string,
    signal: AbortSignal,
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url)
      const isHttps = parsedUrl.protocol === 'https:'
      const requestFn = isHttps ? https.request : http.request

      const req = requestFn(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Accept': 'text/event-stream',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            let errorBody = ''
            res.on('data', (chunk: Buffer) => { errorBody += chunk.toString() })
            res.on('end', () => {
              try {
                const parsed = JSON.parse(errorBody)
                const msg = parsed.error?.message || errorBody
                reject(new Error(`API error ${res.statusCode}: ${msg}`))
              } catch {
                reject(new Error(`API error ${res.statusCode}: ${errorBody}`))
              }
            })
            return
          }

          let buffer = ''

          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue
              const data = trimmed.slice(6)
              if (data === '[DONE]') {
                onEvent({ type: 'messageStop', data: {} })
                continue
              }
              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta
                if (delta?.content) {
                  onEvent({ type: 'textDelta', data: { text: delta.content } })
                }
                if (delta?.reasoning_content) {
                  onEvent({ type: 'thinkingDelta', data: { thinking: delta.reasoning_content } })
                }
                // Handle finish reason
                if (parsed.choices?.[0]?.finish_reason) {
                  const usage = parsed.usage
                  if (usage) {
                    onEvent({
                      type: 'result',
                      data: {
                        event: {
                          usage: {
                            input_tokens: usage.prompt_tokens || 0,
                            output_tokens: usage.completion_tokens || 0,
                          },
                        },
                      },
                    })
                  }
                }
              } catch {
                // Skip unparseable lines
              }
            }
          })

          res.on('end', () => {
            // Process remaining buffer
            if (buffer.trim()) {
              const trimmed = buffer.trim()
              if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
                try {
                  const data = JSON.parse(trimmed.slice(6))
                  const delta = data.choices?.[0]?.delta
                  if (delta?.content) {
                    onEvent({ type: 'textDelta', data: { text: delta.content } })
                  }
                } catch { /* ignore */ }
              }
            }
            onEvent({ type: 'messageStop', data: {} })
            resolve()
          })

          res.on('error', (err) => {
            reject(err)
          })
        },
      )

      // Handle abort
      const onAbort = () => {
        req.destroy()
        reject(new DOMException('Request aborted', 'AbortError'))
      }

      if (signal.aborted) {
        onAbort()
        return
      }

      signal.addEventListener('abort', onAbort, { once: true })

      req.on('error', (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      })

      req.write(body)
      req.end()
    })
  }

  private fetchJson(url: string, options: { method: string; headers: Record<string, string> }): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url)
      const isHttps = parsedUrl.protocol === 'https:'
      const requestFn = isHttps ? https.request : http.request

      const req = requestFn(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: options.method,
          headers: options.headers,
        },
        (res) => {
          let body = ''
          res.on('data', (chunk: Buffer) => { body += chunk.toString() })
          res.on('end', () => {
            try {
              resolve(JSON.parse(body))
            } catch {
              resolve({ error: { message: body } })
            }
          })
        },
      )
      req.on('error', reject)
      req.end()
    })
  }
}
