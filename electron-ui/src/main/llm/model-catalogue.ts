/**
 * Live model discovery for the app's API key.
 *
 * The provider subsystem is gone: one key is the only credential the app has,
 * so which models it can actually run is a fact only the API's own account
 * knows. The built-in catalogue in `plugin-services.ts` is a fallback for an
 * offline start; here we ask the key instead of guessing from a hard-coded
 * list that ages with every model release.
 *
 * A key's endpoint is not necessarily Anthropic's own host: the Base URL field
 * accepts an OpenAI-compatible relay too. Both APIs expose their list at
 * `/models` under a `/v1` prefix, but they authenticate differently, so the
 * request is tried as Anthropic first and, only when the endpoint answers as if
 * it does not speak that protocol, once more in OpenAI-compatible style.
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
const MAX_MODEL_ID_LENGTH = 200

/**
 * Statuses that mean "this endpoint does not serve the protocol just spoken",
 * not "the key is wrong" or "come back later". An OpenAI-compatible relay
 * answers an Anthropic-shaped request with one of these (404 is the reported
 * case), so they are also the statuses worth a single retry in the other
 * protocol. 429 and 5xx are deliberately absent: they mean the request was
 * understood and the service is busy, which another protocol cannot fix.
 */
const PROTOCOL_MISMATCH_STATUSES = new Set([400, 401, 403, 404, 405])

/** What one models request produced when it did not produce a models list. */
interface AttemptFailure {
  /** HTTP status, or null when the request never got a response. */
  status: number | null
  /** True when this attempt's own timeout aborted it. */
  timedOut: boolean
  /** The API's own error.message/type — never headers or the raw body. */
  detail: string
  /** A 2xx answer whose body was not JSON at all. */
  unreadableBody: boolean
}

type AttemptResult = { rows: unknown[] } | { failure: AttemptFailure }

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
 * The models URL for a normalized base. A base that already names the API
 * version (`…/v1`, trailing slash already stripped) is the full prefix; only a
 * host root needs `/v1` appended. Never produces `/v1/v1/models`.
 *
 * OpenAI-compatible and Anthropic endpoints share this join: both list models
 * under `/v1/models`, so `https://host`, `https://host/` and `https://host/v1`
 * all resolve to `https://host/v1/models`, while `https://host/gw/v1` resolves
 * to `https://host/gw/v1/models`.
 */
function modelsUrl(base: string): string {
  return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`
}

/**
 * Whether a failed Anthropic-style attempt should be retried once as
 * OpenAI-compatible. One place for the rule, so "wrong protocol" cannot grow a
 * second definition at a call site.
 */
export function isModelsProtocolMismatch(status: number | null, unreadableBody: boolean): boolean {
  // No response at all (refused, DNS, timeout): no protocol was spoken, and a
  // differently shaped request would fail the same way.
  if (status === null) return false
  // A 2xx that is not JSON is usually a login page or a plain-text gateway
  // error — that endpoint is not serving the models API in this protocol.
  return unreadableBody || PROTOCOL_MISMATCH_STATUSES.has(status)
}

/**
 * One request to a models endpoint, with its own AbortController and timeout.
 * Two attempts must never share a controller: aborting the first would abort
 * the retry too, and the timer would be cleared by whichever finished first.
 */
async function runModelsAttempt(url: string, headers: Record<string, string>): Promise<AttemptResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    // net.fetch rather than global fetch: it uses Chromium's network stack, so
    // a system proxy that already lets the CLI reach the API is honoured here
    // too (a common setup behind corporate or regional proxies).
    res = await net.fetch(url, { headers, signal: controller.signal })
  } catch {
    // The thrown error can carry the request URL but never the key (it lives in
    // a header); the failure is described by our own wording anyway.
    return { failure: { status: null, timedOut: controller.signal.aborted, detail: '', unreadableBody: false } }
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
    return { failure: { status: res.status, timedOut: false, detail, unreadableBody: false } }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { failure: { status: res.status, timedOut: false, detail: '', unreadableBody: true } }
  }

  // A body without a `data` array is treated as an empty list, not a failure:
  // an account may legitimately have no models, and reporting that as a
  // protocol mismatch would send a valid Anthropic endpoint through a retry it
  // does not need.
  const rows = body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
    ? (body as { data: unknown[] }).data
    : []
  return { rows }
}

/**
 * Anthropic Models API rows → ids the Claude CLI can actually run. `claude`
 * only: the same key can list endpoint-specific entries, and the CLI can only
 * run Claude models.
 */
function claudeModelRows(rows: unknown[]): AvailableModel[] {
  const seen = new Set<string>()
  const models: AvailableModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const { id, display_name: displayName } = row as { id?: unknown; display_name?: unknown }
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

/**
 * OpenAI-compatible rows → whatever that endpoint serves. No `claude` filter
 * here: the relay may list `gpt-4o`, `deepseek-chat` and so on, and the picker
 * is exactly where the user chooses between them.
 */
function openAiCompatibleModelRows(rows: unknown[]): AvailableModel[] {
  const seen = new Set<string>()
  const models: AvailableModel[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const { id, name, display_name: displayName } = row as { id?: unknown; name?: unknown; display_name?: unknown }
    if (typeof id !== 'string') continue
    const modelId = id.trim()
    // A models list is a list of ids that can be handed to an engine as
    // `--model`. Anything empty, absurdly long or containing whitespace is not
    // one, and is more likely a label or prose than a model id.
    if (!modelId || modelId.length > MAX_MODEL_ID_LENGTH || /\s/.test(modelId)) continue
    if (seen.has(modelId)) continue
    seen.add(modelId)
    const label = [displayName, name].find((value): value is string => typeof value === 'string' && value.trim() !== '')
    models.push({ id: modelId, name: label ? label.trim() : modelId })
    if (models.length >= MAX_MODELS) break
  }
  return models
}

/** Today's error wording, for the one-protocol request. */
function describeAnthropicFailure(failure: AttemptFailure): Error {
  if (failure.status === null) {
    return new Error(failure.timedOut
      ? `Anthropic API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : 'Anthropic API request failed')
  }
  if (failure.unreadableBody) {
    return new Error(`Anthropic API returned ${failure.status}: unreadable response`)
  }
  return new Error(`Anthropic API returned ${failure.status}${failure.detail ? `: ${failure.detail}` : ''}`)
}

