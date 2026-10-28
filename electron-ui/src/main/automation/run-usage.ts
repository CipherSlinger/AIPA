/**
 * Token and cost accounting for one automation run.
 *
 * A scheduled run is invisible: nobody watches it spend. The engines already
 * report what a turn used, so the runner only has to fold those reports into a
 * per-run total, and the scheduler adds that total to the job's lifetime
 * figures.
 *
 * Two rules keep the numbers honest:
 *   - Only what an engine actually reported is recorded. Codex reports no
 *     money, so a Codex job has no cost at all; a provider-routed Claude turn
 *     may omit `total_cost_usd` too. Nothing is estimated from token counts.
 *   - A zeroed usage event is not a usage report. Codex emits one before its
 *     first request completes (the bridge drops it), and an empty turn must not
 *     put `0 tok` on a settings row.
 *
 * Pure and Electron-free so the accumulation rules can be exercised by
 * `.scratch/wave13-usage-harness` without a bridge or a window.
 */

export interface RunUsage {
  /** Prompt tokens billed for this run (cache reads are reported separately). */
  inputTokens: number
  outputTokens: number
  /** Cache read + cache write tokens, when the engine reported either. */
  cachedInputTokens?: number
  /** Money in USD exactly as the engine reported it, never an estimate. */
  costUsd?: number
}

/** One turn as an engine reports it; both engines omit pieces. */
export interface TurnUsage {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  costUsd?: number
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Token counts are non-negative integers; anything else is not a report. */
function tokenCount(value: unknown): number | undefined {
  const n = finite(value)
  return n === undefined || n < 0 ? undefined : Math.floor(n)
}

/** Costs keep fractional precision; a negative amount is not a report. */
function costValue(value: unknown): number | undefined {
  const n = finite(value)
  return n === undefined || n < 0 ? undefined : n
}

/**
 * Parse one bridge `usage` object (the snake_case shape both engines share)
 * plus an optional cost from the same event.
 *
 * Returns undefined when the event carries nothing: a turn that reports neither
 * tokens nor money must leave the accumulator untouched.
 */
export function readTurnUsage(usage: unknown, costUsd?: unknown): TurnUsage | undefined {
  const raw = usage && typeof usage === 'object' ? usage as Record<string, unknown> : undefined
  const input = tokenCount(raw?.input_tokens)
  const output = tokenCount(raw?.output_tokens)
  const cacheRead = tokenCount(raw?.cache_read_input_tokens)
  const cacheWrite = tokenCount(raw?.cache_creation_input_tokens)
  // The two cache counters are separate fields in both protocols; the row
  // shows them as one "cached" figure. Both reported as zero means the engine
  // had no cache to report — not a cached count worth carrying on the row.
  const cachedTotal = (cacheRead ?? 0) + (cacheWrite ?? 0)
  const cached = cachedTotal > 0 ? cachedTotal : undefined
  const cost = costValue(costUsd)

  if ((input ?? 0) + (output ?? 0) + (cached ?? 0) === 0 && !cost) return undefined

  return {
    ...(input !== undefined ? { inputTokens: input } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
    ...(cached !== undefined ? { cachedInputTokens: cached } : {}),
    ...(cost !== undefined ? { costUsd: cost } : {}),
  }
}

/**
 * Folds one turn at a time into a run total.
 *
 * Snapshots, not deltas: each engine hands us a turn's own usage, so adding is
 * correct. Codex's `tokenUsageUpdated` fires repeatedly inside a single turn;
 * the runner keeps only the latest snapshot and calls `add` once per turn, which
 * is why this class does not try to dedupe repeated events.
 */
export class RunUsageAccumulator {
  private inputTokens = 0
  private outputTokens = 0
  private cachedInputTokens: number | undefined
  private costUsd: number | undefined

  add(turn: TurnUsage | undefined): void {
    if (!turn) return
    if (turn.inputTokens !== undefined) this.inputTokens += turn.inputTokens
    if (turn.outputTokens !== undefined) this.outputTokens += turn.outputTokens
    if (turn.cachedInputTokens !== undefined) {
      this.cachedInputTokens = (this.cachedInputTokens ?? 0) + turn.cachedInputTokens
    }
    if (turn.costUsd !== undefined) this.costUsd = (this.costUsd ?? 0) + turn.costUsd
  }

  total(): RunUsage | undefined {
    // A cost-only run still has a figure worth showing even though its token
    // fields are zero; only a completely empty accumulator reports nothing.
    if (
      this.inputTokens === 0 &&
      this.outputTokens === 0 &&
      this.cachedInputTokens === undefined &&
      this.costUsd === undefined
    ) {
      return undefined
    }
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      ...(this.cachedInputTokens !== undefined ? { cachedInputTokens: this.cachedInputTokens } : {}),
      ...(this.costUsd !== undefined ? { costUsd: this.costUsd } : {}),
    }
  }
}

export interface LifetimeUsageTotals {
  totalTokens?: number
  totalCostUsd?: number
}

/**
 * Add one run's reported spend to a job's lifetime figures.
 *
 * Kept here rather than inline in the scheduler so the "never write 0 for an
 * unreported figure" rules have one tested home:
 *   - tokens only move when the run actually reported some;
 *   - cost only moves when the engine reported one, and a job whose engines
 *     never report money stays without a cost instead of showing `$0`.
 */
export function addToLifetimeTotals(
  totals: LifetimeUsageTotals,
  usage: RunUsage | undefined,
): LifetimeUsageTotals {
  let totalTokens = totals.totalTokens
  let totalCostUsd = totals.totalCostUsd
  if (usage) {
    // Cache reads are reported separately in the tooltip; rolling them into
    // the lifetime count would make the row look far larger than the
    // conversation it read.
    const tokens = usage.inputTokens + usage.outputTokens
    if (tokens > 0) totalTokens = (totalTokens ?? 0) + tokens
    if (usage.costUsd !== undefined) totalCostUsd = (totalCostUsd ?? 0) + usage.costUsd
  }
  return { totalTokens, totalCostUsd }
}

/** Validate a persisted cumulative token count; absence stays absent. */
export function normalizeTokenCount(value: unknown): number | undefined {
  return tokenCount(value)
}

/**
 * Validate a persisted cumulative cost.
 *
 * A reported `0` is kept (it is a real report), but a missing or invalid value
 * stays undefined rather than turning into `$0`, so the row can omit a cost the
 * engine never charged.
 */
export function normalizeCost(value: unknown): number | undefined {
  return costValue(value)
}

/** Restore one persisted `lastUsage`; a malformed record is dropped whole. */
export function normalizeRunUsage(value: unknown): RunUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const input = tokenCount(raw.inputTokens)
  const output = tokenCount(raw.outputTokens)
  // Both are required on the persisted shape. A partially written record cannot
  // be repaired into something truthful, so treat it as absent.
  if (input === undefined || output === undefined) return undefined
  const cached = tokenCount(raw.cachedInputTokens)
  const cost = costValue(raw.costUsd)
  return {
    inputTokens: input,
    outputTokens: output,
    ...(cached !== undefined ? { cachedInputTokens: cached } : {}),
    ...(cost !== undefined ? { costUsd: cost } : {}),
  }
}
