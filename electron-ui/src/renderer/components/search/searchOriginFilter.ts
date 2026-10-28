// Origin and origin filtering for global search results.
//
// `session:search` returns transcript hits without an origin, and widening that
// IPC shape would duplicate a fact the session store already knows. Each hit's
// `sessionId` is matched against the listed sessions instead. A hit whose
// session is not in that listing is "unknown", never "started by the user":
// the search index can remember transcripts the sidebar does not currently
// show, and the filter must not put those in the user's own bucket.
//
// Everything here is a pure derivation over the results the hook already
// returned. Filtering is deliberately client-side: it must never start a scan
// (that would race `useGlobalSessionSearch`'s sequencing) and must not depend
// on when a response lands.

import type { SessionOrigin } from '../../types/app.types'

/** Same vocabulary as the archive's origin pills. */
export type SearchOriginFilter = 'all' | 'user' | 'automation' | 'plugin'

/** What one result can be. `unknown` is a real answer, not a fourth badge. */
export type SearchOriginKind = Exclude<SearchOriginFilter, 'all'> | 'unknown'

export const SEARCH_ORIGIN_FILTERS: readonly SearchOriginFilter[] = [
  'all',
  'user',
  'automation',
  'plugin',
]

export interface SessionOriginSource {
  sessionId: string
  origin?: SessionOrigin
}

/**
 * Session id -> origin. A missing key (not an `undefined` value) is what
 * separates "the user started it" from "we do not know".
 */
export type SessionOriginMap = ReadonlyMap<string, SessionOrigin | undefined>

export function buildSessionOriginMap(
  sessions: ReadonlyArray<SessionOriginSource>,
): SessionOriginMap {
  const map = new Map<string, SessionOrigin | undefined>()
  for (const session of sessions) map.set(session.sessionId, session.origin)
  return map
}

/** The badge's input; `undefined` renders nothing for both user and unknown. */
export function searchResultOrigin(
  sessionId: string,
  origins: SessionOriginMap,
): SessionOrigin | undefined {
  return origins.get(sessionId)
}

export function searchResultOriginKind(
  sessionId: string,
  origins: SessionOriginMap,
): SearchOriginKind {
  if (!origins.has(sessionId)) return 'unknown'
  return origins.get(sessionId)?.kind ?? 'user'
}

export interface FilteredSearchResults<T> {
  visible: T[]
  /** How many of the current results the active filter is keeping out. */
  hidden: number
  /** Totals for the current result set, unknown included under its own key. */
  counts: Record<SearchOriginKind, number>
}

export function filterResultsByOrigin<T extends { sessionId: string }>(
  results: ReadonlyArray<T>,
  origins: SessionOriginMap,
  filter: SearchOriginFilter,
): FilteredSearchResults<T> {
  const counts: Record<SearchOriginKind, number> = {
    user: 0,
    automation: 0,
    plugin: 0,
    unknown: 0,
  }
  const visible: T[] = []
  for (const result of results) {
    const kind = searchResultOriginKind(result.sessionId, origins)
    counts[kind] += 1
    // `unknown` matches only All; treating it as `user` here would silently
    // turn a missing listing entry into a claim about who started the session.
    if (filter === 'all' || kind === filter) visible.push(result)
  }
  return { visible, hidden: results.length - visible.length, counts }
}

/**
 * A filter is a choice about one query's result set. Carrying it across a new
 * query could hide every fresh hit for a reason the user cannot see, so a
 * changed query starts at All. Comparing trimmed text keeps a trailing space
 * from discarding a filter that still describes the same results.
 */
export function originFilterForQuery(
  previousQuery: string,
  nextQuery: string,
  filter: SearchOriginFilter,
): SearchOriginFilter {
  return previousQuery.trim() === nextQuery.trim() ? filter : 'all'
}

/**
 * True only when the search itself found hits and the origin filter hid all of
 * them. When the search found nothing, the ordinary empty copy stays — the
 * filter is not to blame.
 */
export function isOriginFilterEmpty(
  totalResults: number,
  visibleResults: number,
  filter: SearchOriginFilter,
): boolean {
  return filter !== 'all' && totalResults > 0 && visibleResults === 0
}
