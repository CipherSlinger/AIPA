// archiveAskScope — the snapshot of "the rows I can see" that the archive hands
// to the global ask overlay.
//
// The archive is a filtered ledger: department, time, origin, job, archived,
// hand-filed and free text can all change between one render and the next. The
// overlay cannot re-run those filters — it does not own them, and the rows it
// would need may already sit outside whatever it could load itself. The only
// honest scope is therefore the session ids captured at click time. This module
// keeps that snapshot pure and testable, and keeps the 500-id cap visible
// *where the user picks the rows*: the main process trims a longer scope
// silently, and a silent trim would let the button promise conversations the
// question never reads.
//
// React-free on purpose: the label/tooltip and the click handler all describe
// the same list, so the list has to be computable outside a component.

import type { ArchiveAskScopeSeed } from '../../store/uiStore'

/**
 * The main process reads at most this many sessions per scoped question. A
 * longer list is trimmed there without an error, so the archive caps here where
 * the omission can be disclosed before the user asks.
 */
export const MAX_ARCHIVE_ASK_SCOPE = 500

/** Only the shape the collector needs: one listing row per visible record. */
interface AskScopeRow {
  session: { sessionId: string }
}

/**
 * Snapshot the visible rows into the scope the overlay asks within.
 *
 * Order is the listing order and is never sorted: the user is looking at that
 * order, and the overlay reports matches in it. A session id repeated across
 * listing rows (the transcript listing can repeat a conversation) is still one
 * conversation, so the first occurrence wins and `total` counts it once. Blank
 * ids are dropped because they name no conversation and would only make the
 * main process skip an entry after the cap has already been applied.
 *
 * The cap applies last, so `total` stays the honest count of what is on screen;
 * `truncated` compares the result against `total`, not the input length, so a
 * cap larger than the listing never reports a phantom omission. An empty
 * listing is a real empty scope — the button is disabled in that case, and this
 * function still answers `{ [], 0, false }` rather than treating empty as an
 * error.
 */
export function collectAskScope(
  records: readonly AskScopeRow[],
  cap: number = MAX_ARCHIVE_ASK_SCOPE,
): ArchiveAskScopeSeed {
  const seen = new Set<string>()
  const distinct: string[] = []
  for (const record of records) {
    const id = record?.session?.sessionId
    if (typeof id !== 'string' || id.trim().length === 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    distinct.push(id)
  }
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0
  const sessionIds = distinct.slice(0, limit)
  return {
    sessionIds,
    total: distinct.length,
    truncated: distinct.length > sessionIds.length,
  }
}

/**
 * Which label key the button uses. The i18n helper substitutes `{{params}}`
 * only, with no plural machinery, so a count of one picks its own key — the
 * same rule the archive summary already follows.
 */
export function askScopeLabelKey(count: number): string {
  return count === 1 ? 'archive.askScope.buttonOne' : 'archive.askScope.button'
}

/** How many listed conversations the cap left out. */
export function askScopeOmitted(scope: ArchiveAskScopeSeed): number {
  return Math.max(0, scope.total - scope.sessionIds.length)
}
