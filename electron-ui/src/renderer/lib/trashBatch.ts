// Bulk restore / bulk delete for "Recently deleted", and the one statement that
// reports what happened.
//
// The holding area is a spring-clean surface: after a month of deleting, one
// batch is the normal gesture and clicking forty times is not. This module is
// the React-free core of that gesture. The per-row IPC calls are injected, so
// the same orchestration is used by the app (the callbacks that already answer
// for a single row) and by the harness (a fake that counts calls).
//
// Rules it enforces, because a batch is the easiest place to lie:
//   - every row is attempted exactly once, in the order the view shows them,
//     **sequentially**. A conversation restore is all-or-nothing per session and
//     two restores of the same session racing each other is not something main
//     is asked to arbitrate;
//   - an item is done only when its own call said so. A throw is a refusal with
//     no reason, never a success;
//   - a refused delete is reported as *still there*, never counted as gone;
//   - the headline is "done of total", so a batch of nine that brought back
//     eight cannot read like a clean sweep.
//
// It returns copy keys with params; the caller's `t` renders them. Nothing here
// knows the locale, React, or Electron.

import { TRASH_FILTER_KINDS } from './trashFilter'
import { trashRowKey } from './trashRows'
import type { TrashActionOutcome, TrashKind } from './trashRows'

export type TrashBatchAction = 'restore' | 'delete'

/** The part of a trash row a batch needs; the row itself carries more. */
export interface TrashBatchRow {
  kind: TrashKind
  id: string
  name: string
}

/** The per-row call, injected: the single-row path, or a fake in the harness. */
export type TrashBatchRunner<Row extends TrashBatchRow> =
  (row: Row) => Promise<TrashActionOutcome>

export interface TrashBatchItemResult {
  /** The row's selection key — `kind:id`, the same one the view uses. */
  key: string
  kind: TrashKind
  name: string
  ok: boolean
  /** The localized refusal sentence, or null when the runner gave none. */
  reason: string | null
  /** Restored, but the sidebar list could not be re-read afterwards. */
  listStale: boolean
}

/**
 * Run one row at a time. Sequential on purpose: the conversation restore is a
 * move of transcript files, and firing several at once would let two of them
 * touch the same session folder. Results are returned in the input order so the
 * report reads like the list the user was looking at.
 */
export async function runTrashBatch<Row extends TrashBatchRow>(
  rows: readonly Row[],
  run: TrashBatchRunner<Row>,
): Promise<TrashBatchItemResult[]> {
  const results: TrashBatchItemResult[] = []
  for (const row of rows) {
    const base = { key: trashRowKey(row), kind: row.kind, name: row.name }
    try {
      const outcome = await run(row)
      if (outcome.ok) {
        results.push({ ...base, ok: true, reason: null, listStale: outcome.listStale === true })
      } else {
        results.push({ ...base, ok: false, reason: outcome.message ?? null, listStale: false })
      }
    } catch {
      // A throw tells us nothing about what happened on disk, so it is reported
      // as a refusal without a reason. Counting it as done would be a guess.
      results.push({ ...base, ok: false, reason: null, listStale: false })
    }
  }
  return results
}

export interface TrashBatchKindCount {
  kind: TrashKind
  count: number
}

/** Rows per kind, in the filter's own order, zero-count kinds omitted. */
export function kindBreakdown(
  rows: readonly { kind: TrashKind }[],
): TrashBatchKindCount[] {
  const counts = new Map<TrashKind, number>()
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1)
  return TRASH_FILTER_KINDS
    .filter(kind => (counts.get(kind) ?? 0) > 0)
    .map(kind => ({ kind, count: counts.get(kind) as number }))
}

export type TrashBatchTone = 'success' | 'warning' | 'error'

export interface TrashBatchTally {
  total: number
  done: number
  failed: number
  /** At least one restored conversation could not be re-listed. */
  listStale: boolean
  /** Colour that matches the words: a lost item is never green. */
  tone: TrashBatchTone
  /** What was attempted, per kind. */
  kinds: TrashBatchKindCount[]
  /** One entry per refusal, in list order, with its own reason. */
  refusals: Array<{ key: string; kind: TrashKind; name: string; reason: string | null }>
}

export function tallyTrashBatch(results: readonly TrashBatchItemResult[]): TrashBatchTally {
  let done = 0
  let failed = 0
  let listStale = false
  for (const item of results) {
    if (item.ok) {
      done += 1
      if (item.listStale) listStale = true
    } else {
      failed += 1
    }
  }
  const tone: TrashBatchTone = failed === 0
    ? 'success'
    : (done > 0 ? 'warning' : 'error')
  return {
    total: results.length,
    done,
    failed,
    listStale,
    tone,
    kinds: kindBreakdown(results),
    refusals: results
      .filter(item => !item.ok)
      .map(item => ({ key: item.key, kind: item.kind, name: item.name, reason: item.reason })),
  }
}

export interface TrashBatchLine {
  key: string
  params: Record<string, string | number>
}

export interface TrashBatchReport {
  tone: TrashBatchTone
  /** [headline, refusal heading?, ...one line per refusal, list-stale note?] */
  lines: TrashBatchLine[]
}

// Explicit maps instead of template strings: the keys stay greppable, and the
// harness checks that every one of them exists in both locales.
export const TRASH_RESULT_HEADLINE: Record<TrashBatchAction, string> = {
  restore: 'trashBulk.result.restore',
  delete: 'trashBulk.result.delete',
}

export const TRASH_REFUSED_HEADING: Record<TrashBatchAction, string> = {
  restore: 'trashBulk.refused.restore',
  delete: 'trashBulk.refused.delete',
}

const REFUSAL_LINE_KEY = 'trashBulk.refusalLine'
const REFUSAL_NO_REASON_KEY = 'trashBulk.refusalNoReason'
const LIST_STALE_KEY = 'trashBulk.listStale'

/**
 * One honest statement for the whole batch.
 *
 * The headline is always "done of total". Each refusal then gets its own line
 * with its own reason — a batch of twenty is exactly the case where folding
 * three different refusals into one generic sentence would leave the user
 * without the one thing they need to fix.
 */
export function describeTrashBatch(
  action: TrashBatchAction,
  tally: TrashBatchTally,
): TrashBatchReport {
  const lines: TrashBatchLine[] = [{
    key: TRASH_RESULT_HEADLINE[action],
    params: { done: tally.done, total: tally.total },
  }]
  if (tally.failed > 0) {
    lines.push({ key: TRASH_REFUSED_HEADING[action], params: { count: tally.failed } })
    for (const refusal of tally.refusals) {
      lines.push({
        key: refusal.reason === null ? REFUSAL_NO_REASON_KEY : REFUSAL_LINE_KEY,
        params: refusal.reason === null
          ? { name: refusal.name }
          : { name: refusal.name, reason: refusal.reason },
      })
    }
  }
  if (tally.listStale) lines.push({ key: LIST_STALE_KEY, params: {} })
  return { tone: tally.tone, lines }
}
