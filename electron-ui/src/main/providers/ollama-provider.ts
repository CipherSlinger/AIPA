import http from 'http'
import { ModelProvider, ModelProviderConfig, ModelInfo, ProviderHealthStatus, SendMessageOptions, StreamEvent } from './types'
import { createLogger } from '../utils/logger'

const log = createLogger('ollama-provider')

/**
 * Ollama local model provider.
 * Connects to a locally running Ollama instance via its REST API.
 * Auto-discovers available models via /api/tags.
 */
export class OllamaProvider implements ModelProvider {
  readonly type = 'ollama' as const
  private config!: ModelProviderConfig
  private abortController: AbortController | null = null

  get id(): string {
    return this.config?.id || 'ollama'
  }

  async initialize(config: ModelProviderConfig): Promise<void> {
    this.config = config
    log.debug(`Initialized Ollama provider: ${config.baseUrl}`)
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const base: ProviderHealthStatus = {
      providerId: this.id,
      status: 'healthy',
      lastCheck: Date.now(),
    }

    const baseUrl = this.config.baseUrl || 'http://localhost:11434'
    try {
      const response = await this.fetchJson(`${baseUrl}/api/tags`)
      if (response.models && Array.isArray(response.models)) {
        return base
      }
      return { ...base, status: 'degraded', lastError: 'Unexpected response format' }
    } catch (err) {
      return { ...base, status: 'down', lastError: `Ollama not reachable: ${err}` }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434'
    try {
      const response = await this.fetchJson(`${baseUrl}/api/tags`)
      if (response.models && Array.isArray(response.models)) {
        return (response.models as Array<{ name: string; size: number; details?: { parameter_size?: string; family?: string } }>).map((m) => ({
          id: m.name,
          name: m.name,
          provider: this.id,
          capabilities: {
            streaming: true,
            vision: m.name.includes('llava') || m.name.includes('vision'),
            code: m.name.includes('code') || m.name.includes('deepseek-coder') || m.name.includes('starcoder'),
            reasoning: m.name.includes('deepseek-r1') || m.name.includes('qwen'),
          },
        }))
      }
    } catch (err) {
      log.debug(`Failed to list Ollama models: ${err}`)
    }
    return this.config.models || []
  }

  async sendMessage(options: SendMessageOptions, onEvent: (event: StreamEvent) => void): Promise<void> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434'
    this.abortController = new AbortController()

    // Build messages array for Ollama chat API
    const messages: Array<{ role: string; content: string; images?: string[] }> = []

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    if (options.messages) {
      messages.push(...options.messages.map(m => ({ role: m.role, content: m.content })))
    }

    // User message with optional images
    const userMsg: { role: string; content: string; images?: string[] } = {
      role: 'user',
      content: options.prompt,
    }
    if (options.images && options.images.length > 0) {
      // Ollama expects base64 images without the data URL prefix
      userMsg.images = options.images.map(img => {
        const match = img.match(/^data:[^;]+;base64,(.+)$/)
        return match ? match[1] : img
      })
    }
    messages.push(userMsg)

    const body = JSON.stringify({
      model: options.model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 4096,
      },
    })

    try {
      await this.streamOllamaChat(`${baseUrl}/api/chat`, body, options.signal || this.abortController.signal, onEvent)
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        log.debug('Request aborted')
      } else {
        onEvent({ type: 'error', data: { error: String(err) } })
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
    return false
  }

  supportsVision(): boolean {
    return this.config.models.some(m => m.capabilities?.vision)
  }

  // ── Private helpers ──

  private streamOllamaChat(
    url: string,
    body: string,
    signal: AbortSignal,
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url)

      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 11434,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            let errorBody = ''
            res.on('data', (chunk: Buffer) => { errorBody += chunk.toString() })
            res.on('end', () => {
              reject(new Error(`Ollama error ${res.statusCode}: ${errorBody}`))
            })
            return
          }

          let buffer = ''

          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              try {
                const parsed = JSON.parse(trimmed) as {
                  message?: { content?: string }
                  done?: boolean
                  total_duration?: number
                  eval_count?: number
                  prompt_eval_count?: number
                }

                if (parsed.message?.content) {
                  onEvent({ type: 'textDelta', data: { text: parsed.message.content } })
                }

                if (parsed.done) {
                  // Emit usage stats if available
                  if (parsed.eval_count || parsed.prompt_eval_count) {
                    onEvent({
                      type: 'result',
                      data: {
                        event: {
                          usage: {
                            input_tokens: parsed.prompt_eval_count || 0,
                            output_tokens: parsed.eval_count || 0,
                          },
                        },
                      },
                    })
                  }
                  onEvent({ type: 'messageStop', data: {} })
                }
              } catch {
                // Skip unparseable lines
              }
            }
          })

          res.on('end', () => {
            resolve()
          })

          res.on('error', reject)
        },
      )

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

  private fetchJson(url: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url)
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 11434,
          path: parsedUrl.pathname,
          method: 'GET',
          timeout: 5000,
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
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
      req.end()
    })
  }
}
