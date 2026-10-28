/**
 * "Related past conversations" — collect the other local transcripts that
 * share words with the open conversation.
 *
 * This is lexical retrieval, not semantic similarity: the probe terms come
 * from the conversation's own prose, and a session is related because those
 * exact words occur in it. No model is called and no transcript leaves the
 * machine.
 *
 * The open conversation is excluded by session id. The caller (the chat header)
 * passes the id it already has; this module never tries to recognise the
 * conversation by title or folder, because either could hide a genuinely
 * different session.
 */
import {
  extractSearchTerms,
  wholeStringProbe,
  historyIndexBuilding,
} from './ask-history'
import { searchSessions as searchCodexSessions } from '../codex/codex-session-reader'
import { searchSessions as searchClaudeSessions } from './session-reader'
import { rankRelatedMatches, type RelatedMatch, type RelatedRow } from './related-rank'
import { createLogger } from '../utils/logger'

const log = createLogger('related-sessions')

/**
 * Prose handed to term extraction. A long conversation would otherwise spend
 * every probe on its opening turns; 8,000 characters cover the recent part,
 * which is what "this conversation" means to the user.
 */
export const RELATED_MAX_TEXT_CHARS = 8000

/** Hits per term per reader. More than this is noise for a four-row popover. */
const SEARCH_LIMIT = 20
/** Terms extracted at most; each costs a pair of index scans. */
const MAX_PROBES = 6

export interface CollectRelatedInput {
  text: string
  excludeSessionId?: string
  limit?: number
}

export interface CollectRelatedResult {
  rows: RelatedRow[]
  indexing: boolean
  reason?: 'noTerms' | 'failed'
}

/** Trim and clip without splitting a surrogate pair. */
function clipText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  let cut = max
  const last = trimmed.charCodeAt(cut - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1
  return trimmed.slice(0, cut)
}

/**
 * The terms to search for, most informative first.
 *
 * `extractSearchTerms` gives the words and aligned Chinese bigrams; the whole
 * string is appended when the text is a short noun phrase, because a
 * verbatim phrase beats its fragments. The probe list is deduplicated so the
 * same term is never searched twice.
 */
export function buildRelatedProbes(text: string): string[] {
  const clipped = clipText(text, RELATED_MAX_TEXT_CHARS)
  if (!clipped) return []
  const probes = extractSearchTerms(clipped, MAX_PROBES)
  const whole = wholeStringProbe(clipped)
  if (whole && !probes.includes(whole)) probes.push(whole)
  return probes
}

/**
 * Search both transcript indexes for every probe and rank the merged hits.
 *
 * Probes are issued one at a time. Both readers keep a module-level epoch that
 * cancels a superseded query, so firing terms concurrently would have each
 * term cancel the previous one and silently return nothing. Within one term
 * codex and claude do run in parallel — they are separate readers and cannot
 * cancel each other.
 *
 * A zero-row answer distinguishes two very different situations: `noTerms`
 * means there was no prose to search for, while `indexing` means the history
 * exists but its index is still being built, so the empty list is provisional.
 */
export async function collectRelatedSessions(
  input: CollectRelatedInput,
): Promise<CollectRelatedResult> {
  const text = typeof input?.text === 'string' ? input.text : ''
  const probes = buildRelatedProbes(text)
  if (probes.length === 0) {
    // An answer with no terms is not an empty history; still report the index
    // state so the UI can tell "too little prose" from "still indexing".
    return { rows: [], indexing: historyIndexBuilding(), reason: 'noTerms' }
  }

  try {
    const matches: RelatedMatch[] = []
    for (const term of probes) {
      const [codexHits, claudeHits] = await Promise.all([
        searchCodexSessions(term, SEARCH_LIMIT),
        searchClaudeSessions(term, SEARCH_LIMIT),
      ])
      for (const hit of codexHits) matches.push({ term, hit })
      for (const hit of claudeHits) matches.push({ term, hit })
    }

    const rows = rankRelatedMatches(matches, {
      excludeSessionId: input.excludeSessionId,
      limit: input.limit,
    })
    return {
      rows,
      // Same rule as the ask digest: only a zero-row answer needs this flag.
      // Rows that were found came from indexed transcripts, so a background
      // build cannot change what the list says.
      indexing: rows.length === 0 ? historyIndexBuilding() : false,
    }
  } catch (err) {
    log.warn('Related-conversation search failed:', String(err))
    return { rows: [], indexing: false, reason: 'failed' }
  }
}
