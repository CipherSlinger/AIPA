/**
 * The fallback engine's own API-error report.
 *
 * `cli:apiError` is emitted only by the legacy StreamBridge (the Codex bridge
 * reports its failures through `cli:turnError` / `cli:result`), so nothing here
 * has to arbitrate between engines. What it does have to arbitrate is the
 * difference between "the engine reported an error" and "the turn failed":
 * only a `cli:result` may make the second claim.
 *
 * Everything in this module is pure so the wave harness can exercise the
 * dedupe, clip and turn-end rules without Electron or React.
 */

/** The banner never grows past this many characters of the engine's text. */
export const MAX_API_ERROR_MESSAGE_CHARS = 320

export interface EngineApiErrorBanner {
  /**
   * Stable identity of the engine's report: its type/code plus the *full*
   * message. A retry loop that emits the same line repeatedly bumps
   * `repeats` instead of stacking identical banners.
   */
  id: string
  /** Verbatim engine text, clipped to {@link MAX_API_ERROR_MESSAGE_CHARS}. */
  message: string
  /** True when `message` is a prefix of what the engine said. */
  clipped: boolean
  /** The type/code the engine carried, verbatim; null when it carried none. */
  code: string | null
  /** How many times this identical report arrived since the banner appeared. */
  repeats: number
}

export type ApiErrorBannerEvent =
  | { type: 'api-error'; payload: unknown }
  /** A new turn is being sent: the previous turn's report no longer applies. */
  | { type: 'send' }
  /**
   * `cli:result` arrived. `resultIsError` says whether the turn's own result
   * claims failure — if so, that existing error treatment speaks for the turn
   * and this banner is cleared rather than left as a second claim.
   */
  | { type: 'turn-end'; resultIsError?: boolean }
  /** The user opened another conversation. */
  | { type: 'session-switch' }
  | { type: 'dismiss' }

export interface ParsedApiError {
  message: string
  code: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** A type is often a string, but a numeric protocol code is still a code. */
function rawCode(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * Read only fields the engine actually sent. `message` is never synthesized;
 * `errorType` is the legacy bridge's classification and `code`/`type` are
 * accepted for any newer payload shape. No cause is inferred from the text.
 */
export function parseApiErrorPayload(payload: unknown): ParsedApiError | null {
  const record = asRecord(payload)
  if (!record) return null
  const message = nonEmptyString(record.message) ?? ''
  const code = rawCode(record.code) ?? rawCode(record.errorType) ?? rawCode(record.type)
  if (!message && !code) return null
  return { message, code }
}

/** Clip at the cap and report that a cut happened; never silently shorten. */
export function clipApiErrorMessage(
  message: string,
  max = MAX_API_ERROR_MESSAGE_CHARS,
): { text: string; clipped: boolean } {
  if (message.length <= max) return { text: message, clipped: false }
  return { text: message.slice(0, max), clipped: true }
}

/**
 * The whole banner state machine.
 *
 * - `api-error` replaces a different report and collapses an identical one;
 * - `send`, `turn-end`, `session-switch` and `dismiss` clear it.
 *
 * `turn-end` deliberately ignores `resultIsError`: a success means the error
 * was transient and stale, and a failure is already spoken for by the result's
 * own error treatment. In neither case may this banner keep speaking.
 */
export function reduceApiErrorBanner(
  current: EngineApiErrorBanner | null,
  event: ApiErrorBannerEvent,
): EngineApiErrorBanner | null {
  if (event.type === 'api-error') {
    const parsed = parseApiErrorPayload(event.payload)
    if (!parsed) return current
    const signature = `${parsed.code ?? ''}\u0000${parsed.message}`
    if (current && current.id === signature) {
      return { ...current, repeats: current.repeats + 1 }
    }
    const { text, clipped } = clipApiErrorMessage(parsed.message)
    return {
      id: signature,
      message: text,
      clipped,
      code: parsed.code,
      repeats: 1,
    }
  }
  return null
}

/**
 * The turn's own result is the only thing allowed to call a turn failed.
 * Kept as a named rule so both the store and the harness can point at it.
 */
export function resultOwnsTurnFailure(resultIsError: boolean): boolean {
  return resultIsError
}
