/**
 * Live model discovery for the app's API key.
 *
 * The provider subsystem is gone: one key is the only credential the app has,
 * so which models it can actually run is a fact only the API's own account
 * knows. The built-in catalogue in `plugin-services.ts` is a fallback for an
 * offline start; here we ask the key instead of guessing from a hard-coded
 * list that ages with every model release.
 */
import { net } from 'electron'

export interface AvailableModel {
  id: string
  name: string
}

const REQUEST_TIMEOUT_MS = 10_000
const MAX_MODELS = 100
const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const MAX_BASE_URL_LENGTH = 2048

/**
 * Resolve the endpoint a key's models are fetched from.
 *
 * An explicit base URL is the key's own relay/gateway, so it is validated here
 * rather than trusted: a bare host without a scheme, or credentials embedded in
 * the URL, would make the request fail in a way that looks like a bad key. An
 * empty value means "not set on this key" and falls back to the process-wide
 * `ANTHROPIC_BASE_URL` exactly as before.
 */
export function normalizeAnthropicBaseUrl(baseUrl?: string): string {
  const explicit = (baseUrl ?? '').trim()
  if (!explicit) {
    return (process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  }
  const invalid = new Error('[invalid_base_url] Base URL 必须是 http:// 或 https:// 地址')
  if (explicit.length > MAX_BASE_URL_LENGTH) throw invalid
  let parsed: URL
  try {
    parsed = new URL(explicit)
  } catch {
    throw invalid
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw invalid
  // A URL carrying a username/password would send a second credential in
  // clear text to a host the user chose; refuse instead of silently using it.
  if (parsed.username || parsed.password) throw invalid
  return explicit.replace(/\/+$/, '')
}

/**
 * Ask the Anthropic Models API which models `apiKey` may use.
 *
 * `baseUrl` is the key's own endpoint (relay / proxy / self-hosted gateway);
 * absent means the official host. The key travels only in the `x-api-key`
 * header. It must never appear in an error message or a log line, so failures
 * are reported by HTTP status and the API's own `error.message` — never the
 * request headers or the raw body.
 */
export async function fetchAnthropicModels(apiKey: string, baseUrl?: string): Promise<AvailableModel[]> {
  const base = normalizeAnthropicBaseUrl(baseUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    // net.fetch rather than global fetch: it uses Chromium's network stack, so
    // a system proxy that already lets the CLI reach the API is honoured here
    // too (a common setup behind corporate or regional proxies).
    res = await net.fetch(`${base}/v1/models?limit=${MAX_MODELS}`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
      },
      signal: controller.signal,
    })
  } catch {
    // The thrown error can carry the request URL but never the key (it lives in
    // a header); keep the message to our own wording anyway.
    throw new Error(controller.signal.aborted
      ? `Anthropic API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : 'Anthropic API request failed')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // Only the API's own error text is read out of the body. The body itself,
    // the headers and the key stay out of the message and the log.
    let detail = ''
    try {
      const body = await res.json() as { error?: { message?: unknown; type?: unknown } }
      const message = body?.error?.message
      const type = body?.error?.type
      detail = typeof message === 'string' ? message : typeof type === 'string' ? type : ''
    } catch { /* non-JSON error body — the status is still the useful fact */ }
    throw new Error(`Anthropic API returned ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  let body: { data?: unknown }
  try {
    body = await res.json() as { data?: unknown }
  } catch {
    throw new Error(`Anthropic API returned ${res.status}: unreadable response`)
  }

  const rows = Array.isArray(body?.data) ? body.data : []
  const seen = new Set<string>()
  const models: AvailableModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const { id, display_name: displayName } = row as { id?: unknown; display_name?: unknown }
    // `claude` ids only: the same key can list endpoint-specific entries, and
    // the CLI can only run Claude models.
    if (typeof id !== 'string' || !id.startsWith('claude') || seen.has(id)) continue
    seen.add(id)
    models.push({
      id,
      name: typeof displayName === 'string' && displayName.trim() ? displayName : id,
    })
    if (models.length >= MAX_MODELS) break
  }
  return models
}
