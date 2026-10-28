/**
 * In-memory log of Codex item kinds that have no rich transcript row.
 *
 * Why not the chat store: this wave does not own `chatStore.ts`, and these
 * rows are renderer-side presentation of protocol items the engine chose not
 * to translate — they are not conversation messages (they must not affect
 * prompt history, title generation, memory extraction or message counts).
 * Keeping them in a small module-level log also means a turn that ends keeps
 * its rows on screen without pretending to persist them into the session
 * file.
 *
 * Buckets are keyed by `viewSessionId` (the conversation the user is looking
 * at, not the transient bridge id). A brand-new conversation has no id while
 * its first turn runs, so those steps live under the `null` bucket and are
 * adopted by the real thread id when `cli:result` announces it.
 *
 * Defensive behaviour:
 *   - `recordEngineStep` upserts by item id, so `started` + `completed` is one
 *     row and an item that never completes simply stays at `started` — no
 *     spinner, no stuck row.
 *   - buckets and steps are capped so a long-running app cannot grow this
 *     unboundedly.
 *   - every mutation copies the array before notifying, so
 *     `useSyncExternalStore` never sees a mutated snapshot.
 */
import type { EngineStep } from './engineStepText'

interface Bucket {
  steps: EngineStep[]
  turn: number
}

const MAX_STEPS_PER_BUCKET = 120
const MAX_BUCKETS = 24
/** Sentinel bucket for a conversation whose engine id is not known yet. */
const PENDING_KEY = ''
const EMPTY_STEPS: readonly EngineStep[] = Object.freeze([])

const buckets = new Map<string, Bucket>()
const listeners = new Set<() => void>()
let turnSeq = 0

function keyOf(sessionId: string | null | undefined): string {
  return sessionId ?? PENDING_KEY
}

function notify(): void {
  for (const listener of listeners) {
    try { listener() } catch { /* a broken subscriber must not break the stream */ }
  }
}

function ensureBucket(key: string): Bucket {
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { steps: [], turn: 0 }
    buckets.set(key, bucket)
    // Evict the oldest *inactive* bucket; the active one may still receive
    // completions. Map iteration order is insertion order.
    while (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next().value
      if (oldest === undefined || oldest === key) break
      buckets.delete(oldest)
    }
  }
  return bucket
}

/** Start a new grouping window after the engine reports `turn/started`. */
export function beginEngineTurn(sessionId: string | null | undefined): void {
  const bucket = ensureBucket(keyOf(sessionId))
  bucket.turn = ++turnSeq
}

/**
 * Append one item event. An id already in the bucket is updated in place: the
 * row keeps the position and timestamp of the first event, while the newest
 * descriptor (which may carry the result count, duration or richer kind) is
 * used. This is what makes `started` → `completed` a single row.
 */
export function recordEngineStep(
  sessionId: string | null | undefined,
  step: Omit<EngineStep, 'turn'>,
): void {
  const bucket = ensureBucket(keyOf(sessionId))
  const withTurn: EngineStep = { ...step, turn: bucket.turn }
  const idx = bucket.steps.findIndex(existing => existing.id === withTurn.id)

  if (idx >= 0) {
    const previous = bucket.steps[idx]
    const next = bucket.steps.slice()
    next[idx] = {
      ...withTurn,
      // Keep the event that introduced the row where it was introduced.
      timestamp: previous.timestamp,
      turn: previous.turn,
    }
    bucket.steps = next
  } else {
    const next = bucket.steps.length >= MAX_STEPS_PER_BUCKET
      ? bucket.steps.slice(bucket.steps.length - MAX_STEPS_PER_BUCKET + 1)
      : bucket.steps.slice()
    next.push(withTurn)
    bucket.steps = next
  }

  notify()
}

/**
 * Re-key the pending bucket once the engine announces the conversation id.
 * Existing rows are merged and re-sorted by the time the engine reported them.
 */
export function adoptEngineStepBucket(
  fromSessionId: string | null | undefined,
  toSessionId: string | null | undefined,
): void {
  const fromKey = keyOf(fromSessionId)
  const toKey = keyOf(toSessionId)
  if (fromKey === toKey) return
  const from = buckets.get(fromKey)
  if (!from) return

  const target = ensureBucket(toKey)
  const merged = [...target.steps]
  for (const step of from.steps) {
    if (!merged.some(existing => existing.id === step.id)) merged.push(step)
  }
  merged.sort((a, b) => a.timestamp - b.timestamp)
  target.steps = merged
  buckets.delete(fromKey)
  notify()
}

/** Forget one conversation's rows (used when a draft conversation is reset). */
export function clearEngineSteps(sessionId: string | null | undefined): void {
  if (buckets.delete(keyOf(sessionId))) notify()
}

/** Snapshot accessor for `useSyncExternalStore`; stable identity per bucket. */
export function getEngineSteps(sessionId: string | null | undefined): readonly EngineStep[] {
  return buckets.get(keyOf(sessionId))?.steps ?? EMPTY_STEPS
}

export function subscribeEngineSteps(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Test-only: drop every bucket and reset turn numbering. */
export function resetEngineStepLog(): void {
  buckets.clear()
  listeners.clear()
  turnSeq = 0
}
