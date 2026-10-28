/**
 * Ranking for "related past conversations".
 *
 * Several search terms are run against both transcript indexes, so one session
 * can arrive more than once: once per term, and once per engine. This module
 * folds those hits into one row per session and orders the rows by how much of
 * the open conversation they actually share.
 *
 * The ranking is lexical: a row is here because it contains the same words, not
 * because it is about the same thing. The UI says so; nothing in this file
 * claims otherwise.
 *
 * Pure on purpose — no fs, no Electron, no reader imports — so the harness can
 * exercise every rule directly.
 */
import type { SearchResult } from './search-types'

/** How many related conversations the popover shows at most. */
export const RELATED_DEFAULT_LIMIT = 4
/** Shared words shown per row; the rest still count toward `termsHit`. */
export const RELATED_MAX_TERMS_SHOWN = 3

export interface RelatedMatch {
  term: string
  hit: SearchResult
}

export interface RelatedRow {
  sessionId: string
  title: string
  project: string
  engine: 'claude' | 'codex'
  timestamp: number
  matchType: 'title' | 'content'
  /** Distinct query terms this session matched. */
  termsHit: number
  /** First few matched terms, in first-match order. */
  matchedTerms: string[]
}

interface SessionGroup {
  hit: SearchResult
  sessionId: string
  terms: Set<string>
}

/**
 * Fold `matches` into one row per session and rank them.
 *
 * Ordering:
 *   1. more distinct terms matched first — sharing three words is stronger
 *      evidence than sharing one;
 *   2. then the newer session — a tie on terms is broken by recency;
 *   3. then sessionId ascending — so the same input always renders in the same
 *      order, which keeps React keys and list positions stable.
 *
 * A title-only hit and a content hit from the same session collapse into one
 * row. The content hit represents it when both exist (it has prose, and its
 * timestamp points at a real match), mirroring `rankHistoryHits`. The
 * preference rule is re-implemented here rather than imported: importing that
 * module would drag the readers, the index and Electron into a function that
 * must stay pure. The duplication is the price of purity.
 */
export function rankRelatedMatches(
  matches: RelatedMatch[],
  opts: { excludeSessionId?: string; limit?: number } = {},
): RelatedRow[] {
  // Exact, trimmed comparison. Session ids are opaque: never case-folded (two
  // ids may differ only by case) and never matched by title or project, both of
  // which are display text that several sessions can share.
  const excluded = typeof opts.excludeSessionId === 'string'
    ? opts.excludeSessionId.trim()
    : ''

  const bySession = new Map<string, SessionGroup>()

  for (const match of matches) {
    if (!match || typeof match.term !== 'string') continue
    const term = match.term.trim()
    if (!term) continue
    const hit = match.hit
    if (!hit || typeof hit.sessionId !== 'string') continue

    const sessionId = hit.sessionId.trim()
    if (!sessionId) continue
    if (excluded && sessionId === excluded) continue

    const existing = bySession.get(sessionId)
    if (!existing) {
      bySession.set(sessionId, { hit, sessionId, terms: new Set([term]) })
      continue
    }

    existing.terms.add(term)
    // A content hit always wins over a title-only one: a title match has no
    // matching prose, and letting a newer title hit displace it would make the
    // row claim a body match it no longer has. Otherwise only the same kind may
    // replace, and only when it is newer.
    const preferContent = existing.hit.matchType === 'title' && hit.matchType === 'content'
    const sameKindNewer = existing.hit.matchType === hit.matchType
      && hit.timestamp > existing.hit.timestamp
    if (preferContent || sameKindNewer) existing.hit = hit
  }

  const ranked = [...bySession.values()].map(group => {
    const matchedTerms = [...group.terms]
    const row: RelatedRow = {
      sessionId: group.sessionId,
      title: typeof group.hit.title === 'string' ? group.hit.title : '',
      project: typeof group.hit.project === 'string' ? group.hit.project : '',
      engine: group.hit.engine === 'codex' ? 'codex' : 'claude',
      timestamp: Number.isFinite(group.hit.timestamp) ? group.hit.timestamp : 0,
      matchType: group.hit.matchType === 'title' ? 'title' : 'content',
      termsHit: matchedTerms.length,
      matchedTerms: matchedTerms.slice(0, RELATED_MAX_TERMS_SHOWN),
    }
    return row
  })

  ranked.sort((a, b) => {
    if (b.termsHit !== a.termsHit) return b.termsHit - a.termsHit
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp
    if (a.sessionId === b.sessionId) return 0
    return a.sessionId < b.sessionId ? -1 : 1
  })

  // A caller asking for "at least zero" still gets one row: a result list that
  // is empty because of an arithmetic clamp would read as "nothing matched".
  const requested = typeof opts.limit === 'number' && Number.isFinite(opts.limit)
    ? Math.floor(opts.limit)
    : RELATED_DEFAULT_LIMIT
  return ranked.slice(0, Math.max(1, requested))
}
