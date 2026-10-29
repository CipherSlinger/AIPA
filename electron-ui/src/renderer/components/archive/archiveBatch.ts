// The outcome of a bulk action on the archive, and the one sentence that reports it.
//
// A bulk action is never allowed to look like a clean sweep when it was not.
// Every row gets exactly one of three fates — done, skipped (the action did not
// apply and nothing changed), failed (the system refused) — and a refusal is
// never folded into "done". The panel calls this once per batch so N rows
// produce one toast, not N competing ones.
//
// Decision for partial applicability: **skip and count afterwards**, never
// refuse up front and never half-apply silently. The buttons already count only
// the rows they can act on and their tooltip names what will be left behind;
// the toast then reports `done of total` plus a counted note for the skips.
//
// The module is deliberately free of React and i18n: it returns copy *keys*
// with params, and `batchMessageText` joins them through the caller's `t`.

export type BatchKind = 'archive' | 'unarchive' | 'delete' | 'restore'

export type BatchStatus = 'done' | 'skipped' | 'failed'

/**
 * Why a row was not done. Skips are self-explanatory state mismatches; failures
 * are the trash's own refusal codes, grouped into the few sentences the user
 * can act on.
 */
export type BatchReason =
  | 'alreadyArchived'
  | 'notArchived'
  | 'gone'
  | 'occupied'
  | 'folderGone'
  | 'missing'
  | 'other'

export interface BatchItemResult {
  status: BatchStatus
  reason?: BatchReason
}

export interface BatchReasonCount {
  reason: BatchReason
  count: number
}

export type BatchTone = 'success' | 'warning' | 'error'

export interface BatchTally {
  total: number
  done: number
  skipped: number
  failed: number
  /** Skip reasons, most common first. */
  skippedReasons: BatchReasonCount[]
  /** Failure reasons, most common first. */
  failedReasons: BatchReasonCount[]
  /**
   * A batch that lost anything is never 'success', and a batch where nothing
   * was done is never 'warning': the colour has to match the words.
   */
  tone: BatchTone
}

function countReasons(results: readonly BatchItemResult[], status: BatchStatus): BatchReasonCount[] {
  const counts = new Map<BatchReason, number>()
  for (const item of results) {
    if (item.status !== status) continue
    const reason = item.reason ?? 'other'
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    // Stable order: count first, then the reason name, so two runs of the same
    // batch always produce the same sentence.
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

export function tallyBatch(results: readonly BatchItemResult[]): BatchTally {
  let done = 0
  let skipped = 0
  let failed = 0
  for (const item of results) {
    if (item.status === 'done') done += 1
    else if (item.status === 'skipped') skipped += 1
    else failed += 1
  }
  const tone: BatchTone = failed > 0
    ? (done > 0 ? 'warning' : 'error')
    : (skipped > 0 ? 'warning' : 'success')
  return {
    total: results.length,
    done,
    skipped,
    failed,
    skippedReasons: countReasons(results, 'skipped'),
    failedReasons: countReasons(results, 'failed'),
    tone,
  }
}

export interface ArchiveTogglePlan {
  /** Rows whose archived flag actually changes. */
  apply: string[]
  /** Rows already in the requested state — left untouched, counted after. */
  skipped: string[]
  /** Why the skipped rows were skipped. */
  reason: BatchReason
}

/**
 * Split a selection into "will change" and "already there". The UI counts the
 * first group on the button and names the second in the tooltip, so the user
 * knows before clicking that the click is not a blanket operation.
 */
export function planArchiveToggle(
  ids: readonly string[],
  archivedIds: ReadonlySet<string>,
  archive: boolean,
): ArchiveTogglePlan {
  const apply: string[] = []
  const skipped: string[] = []
  for (const id of ids) {
    if (archivedIds.has(id) === archive) skipped.push(id)
    else apply.push(id)
  }
  return { apply, skipped, reason: archive ? 'alreadyArchived' : 'notArchived' }
}

/**
 * Map a `session:delete` refusal to the sentence the batch will report. A
 * missing conversation is not the same as a taken place.
 */
export function classifyDeleteFailure(code: string | undefined): BatchReason {
  switch (code) {
    case 'not_found': return 'missing'
    case 'target_exists': return 'occupied'
    default: return 'other'
  }
}

/** Map a `session:trash:restore` refusal to the same vocabulary. */
export function classifyRestoreFailure(code: string | undefined): BatchReason {
  switch (code) {
    case 'not_found': return 'gone'
    case 'target_exists': return 'occupied'
    case 'folder_missing':
    case 'outside_sessions':
    case 'outside_trash': return 'folderGone'
    default: return 'other'
  }
}

// Explicit maps instead of template strings: the keys stay greppable, and the
// harness can check that every one of them exists in both locales.
export const BATCH_HEADLINE_KEYS: Record<BatchKind, string> = {
  archive: 'archive.bulk.result.archive',
  unarchive: 'archive.bulk.result.unarchive',
  delete: 'archive.bulk.result.delete',
  restore: 'archive.bulk.result.restore',
}

const BATCH_SKIP_KEYS: Record<BatchKind, string> = {
  archive: 'archive.bulk.note.alreadyArchived',
  unarchive: 'archive.bulk.note.notArchived',
  delete: 'archive.bulk.note.skipped',
  restore: 'archive.bulk.note.skipped',
}

const NOTE_FAILED_KEY = 'archive.bulk.note.reason'
const NOTE_LIST_STALE_KEY = 'archive.bulk.note.listStale'

export interface BatchMessagePart {
  key: string
  params: Record<string, string | number>
}

export interface BatchMessage {
  tone: BatchTone
  /** [headline, ...notes] — joined into ONE toast by the caller. */
  parts: BatchMessagePart[]
}

export type BatchReasonText = (reason: BatchReason) => string

/**
 * One honest statement for the whole batch.
 *
 * The headline always reads "done of total" — never a bare success word — so a
 * batch that restored 8 of 9 says exactly that. Each distinct failure reason
 * gets one note; the caller still emits a single toast.
 */
export function describeBatch(
  kind: BatchKind,
  tally: BatchTally,
  reasonText: BatchReasonText,
): BatchMessage {
  const parts: BatchMessagePart[] = [{
    key: BATCH_HEADLINE_KEYS[kind],
    params: { done: tally.done, total: tally.total },
  }]
  if (tally.skipped > 0) {
    parts.push({ key: BATCH_SKIP_KEYS[kind], params: { count: tally.skipped } })
  }
  for (const entry of tally.failedReasons) {
    parts.push({
      key: NOTE_FAILED_KEY,
      params: { count: entry.count, reason: reasonText(entry.reason) },
    })
  }
  return { tone: tally.tone, parts }
}

/** Append the "list could not be refreshed" note after a restore batch. */
export function appendListStaleNote(message: BatchMessage): BatchMessage {
  if (message.parts.some(part => part.key === NOTE_LIST_STALE_KEY)) return message
  return { ...message, parts: [...message.parts, { key: NOTE_LIST_STALE_KEY, params: {} }] }
}

/** Join the parts through i18n. One call per batch, one toast per batch. */
export function batchMessageText(
  t: (key: string, params?: Record<string, string | number>) => string,
  message: BatchMessage,
): string {
  return message.parts.map(part => t(part.key, part.params)).join(' ')
}
