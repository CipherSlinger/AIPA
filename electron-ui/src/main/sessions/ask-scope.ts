/**
 * Scope helpers for "Ask AIPA about your history".
 *
 * A department page can ask a question of that department's conversations
 * only. The renderer therefore sends a list of session ids, and main must
 * retrieve evidence from exactly those transcripts — never from the machine's
 * whole history. These helpers are pure (no fs, no Electron) so both the IPC
 * boundary and the digest collector can share the same rules and a harness can
 * exercise them without a live app.
 */

/** Most session ids one ask may name. The rest are dropped, visibly. */
export const MAX_SCOPE_SESSIONS = 500

/**
 * Hits requested per term per reader when a scope is active. Far above the
 * unscoped 20: a department's sessions can sit deep in a global per-term
 * ranking, so a 20-hit slice would be filtered down to nothing and the ask
 * would report silence that is not there.
 */
export const SCOPED_SEARCH_LIMIT = 100

export interface ParsedScope {
  ids: string[]
  /** True only when more distinct, well-formed ids arrived than the cap. */
  truncated: boolean
}

/**
 * Normalize the renderer-supplied scope.
 *
 * `null` means no scope was requested, so retrieval searches everything.
 * An ARRAY means scoping was requested — including `[]`, which is an empty
 * scope and must stay empty rather than quietly becoming a global search: the
 * caller asked for one department, not "whatever is on disk".
 *
 * Never throws. Non-string entries, empty/whitespace ids and duplicates are
 * dropped; the first occurrence of an id wins, so the surviving order is the
 * caller's order.
 */
export function parseScopeSessionIds(raw: unknown): ParsedScope | null {
  if (!Array.isArray(raw)) return null

  const seen = new Set<string>()
  const ids: string[] = []
  let truncated = false

  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    if (ids.length >= MAX_SCOPE_SESSIONS) {
      truncated = true
      continue
    }
    ids.push(id)
  }

  return { ids, truncated }
}

/**
 * Drop every match whose session is outside the allowed set.
 *
 * With `allowed === null` (unscoped) the input array is returned as-is — no
 * copy, because the caller owns it and the collector only reads. With a set,
 * a new array is returned in the input's order. Membership is an exact string
 * comparison: session ids are opaque and case-sensitive, and folding case
 * could admit a transcript the caller did not name.
 */
export function filterHistoryMatches<T extends { hit: { sessionId: string } }>(
  matches: T[],
  allowed: ReadonlySet<string> | null,
): T[] {
  if (!allowed) return matches
  return matches.filter(match => allowed.has(match.hit.sessionId))
}

/**
 * Tell the model its evidence is a slice of the machine, not the whole of it.
 *
 * Deliberately anonymous: the department's display name never enters the
 * prompt. The renderer already shows which department is being asked, and the
 * name is untrusted display text that must not become model instruction.
 */
export function scopeInstruction(locale: string): string {
  if (/^zh/i.test(locale)) {
    return '注意：以上片段只取自本机对话记录中的一部分（某个部门的归档），不是全部历史。'
      + '不要凭记忆作答，也不要假定其他对话存在；如果这些片段无法回答该问题，请直接说明该部门的记录里没有找到相关内容。'
  }
  return 'Note: the excerpts above were retrieved only from a subset of this machine\'s transcripts '
    + '(one department\'s archive), not the whole history. Do not answer from memory or assume '
    + 'other conversations exist; if these excerpts do not answer the question, say that the '
    + 'department\'s history does not show it.'
}