/** A short, status-only description used in the two-protocol message. */
function statusPhrase(failure: AttemptFailure): string {
  if (failure.status === null) return failure.timedOut ? '超时' : '无法连接'
  if (failure.unreadableBody) return `返回了无法解析的 ${failure.status} 响应`
  return `返回 ${failure.status}`
}

/**
 * Both protocols failed. The message names both attempts, because reporting
 * only the first status is what made the OpenAI-relay case read as "the key is
 * bad"; it stays short enough for a toast and carries no key, header or body.
 */
function describeBothProtocolsFailed(anthropic: AttemptFailure, openAi: AttemptFailure): Error {
  if (anthropic.status !== null && anthropic.status === openAi.status) {
    if (anthropic.unreadableBody) {
      return new Error(`[models_api] 模型接口返回 ${anthropic.status}，但响应无法解析：Anthropic 与 OpenAI 兼容两种格式都不认`)
    }
    return new Error(`[models_api] 模型接口返回 ${anthropic.status}：Anthropic 与 OpenAI 兼容两种协议都不接受`)
  }
  return new Error(`[models_api] 模型接口拒绝了两种协议（Anthropic ${statusPhrase(anthropic)}，OpenAI 兼容 ${statusPhrase(openAi)}）`)
}

/**
 * Ask the key's endpoint which models `apiKey` may use.
 *
 * `baseUrl` is the key's own endpoint (relay / proxy / self-hosted gateway);
 * absent means the official host, in which case only the Anthropic protocol is
 * attempted exactly as before. With an explicit endpoint, an Anthropic-shaped
 * request comes first; a "wrong protocol" answer is retried once with
 * `Authorization: Bearer …` and without the `claude` filter, because the host
 * may serve any model family.
 *
 * The key travels only in a request header. It must never appear in an error
 * message or a log line, so failures are reported by HTTP status and the API's
 * own `error.message` — never the request headers or the raw body.
 */
export async function fetchAnthropicModels(apiKey: string, baseUrl?: string): Promise<AvailableModel[]> {
  const hasExplicitBase = (baseUrl ?? '').trim() !== ''
  const base = normalizeAnthropicBaseUrl(baseUrl)
  const url = modelsUrl(base)

  // The explicit endpoint may be either flavour, so the first attempt is always
  // Anthropic's: on a real Anthropic relay this is the only request made.
  const first = await runModelsAttempt(`${url}?limit=${MAX_MODELS}`, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    accept: 'application/json',
  })
  let firstFailure: AttemptFailure | null = null
  if ('failure' in first) {
    firstFailure = first.failure
    // Without an explicit endpoint there is nothing to retry against: the
    // official host defines the protocol. Any non-mismatch failure is likewise
    // surfaced directly — retrying would only repeat it.
    if (!hasExplicitBase || !isModelsProtocolMismatch(firstFailure.status, firstFailure.unreadableBody)) {
      throw describeAnthropicFailure(firstFailure)
    }
  } else {
    const claudeModels = claudeModelRows(first.rows)
    // A relay that ignores `x-api-key` can answer 200 with an OpenAI-shaped list
    // whose ids are not Claude models. That is a wrong-protocol success, not an
    // empty account, so it earns the same single retry as a 404 would — but only
    // when the body actually carried rows; a genuinely empty list is left alone.
    if (!hasExplicitBase || first.rows.length === 0 || claudeModels.length > 0) return claudeModels
  }

  // Same URL as the first attempt (both APIs list under `/v1/models`); only the
  // credential header and the id filter change. The retry gets its own
  // controller and 10 s timeout.
  const retry = await runModelsAttempt(url, {
    authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  })
  if (!('failure' in retry)) return openAiCompatibleModelRows(retry.rows)

  if (firstFailure) throw describeBothProtocolsFailed(firstFailure, retry.failure)
  // The first attempt succeeded but listed nothing this app can run; only the
  // OpenAI-compatible retry actually failed.
  throw new Error(`[models_api] 模型接口返回的列表里没有可用模型，OpenAI 兼容方式${statusPhrase(retry.failure)}`)
}
